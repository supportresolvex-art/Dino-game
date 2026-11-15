// =========================================================
// SECRET WHATSAPP-STYLE REAL-TIME CHAT & 11-DIGIT UID ENGINE
// - Zero server activity while in Dino Runner game mode
// - Connects ONLY after password unlock
// =========================================================

const ChatApp = {
  isUnlocked: false,
  isAdminSession: false,
  isDummySession: false,
  myUID: null,
  myProfile: null,
  appConfig: { ...DEFAULT_APP_CONFIG },
  activePeerUID: null,
  contactsData: {},
  listeners: [],
  typingTimeout: null,

  init() {
    this.bindUIEvents();
    AdminPanel.init();
  },

  bindUIEvents() {
    document.getElementById("vault-unlock-btn").addEventListener("click", () => this.handlePasswordSubmit());
    document.getElementById("vault-password-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handlePasswordSubmit();
    });

    document.getElementById("setup-dp-input").addEventListener("change", async (e) => {
      if (e.target.files && e.target.files[0]) {
        const compressed = await MediaEngine.compressAvatar(e.target.files[0]);
        document.getElementById("setup-dp-preview").src = compressed;
      }
    });

    document.getElementById("save-profile-btn").addEventListener("click", () => this.completeProfileSetup());

    document.getElementById("copy-my-uid-btn").addEventListener("click", () => {
      if (!this.myUID) return;
      navigator.clipboard?.writeText(this.myUID);
      showToast("📋 Copied UID: " + this.myUID);
    });

    document.getElementById("new-chat-btn").addEventListener("click", () => {
      document.getElementById("search-uid-input").value = "";
      document.getElementById("uid-search-error").classList.add("hidden");
      document.getElementById("find-uid-modal").classList.remove("hidden");
    });

    document.getElementById("search-uid-submit").addEventListener("click", () => this.findAndOpenUID());

    document.getElementById("chat-search-input").addEventListener("input", (e) => {
      const q = e.target.value.trim();
      this.renderContactsList(q);
    });

    document.getElementById("my-header-dp").addEventListener("click", () => {
      if (this.isDummySession || !this.myProfile) return;
      document.getElementById("edit-dp-preview").src = this.myProfile.dp || DEFAULT_AVATAR;
      document.getElementById("edit-uid-label").textContent = this.myUID;
      document.getElementById("edit-name-input").value = this.myProfile.name || "";
      document.getElementById("edit-bio-input").value = this.myProfile.bio || "";
      document.getElementById("edit-profile-modal").classList.remove("hidden");
    });

    document.getElementById("edit-dp-input").addEventListener("change", async (e) => {
      if (e.target.files && e.target.files[0]) {
        const compressed = await MediaEngine.compressAvatar(e.target.files[0]);
        document.getElementById("edit-dp-preview").src = compressed;
      }
    });

    document.getElementById("update-profile-btn").addEventListener("click", async () => {
      const name = document.getElementById("edit-name-input").value.trim() || "Agent";
      const bio = document.getElementById("edit-bio-input").value.trim() || "Available";
      const dp = document.getElementById("edit-dp-preview").src || DEFAULT_AVATAR;

      await db.ref(`users/${this.myUID}`).update({ name, bio, dp });
      this.myProfile = { ...this.myProfile, name, bio, dp };
      document.getElementById("my-header-name").textContent = name;
      document.getElementById("my-header-dp").src = dp;
      document.getElementById("edit-profile-modal").classList.add("hidden");
      showToast("✅ Profile Updated!");
    });

    document.getElementById("back-to-chats-btn").addEventListener("click", () => {
      this.closeConversation();
    });

    document.getElementById("clear-chat-btn").addEventListener("click", async () => {
      if (this.isDummySession || !this.activePeerUID) return;
      if (!confirm("Clear all messages in this chat?")) return;
      const roomId = this.getRoomId(this.myUID, this.activePeerUID);
      await db.ref(`chats/${roomId}/messages`).remove();
      showToast("🗑️ Chat cleared.");
    });

    document.getElementById("emoji-toggle-btn").addEventListener("click", () => {
      document.getElementById("emoji-bar").classList.toggle("hidden");
    });

    document.querySelectorAll(".emoji-item").forEach((el) => {
      el.addEventListener("click", () => {
        const input = document.getElementById("message-input");
        input.value += el.textContent;
        input.focus();
      });
    });

    document.getElementById("view-peer-profile-btn").addEventListener("click", async () => {
      if (!this.activePeerUID || this.isDummySession) return;
      const snap = await db.ref(`users/${this.activePeerUID}`).once("value");
      const peer = snap.val();
      if (!peer) return;
      document.getElementById("info-peer-dp").src = peer.dp || DEFAULT_AVATAR;
      document.getElementById("info-peer-name").textContent = peer.name || "User";
      document.getElementById("info-peer-uid").textContent = "UID: " + peer.uid;
      document.getElementById("info-peer-bio").textContent = peer.bio || "Hey there!";
      document.getElementById("peer-profile-modal").classList.remove("hidden");
    });

    document.getElementById("send-msg-btn").addEventListener("click", () => this.sendTextMessage());
    document.getElementById("message-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.sendTextMessage();
    });

    document.getElementById("message-input").addEventListener("input", () => {
      if (this.isDummySession || !this.activePeerUID) return;
      const roomId = this.getRoomId(this.myUID, this.activePeerUID);
      db.ref(`chats/${roomId}/typing/${this.myUID}`).set(true);
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        db.ref(`chats/${roomId}/typing/${this.myUID}`).set(false);
      }, 1500);
    });

    document.getElementById("chat-media-input").addEventListener("change", async (e) => {
      if (e.target.files && e.target.files[0]) {
        await this.sendMediaFile(e.target.files[0]);
        e.target.value = "";
      }
    });

    document.getElementById("panic-lock-btn").addEventListener("click", () => this.lockAndExitToGame());
  },

  async handlePasswordSubmit() {
    const input = document.getElementById("vault-password-input").value.trim();
    const errEl = document.getElementById("vault-error-msg");
    errEl.classList.add("hidden");

    if (!input) return;

    try {
      const cfgSnap = await db.ref("config").once("value");
      if (cfgSnap.exists()) {
        this.appConfig = { ...DEFAULT_APP_CONFIG, ...cfgSnap.val() };
      } else {
        await db.ref("config").set(DEFAULT_APP_CONFIG);
      }
    } catch (e) {}

    if (input === this.appConfig.adminPass) {
      this.isAdminSession = true;
      this.isDummySession = false;
      document.getElementById("vault-auth-modal").classList.add("hidden");
      await this.enterRealVault();
    } else if (input === this.appConfig.userPass) {
      if (this.appConfig.maintenanceMode) {
        errEl.textContent = "🚧 App is currently under Admin maintenance.";
        errEl.classList.remove("hidden");
        return;
      }
      this.isAdminSession = false;
      this.isDummySession = false;
      document.getElementById("vault-auth-modal").classList.add("hidden");
      await this.enterRealVault();
    } else if (input === this.appConfig.dummyPass) {
      this.isAdminSession = false;
      this.isDummySession = true;
      document.getElementById("vault-auth-modal").classList.add("hidden");
      this.enterDummyVault();
    } else {
      errEl.textContent = "❌ Incorrect access key.";
      errEl.classList.remove("hidden");
    }
  },

  enterDummyVault() {
    this.isUnlocked = true;
    document.getElementById("game-view").classList.add("hidden");
    document.getElementById("chat-view").classList.remove("hidden");
    document.getElementById("open-admin-panel-btn").classList.add("hidden");

    const dummyUID = "90128475610";
    document.getElementById("my-header-uid").textContent = dummyUID;
    document.getElementById("my-header-name").textContent = "Guest Player";
    document.getElementById("my-header-dp").src = DEFAULT_AVATAR;
    document.getElementById("contacts-list").innerHTML = `
      <div class="empty-state">
        <p>💬 No conversations yet</p>
        <small>Tap <strong>➕</strong> above to enter an 11-digit UID.</small>
      </div>
    `;
  },

  async enterRealVault() {
    let savedUID = localStorage.getItem("dino_vault_uid");

    if (!savedUID || savedUID.length !== 11) {
      const newUID = await this.generateUnique11DigitUID();
      document.getElementById("generated-uid-text").textContent = newUID;
      document.getElementById("setup-dp-preview").src = DEFAULT_AVATAR;
      document.getElementById("profile-setup-modal").classList.remove("hidden");
      return;
    }

    const userSnap = await db.ref(`users/${savedUID}`).once("value");
    if (!userSnap.exists()) {
      const newUID = await this.generateUnique11DigitUID();
      document.getElementById("generated-uid-text").textContent = newUID;
      document.getElementById("setup-dp-preview").src = DEFAULT_AVATAR;
      document.getElementById("profile-setup-modal").classList.remove("hidden");
      return;
    }

    const profile = userSnap.val();
    if (profile.blocked && !this.isAdminSession) {
      showToast("🚫 Access suspended by Administrator.");
      return;
    }

    this.myUID = savedUID;
    this.myProfile = profile;
    this.launchChatScreen();
  },

  async generateUnique11DigitUID() {
    while (true) {
      const first = Math.floor(1 + Math.random() * 9);
      const rest = Math.floor(1000000000 + Math.random() * 9000000000);
      const candidate = `${first}${rest}`;
      const check = await db.ref(`users/${candidate}`).once("value");
      if (!check.exists()) return candidate;
    }
  },

  async completeProfileSetup() {
    const uid = document.getElementById("generated-uid-text").textContent.trim();
    const name = document.getElementById("setup-name-input").value.trim() || "User_" + uid.slice(-4);
    const bio = document.getElementById("setup-bio-input").value.trim() || "Hey there! Using Dino Stealth.";
    const dp = document.getElementById("setup-dp-preview").src || DEFAULT_AVATAR;

    const profile = {
      uid,
      name,
      bio,
      dp,
      online: true,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      blocked: false
    };

    await db.ref(`users/${uid}`).set(profile);
    localStorage.setItem("dino_vault_uid", uid);

    this.myUID = uid;
    this.myProfile = profile;
    document.getElementById("profile-setup-modal").classList.add("hidden");
    this.launchChatScreen();
  },

  launchChatScreen() {
    this.isUnlocked = true;
    document.getElementById("game-view").classList.add("hidden");
    document.getElementById("chat-view").classList.remove("hidden");

    if (this.isAdminSession) {
      document.getElementById("open-admin-panel-btn").classList.remove("hidden");
    } else {
      document.getElementById("open-admin-panel-btn").classList.add("hidden");
    }

    document.getElementById("my-header-uid").textContent = this.myUID;
    document.getElementById("my-header-name").textContent = this.myProfile.name;
    document.getElementById("my-header-dp").src = this.myProfile.dp || DEFAULT_AVATAR;

    this.setupPresenceAndLiveListeners();
  },

  setupPresenceAndLiveListeners() {
    this.detachAllListeners();

    const myStatusRef = db.ref(`users/${this.myUID}`);
    myStatusRef.update({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    myStatusRef.onDisconnect().update({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });

    const blockRef = db.ref(`users/${this.myUID}/blocked`);
    blockRef.on("value", (snap) => {
      if (snap.val() === true && !this.isAdminSession) {
        showToast("🚫 Your UID was blocked by Admin.");
        this.lockAndExitToGame();
      }
    });
    this.listeners.push(blockRef);

    const cfgRef = db.ref("config");
    cfgRef.on("value", (snap) => {
      if (!snap.exists()) return;
      this.appConfig = { ...DEFAULT_APP_CONFIG, ...snap.val() };
      const bar = document.getElementById("global-broadcast-bar");
      if (this.appConfig.broadcast) {
        document.getElementById("broadcast-text").textContent = this.appConfig.broadcast;
        bar.classList.remove("hidden");
      } else {
        bar.classList.add("hidden");
      }

      if (this.appConfig.maintenanceMode && !this.isAdminSession) {
        showToast("🚧 Maintenance mode enabled by Admin.");
        this.lockAndExitToGame();
      }
    });
    this.listeners.push(cfgRef);

    const inboxRef = db.ref(`userChats/${this.myUID}`);
    inboxRef.on("value", async (snap) => {
      this.contactsData = snap.val() || {};
      let totalUnread = 0;

      const uids = Object.keys(this.contactsData);
      await Promise.all(
        uids.map(async (peerUid) => {
          totalUnread += this.contactsData[peerUid].unread || 0;
          const pSnap = await db.ref(`users/${peerUid}`).once("value");
          if (pSnap.exists()) {
            this.contactsData[peerUid].profile = pSnap.val();
          }
        })
      );

      const badge = document.getElementById("total-unread-badge");
      if (totalUnread > 0) {
        badge.textContent = totalUnread;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }

      this.renderContactsList(document.getElementById("chat-search-input").value.trim());
    });
    this.listeners.push(inboxRef);
  },

  renderContactsList(filter = "") {
    const listEl = document.getElementById("contacts-list");
    const entries = Object.entries(this.contactsData).sort(
      (a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0)
    );

    const filtered = entries.filter(([uid, item]) => {
      if (!filter) return true;
      const name = (item.profile?.name || "").toLowerCase();
      return uid.includes(filter) || name.includes(filter.toLowerCase());
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>💬 No matching chats</p>
          <small>Tap <strong>➕</strong> to start a chat with an 11-digit UID.</small>
        </div>
      `;
      return;
    }

    listEl.innerHTML = "";
    filtered.forEach(([peerUid, item]) => {
      const p = item.profile || { name: "UID " + peerUid, dp: DEFAULT_AVATAR, online: false };
      const preview = item.lastMessage ? decodeSecretText(item.lastMessage) : "Tap to chat";
      const timeStr = item.timestamp
        ? new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";

      const div = document.createElement("div");
      div.className = "contact-item";
      div.innerHTML = `
        <div class="contact-avatar-wrap">
          <img src="${p.dp || DEFAULT_AVATAR}" class="avatar-sm" alt="DP" />
          ${p.online ? `<span class="online-dot"></span>` : ""}
        </div>
        <div class="contact-meta">
          <div class="contact-top">
            <h4>${AdminPanel.escapeHtml(p.name)}</h4>
            <span class="contact-time">${timeStr}</span>
          </div>
          <div class="contact-bottom">
            <span class="contact-preview">${AdminPanel.escapeHtml(preview)}</span>
            ${item.unread > 0 ? `<span class="badge-pill">${item.unread}</span>` : ""}
          </div>
        </div>
      `;
      div.addEventListener("click", () => this.openConversation(peerUid, p));
      listEl.appendChild(div);
    });
  },

  async findAndOpenUID() {
    const targetUid = document.getElementById("search-uid-input").value.trim();
    const errEl = document.getElementById("uid-search-error");
    errEl.classList.add("hidden");

    if (!/^\d{11}$/.test(targetUid)) {
      errEl.textContent = "Please enter a valid 11-digit numeric UID.";
      errEl.classList.remove("hidden");
      return;
    }

    if (this.isDummySession) {
      errEl.textContent = "No user found with UID " + targetUid;
      errEl.classList.remove("hidden");
      return;
    }

    if (targetUid === this.myUID) {
      errEl.textContent = "You cannot message your own UID.";
      errEl.classList.remove("hidden");
      return;
    }

    const snap = await db.ref(`users/${targetUid}`).once("value");
    if (!snap.exists()) {
      errEl.textContent = "UID not found. Check the 11 digits and try again.";
      errEl.classList.remove("hidden");
      return;
    }

    const peerProfile = snap.val();
    document.getElementById("find-uid-modal").classList.add("hidden");
    this.openConversation(targetUid, peerProfile);
  },

  getRoomId(uidA, uidB) {
    return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
  },

  openConversation(peerUid, peerProfile) {
    this.activePeerUID = peerUid;
    document.getElementById("chat-list-screen").classList.add("hidden");
    document.getElementById("conversation-screen").classList.remove("hidden");
    document.getElementById("emoji-bar").classList.add("hidden");

    document.getElementById("peer-dp").src = peerProfile.dp || DEFAULT_AVATAR;
    document.getElementById("peer-name").textContent = peerProfile.name || peerUid;

    db.ref(`userChats/${this.myUID}/${peerUid}/unread`).set(0);

    const roomId = this.getRoomId(this.myUID, peerUid);

    if (this._peerStatusRef) this._peerStatusRef.off();
    if (this._peerTypingRef) this._peerTypingRef.off();
    if (this._roomMsgsRef) this._roomMsgsRef.off();

    let peerOnline = false;
    let peerLastSeen = null;
    let peerTyping = false;

    const updateHeaderStatus = () => {
      const statusEl = document.getElementById("peer-status");
      if (peerTyping) {
        statusEl.textContent = "typing...";
        statusEl.className = "status-text online";
      } else if (peerOnline) {
        statusEl.textContent = "online";
        statusEl.className = "status-text online";
      } else if (peerLastSeen) {
        const d = new Date(peerLastSeen);
        statusEl.textContent = "last seen " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        statusEl.className = "status-text";
      } else {
        statusEl.textContent = "offline";
        statusEl.className = "status-text";
      }
    };

    this._peerStatusRef = db.ref(`users/${peerUid}`);
    this._peerStatusRef.on("value", (s) => {
      const val = s.val() || {};
      peerOnline = !!val.online;
      peerLastSeen = val.lastSeen;
      updateHeaderStatus();
    });

    this._peerTypingRef = db.ref(`chats/${roomId}/typing/${peerUid}`);
    this._peerTypingRef.on("value", (s) => {
      peerTyping = !!s.val();
      updateHeaderStatus();
    });

    this._roomMsgsRef = db.ref(`chats/${roomId}/messages`).limitToLast(100);
    this._roomMsgsRef.on("value", (snap) => {
      const box = document.getElementById("messages-container");
      box.innerHTML = "";
      const now = Date.now();

      snap.forEach((msgSnap) => {
        const msgId = msgSnap.key;
        const msg = msgSnap.val();
        if (!msg) return;

        if (msg.sender === peerUid && !msg.read) {
          db.ref(`chats/${roomId}/messages/${msgId}/read`).set(true);
          db.ref(`userChats/${this.myUID}/${peerUid}/unread`).set(0);
        }

        if ((msg.type === "image" || msg.type === "video") && !msg.mediaExpired && msg.expiresAt && now > msg.expiresAt) {
          db.ref(`chats/${roomId}/messages/${msgId}`).update({
            mediaData: null,
            mediaExpired: true
          });
          msg.mediaData = null;
          msg.mediaExpired = true;
        }

        const isMine = msg.sender === this.myUID;
        const bubble = document.createElement("div");
        bubble.className = `msg-bubble ${isMine ? "msg-sent" : "msg-received"}`;

        let innerContent = "";
        if (msg.type === "image") {
          if (msg.mediaExpired || !msg.mediaData) {
            innerContent = `<div class="expired-media-tag">📷 Photo auto-deleted from server</div>`;
          } else {
            innerContent = `<img src="${msg.mediaData}" class="msg-media-thumb" alt="Photo" />`;
          }
        } else if (msg.type === "video") {
          if (msg.mediaExpired || !msg.mediaData) {
            innerContent = `<div class="expired-media-tag">🎥 Video auto-deleted from server</div>`;
          } else {
            innerContent = `<video src="${msg.mediaData}" class="msg-media-thumb" muted playsinline></video><small>▶ Tap to play video</small>`;
          }
        } else {
          innerContent = `<div>${AdminPanel.escapeHtml(decodeSecretText(msg.text))}</div>`;
        }

        const timeStr = msg.timestamp
          ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";
        const ticks = isMine ? `<span class="ticks ${msg.read ? "read" : ""}">${msg.read ? "✓✓" : "✓"}</span>` : "";

        bubble.innerHTML = `
          ${innerContent}
          <div class="msg-footer">
            <span>${timeStr}</span>
            ${ticks}
          </div>
        `;

        if ((msg.type === "image" || msg.type === "video") && msg.mediaData && !msg.mediaExpired) {
          bubble.addEventListener("click", () => this.openMediaViewer(msg.type, msg.mediaData));
        }

        box.appendChild(bubble);
      });

      box.scrollTop = box.scrollHeight;
    });
  },

  closeConversation() {
    this.activePeerUID = null;
    if (this._peerStatusRef) this._peerStatusRef.off();
    if (this._peerTypingRef) this._peerTypingRef.off();
    if (this._roomMsgsRef) this._roomMsgsRef.off();
    document.getElementById("conversation-screen").classList.add("hidden");
    document.getElementById("chat-list-screen").classList.remove("hidden");
  },

  async sendTextMessage() {
    if (this.isDummySession || !this.activePeerUID) return;
    const input = document.getElementById("message-input");
    const rawText = input.value.trim();
    if (!rawText) return;

    input.value = "";
    document.getElementById("emoji-bar").classList.add("hidden");
    const cipherText = encodeSecretText(rawText);
    const roomId = this.getRoomId(this.myUID, this.activePeerUID);
    const now = Date.now();

    await db.ref(`chats/${roomId}/messages`).push({
      sender: this.myUID,
      type: "text",
      text: cipherText,
      timestamp: now,
      read: false
    });

    await db.ref(`chats/${roomId}/typing/${this.myUID}`).set(false);

    await db.ref(`userChats/${this.myUID}/${this.activePeerUID}`).update({
      lastMessage: cipherText,
      timestamp: now,
      unread: 0
    });

    const peerInboxRef = db.ref(`userChats/${this.activePeerUID}/${this.myUID}`);
    const peerSnap = await peerInboxRef.once("value");
    const prevUnread = (peerSnap.val() && peerSnap.val().unread) || 0;

    await peerInboxRef.update({
      lastMessage: cipherText,
      timestamp: now,
      unread: prevUnread + 1
    });
  },

  async sendMediaFile(file) {
    if (this.isDummySession || !this.activePeerUID) return;
    if (this.appConfig.mediaEnabled === false) {
      showToast("🚫 Media sharing is currently disabled by Admin.");
      return;
    }

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      showToast("⚠️ Only photos and videos are supported.");
      return;
    }

    const progBar = document.getElementById("media-progress-bar");
    const progText = document.getElementById("media-progress-text");
    progBar.classList.remove("hidden");

    try {
      let mediaData = null;
      let previewLabel = "";

      if (isImage) {
        progText.textContent = "🗜️ Compressing photo to save server space...";
        mediaData = await MediaEngine.compressChatImage(file);
        previewLabel = encodeSecretText("📷 Photo");
      } else {
        progText.textContent = "🗜️ Compressing video (360p fast mode)...";
        const res = await MediaEngine.compressChatVideo(file, this.appConfig);
        mediaData = res.url;
        previewLabel = encodeSecretText("🎥 Video");
      }

      const roomId = this.getRoomId(this.myUID, this.activePeerUID);
      const now = Date.now();
      const ttl = this.appConfig.mediaTTL || 600000;

      await db.ref(`chats/${roomId}/messages`).push({
        sender: this.myUID,
        type: isImage ? "image" : "video",
        mediaData,
        mediaExpired: false,
        expiresAt: now + ttl,
        timestamp: now,
        read: false
      });

      await db.ref(`userChats/${this.myUID}/${this.activePeerUID}`).update({
        lastMessage: previewLabel,
        timestamp: now,
        unread: 0
      });

      const peerInboxRef = db.ref(`userChats/${this.activePeerUID}/${this.myUID}`);
      const peerSnap = await peerInboxRef.once("value");
      const prevUnread = (peerSnap.val() && peerSnap.val().unread) || 0;

      await peerInboxRef.update({
        lastMessage: previewLabel,
        timestamp: now,
        unread: prevUnread + 1
      });
    } catch (err) {
      showToast("⚠️ " + (err.message || "Failed to send media"));
    } finally {
      progBar.classList.add("hidden");
    }
  },

  openMediaViewer(type, src) {
    const imgEl = document.getElementById("viewer-img");
    const vidEl = document.getElementById("viewer-video");
    imgEl.classList.add("hidden");
    vidEl.classList.add("hidden");
    vidEl.pause();

    if (type === "image") {
      imgEl.src = src;
      imgEl.classList.remove("hidden");
    } else {
      vidEl.src = src;
      vidEl.classList.remove("hidden");
      vidEl.play();
    }
    document.getElementById("media-viewer-modal").classList.remove("hidden");
  },

  detachAllListeners() {
    this.listeners.forEach((ref) => ref.off());
    this.listeners = [];
    if (this._peerStatusRef) this._peerStatusRef.off();
    if (this._peerTypingRef) this._peerTypingRef.off();
    if (this._roomMsgsRef) this._roomMsgsRef.off();
    AdminPanel.detachUsersMonitor();
  },

  lockAndExitToGame() {
    if (this.myUID && !this.isDummySession) {
      db.ref(`users/${this.myUID}`).update({
        online: false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      });
    }

    this.detachAllListeners();
    this.isUnlocked = false;
    this.isAdminSession = false;
    this.isDummySession = false;
    this.activePeerUID = null;

    document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
    document.getElementById("viewer-video")?.pause();

    document.getElementById("conversation-screen").classList.add("hidden");
    document.getElementById("chat-list-screen").classList.remove("hidden");
    document.getElementById("chat-view").classList.add("hidden");
    document.getElementById("game-view").classList.remove("hidden");
  }
};
