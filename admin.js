// =========================================================
// SECRET MASTER ADMIN PANEL (PRIVACY-LOCKED)
// - Admin CANNOT view private messages between users
// - Admin controls passwords, bans, broadcast, media TTL & purge
// =========================================================

const AdminPanel = {
  isOpen: false,
  usersListenerRef: null,

  init() {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".admin-tab-pane").forEach((p) => p.classList.add("hidden"));
        tab.classList.add("active");
        document.getElementById(tab.dataset.tab).classList.remove("hidden");
      });
    });

    document.getElementById("open-admin-panel-btn").addEventListener("click", () => {
      if (!ChatApp.isAdminSession) return;
      this.open();
    });

    document.getElementById("admin-save-config-btn").addEventListener("click", async () => {
      const adminPass = document.getElementById("admin-cfg-adminpass").value.trim() || "Admin890";
      const userPass = document.getElementById("admin-cfg-userpass").value.trim() || "suraj5";
      const dummyPass = document.getElementById("admin-cfg-dummypass").value.trim() || "0000";
      const maintenanceMode = document.getElementById("admin-cfg-maintenance").checked;
      const mediaEnabled = document.getElementById("admin-cfg-media-enabled").checked;
      const mediaTTL = parseInt(document.getElementById("admin-cfg-media-ttl").value, 10) || 600000;
      const broadcast = document.getElementById("admin-cfg-broadcast").value.trim();

      await db.ref("config").update({
        adminPass,
        userPass,
        dummyPass,
        maintenanceMode,
        mediaEnabled,
        mediaTTL,
        broadcast
      });
      showToast("✅ Live App Settings Updated!");
    });

    document.getElementById("admin-save-cloud-btn").addEventListener("click", async () => {
      const cloudName = document.getElementById("admin-cfg-cloudname").value.trim();
      const cloudPreset = document.getElementById("admin-cfg-cloudpreset").value.trim();
      await db.ref("config").update({ cloudName, cloudPreset });
      showToast("☁️ Cloudinary Config Saved!");
    });

    document.getElementById("admin-purge-media-btn").addEventListener("click", async () => {
      if (!confirm("Delete all temporary photos & videos across server? Text chats will stay safe.")) return;
      showToast("🧹 Scanning & purging media...");
      try {
        const chatsSnap = await db.ref("chats").once("value");
        const updates = {};
        let purgedCount = 0;

        chatsSnap.forEach((roomSnap) => {
          const roomId = roomSnap.key;
          const msgsSnap = roomSnap.child("messages");
          msgsSnap.forEach((msgSnap) => {
            const msg = msgSnap.val();
            if (msg && (msg.type === "image" || msg.type === "video") && !msg.mediaExpired) {
              updates[`chats/${roomId}/messages/${msgSnap.key}/mediaData`] = null;
              updates[`chats/${roomId}/messages/${msgSnap.key}/mediaExpired`] = true;
              purgedCount++;
            }
          });
        });

        if (Object.keys(updates).length > 0) {
          await db.ref().update(updates);
        }
        showToast(`✅ Purged ${purgedCount} media files! Text chats untouched.`);
      } catch (err) {
        showToast("⚠️ Error purging media: " + err.message);
      }
    });
  },

  open() {
    this.isOpen = true;
    const cfg = ChatApp.appConfig;
    document.getElementById("admin-cfg-adminpass").value = cfg.adminPass || "Admin890";
    document.getElementById("admin-cfg-userpass").value = cfg.userPass || "suraj5";
    document.getElementById("admin-cfg-dummypass").value = cfg.dummyPass || "0000";
    document.getElementById("admin-cfg-maintenance").checked = !!cfg.maintenanceMode;
    document.getElementById("admin-cfg-media-enabled").checked = cfg.mediaEnabled !== false;
    document.getElementById("admin-cfg-media-ttl").value = String(cfg.mediaTTL || 600000);
    document.getElementById("admin-cfg-broadcast").value = cfg.broadcast || "";
    document.getElementById("admin-cfg-cloudname").value = cfg.cloudName || "";
    document.getElementById("admin-cfg-cloudpreset").value = cfg.cloudPreset || "";

    document.getElementById("admin-panel-modal").classList.remove("hidden");
    this.attachUsersMonitor();
  },

  attachUsersMonitor() {
    this.detachUsersMonitor();
    this.usersListenerRef = db.ref("users");
    this.usersListenerRef.on("value", (snap) => {
      const listEl = document.getElementById("admin-users-list");
      listEl.innerHTML = "";
      let total = 0;
      let online = 0;

      snap.forEach((child) => {
        const u = child.val();
        if (!u || !u.uid) return;
        total++;
        if (u.online) online++;

        const isSelf = u.uid === ChatApp.myUID;
        const row = document.createElement("div");
        row.className = "admin-user-row";
        row.innerHTML = `
          <div class="admin-user-info">
            <img src="${u.dp || DEFAULT_AVATAR}" class="avatar-sm" alt="DP" />
            <div>
              <strong>${this.escapeHtml(u.name || "Unknown")} ${u.online ? "🟢" : "⚪"}</strong>
              <small>UID: ${u.uid} ${u.blocked ? "• 🚫 BLOCKED" : ""}</small>
            </div>
          </div>
          ${
            isSelf
              ? `<span class="uid-chip">YOU</span>`
              : `<button class="block-toggle-btn ${u.blocked ? "unblock" : "block"}" data-uid="${u.uid}" data-blocked="${!!u.blocked}">
                  ${u.blocked ? "UNBLOCK" : "BLOCK"}
                </button>`
          }
        `;
        listEl.appendChild(row);
      });

      document.getElementById("admin-user-count").textContent = total;
      document.getElementById("stat-total-users").textContent = total;
      document.getElementById("stat-online-users").textContent = online;

      listEl.querySelectorAll(".block-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const targetUid = btn.dataset.uid;
          const currentlyBlocked = btn.dataset.blocked === "true";
          await db.ref(`users/${targetUid}/blocked`).set(!currentlyBlocked);
          showToast(!currentlyBlocked ? `🚫 Blocked UID ${targetUid}` : `✅ Unblocked UID ${targetUid}`);
        });
      });
    });
  },

  detachUsersMonitor() {
    if (this.usersListenerRef) {
      this.usersListenerRef.off();
      this.usersListenerRef = null;
    }
  },

  escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }
};
