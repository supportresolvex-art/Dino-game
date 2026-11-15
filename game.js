// =========================================================
// DINO RUNNER 2D GAME + 5-SECOND SETTINGS HOLD TRIGGER
// + AUTO-LOCK ON MINIMIZE & SHAKE-TO-LOCK PANIC GESTURE
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  ChatApp.init();

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.close;
      document.getElementById(targetId)?.classList.add("hidden");
      if (targetId === "media-viewer-modal") {
        document.getElementById("viewer-video")?.pause();
      }
      if (targetId === "admin-panel-modal") {
        AdminPanel.detachUsersMonitor();
      }
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && ChatApp.isUnlocked) {
      ChatApp.lockAndExitToGame();
    }
  });

  let lastShakeTime = 0;
  window.addEventListener("devicemotion", (event) => {
    if (!ChatApp.isUnlocked) return;
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;
    const force = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
    if (force > 36 && Date.now() - lastShakeTime > 1200) {
      lastShakeTime = Date.now();
      ChatApp.lockAndExitToGame();
    }
  });

  const settingsBtn = document.getElementById("settings-btn");
  const holdCircle = settingsBtn.querySelector("circle");
  const HOLD_DURATION = 5000;
  let holdStartTime = null;
  let holdAnimFrame = null;
  let triggeredVault = false;

  const startHold = (e) => {
    e.preventDefault();
    triggeredVault = false;
    holdStartTime = performance.now();
    settingsBtn.classList.add("holding");

    const tick = (now) => {
      if (!holdStartTime) return;
      const elapsed = now - holdStartTime;
      const progress = Math.min(elapsed / HOLD_DURATION, 1);
      if (elapsed > 1200) {
        holdCircle.style.strokeDashoffset = String(120 * (1 - progress));
      }

      if (progress >= 1 && !triggeredVault) {
        triggeredVault = true;
        cancelHold();
        navigator.vibrate?.(60);
        document.getElementById("vault-password-input").value = "";
        document.getElementById("vault-error-msg").classList.add("hidden");
        document.getElementById("vault-auth-modal").classList.remove("hidden");
        setTimeout(() => document.getElementById("vault-password-input").focus(), 120);
        return;
      }
      holdAnimFrame = requestAnimationFrame(tick);
    };
    holdAnimFrame = requestAnimationFrame(tick);
  };

  const endHold = () => {
    if (!holdStartTime) return;
    const elapsed = performance.now() - holdStartTime;
    cancelHold();
    if (!triggeredVault && elapsed < 800) {
      document.getElementById("game-settings-modal").classList.remove("hidden");
    }
  };

  const cancelHold = () => {
    holdStartTime = null;
    settingsBtn.classList.remove("holding");
    holdCircle.style.strokeDashoffset = "120";
    if (holdAnimFrame) cancelAnimationFrame(holdAnimFrame);
  };

  settingsBtn.addEventListener("touchstart", startHold, { passive: false });
  settingsBtn.addEventListener("touchend", endHold);
  settingsBtn.addEventListener("touchcancel", cancelHold);
  settingsBtn.addEventListener("mousedown", startHold);
  settingsBtn.addEventListener("mouseup", endHold);
  settingsBtn.addEventListener("mouseleave", cancelHold);

  let soundEnabled = true;
  let audioCtx = null;

  function playBeep(freq, duration = 0.08, type = "square") {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  document.getElementById("toggle-sound").addEventListener("change", (e) => {
    soundEnabled = e.target.checked;
  });

  document.getElementById("toggle-night").addEventListener("change", (e) => {
    document.getElementById("game-view").classList.toggle("night-mode", e.target.checked);
  });

  let baseSpeed = 6;
  document.getElementById("game-speed-select").addEventListener("change", (e) => {
    baseSpeed = parseInt(e.target.value, 10) || 6;
  });

  const canvas = document.getElementById("dino-canvas");
  const ctx = canvas.getContext("2d");

  let highScore = parseInt(localStorage.getItem("dino_hi_score") || "0", 10);
  document.getElementById("high-score").textContent = String(highScore).padStart(5, "0");

  document.getElementById("reset-highscore-btn").addEventListener("click", () => {
    highScore = 0;
    localStorage.setItem("dino_hi_score", "0");
    document.getElementById("high-score").textContent = "00000";
    showToast("High score reset!");
  });

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  let gameRunning = false;
  let score = 0;
  let speed = baseSpeed;
  let frameCount = 0;
  let obstacles = [];
  let clouds = [];

  const dino = {
    x: 50,
    y: 0,
    w: 38,
    h: 42,
    vy: 0,
    gravity: 0.72,
    jumpForce: -13.2,
    grounded: true,
    ducking: false
  };

  function getGroundY() {
    return Math.round(canvas.height * 0.75);
  }

  function resetGame() {
    resizeCanvas();
    score = 0;
    speed = baseSpeed;
    frameCount = 0;
    obstacles = [];
    clouds = [
      { x: canvas.width * 0.3, y: getGroundY() - 120 },
      { x: canvas.width * 0.75, y: getGroundY() - 150 }
    ];
    dino.h = 42;
    dino.w = 38;
    dino.y = getGroundY() - dino.h;
    dino.vy = 0;
    dino.grounded = true;
    dino.ducking = false;
    gameRunning = true;
    document.getElementById("game-overlay").classList.add("hidden");
    requestAnimationFrame(gameLoop);
  }

  function jump() {
    if (!gameRunning) return;
    if (dino.grounded) {
      dino.vy = dino.jumpForce;
      dino.grounded = false;
      playBeep(520, 0.09);
    }
  }

  function setDuck(isDucking) {
    if (!gameRunning) return;
    dino.ducking = isDucking;
    if (isDucking && dino.grounded) {
      dino.h = 26;
      dino.w = 48;
      dino.y = getGroundY() - dino.h;
    } else if (!isDucking && dino.grounded) {
      dino.h = 42;
      dino.w = 38;
      dino.y = getGroundY() - dino.h;
    }
  }

  document.getElementById("start-game-btn").addEventListener("click", resetGame);
  document.getElementById("mobile-jump-btn").addEventListener("touchstart", (e) => {
    e.preventDefault();
    jump();
  });
  document.getElementById("mobile-jump-btn").addEventListener("mousedown", jump);

  document.getElementById("mobile-duck-btn").addEventListener("touchstart", (e) => {
    e.preventDefault();
    setDuck(true);
  });
  document.getElementById("mobile-duck-btn").addEventListener("touchend", () => setDuck(false));
  document.getElementById("mobile-duck-btn").addEventListener("mousedown", () => setDuck(true));
  document.getElementById("mobile-duck-btn").addEventListener("mouseup", () => setDuck(false));

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    jump();
  });
  canvas.addEventListener("mousedown", jump);

  window.addEventListener("keydown", (e) => {
    if (ChatApp.isUnlocked) return;
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (!gameRunning) resetGame();
      else jump();
    } else if (e.code === "ArrowDown") {
      setDuck(true);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") setDuck(false);
  });

  function spawnObstacle() {
    const groundY = getGroundY();
    const isBird = score > 250 && Math.random() < 0.3;
    if (isBird) {
      const flyHeights = [groundY - 34, groundY - 62];
      obstacles.push({
        type: "bird",
        x: canvas.width + 20,
        y: flyHeights[Math.floor(Math.random() * flyHeights.length)],
        w: 36,
        h: 24
      });
    } else {
      const count = Math.random() < 0.35 ? 2 : 1;
      const h = Math.random() < 0.5 ? 36 : 46;
      obstacles.push({
        type: "cactus",
        x: canvas.width + 20,
        y: groundY - h,
        w: 20 * count,
        h
      });
    }
  }

  function drawDino(color) {
    ctx.fillStyle = color;
    const x = dino.x;
    const y = dino.y;

    if (dino.ducking) {
      ctx.fillRect(x, y + 6, 42, 16);
      ctx.fillRect(x + 34, y + 2, 14, 14);
      ctx.clearRect(x + 41, y + 5, 3, 3);
    } else {
      ctx.fillRect(x + 16, y, 20, 16);
      ctx.clearRect(x + 21, y + 4, 3, 3);
      ctx.fillRect(x + 8, y + 14, 18, 18);
      ctx.fillRect(x, y + 18, 10, 10);
      ctx.fillRect(x + 26, y + 18, 6, 4);

      const legOffset = dino.grounded && Math.floor(frameCount / 6) % 2 === 0 ? 4 : 0;
      ctx.fillRect(x + 10, y + 32, 5, 10 - legOffset);
      ctx.fillRect(x + 20, y + 32, 5, 6 + legOffset);
    }
  }

  function gameLoop() {
    if (!gameRunning) return;
    frameCount++;

    const isNight = document.getElementById("game-view").classList.contains("night-mode");
    const fgColor = isNight ? "#e8eaed" : "#535353";
    const mutedColor = isNight ? "#5f6368" : "#bdbdbd";
    const groundY = getGroundY();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = mutedColor;
    clouds.forEach((c) => {
      c.x -= speed * 0.25;
      if (c.x < -60) c.x = canvas.width + 40;
      ctx.fillRect(c.x, c.y, 44, 10);
      ctx.fillRect(c.x + 10, c.y - 6, 24, 8);
    });

    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(canvas.width, groundY);
    ctx.stroke();

    if (!dino.grounded) {
      dino.vy += dino.gravity;
      dino.y += dino.vy;
      if (dino.y >= groundY - dino.h) {
        dino.y = groundY - dino.h;
        dino.vy = 0;
        dino.grounded = true;
      }
    }

    drawDino(fgColor);

    if (frameCount % Math.max(48, Math.round(95 - speed * 2.5)) === 0) {
      spawnObstacle();
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i];
      ob.x -= speed;

      ctx.fillStyle = ob.type === "bird" ? "#00a884" : fgColor;
      if (ob.type === "cactus") {
        ctx.fillRect(ob.x + 4, ob.y, ob.w - 8, ob.h);
        ctx.fillRect(ob.x, ob.y + 10, ob.w, 6);
      } else {
        const wingY = Math.floor(frameCount / 8) % 2 === 0 ? -6 : 6;
        ctx.fillRect(ob.x, ob.y + 8, ob.w, 8);
        ctx.fillRect(ob.x + 10, ob.y + 8 + wingY, 12, 8);
      }

      const pad = 5;
      if (
        dino.x + pad < ob.x + ob.w - pad &&
        dino.x + dino.w - pad > ob.x + pad &&
        dino.y + pad < ob.y + ob.h - pad &&
        dino.y + dino.h - pad > ob.y + pad
      ) {
        gameRunning = false;
        playBeep(160, 0.25, "sawtooth");
        if (score > highScore) {
          highScore = score;
          localStorage.setItem("dino_hi_score", String(highScore));
          document.getElementById("high-score").textContent = String(highScore).padStart(5, "0");
        }
        document.getElementById("overlay-title").textContent = "GAME OVER";
        document.getElementById("overlay-subtitle").textContent = `Score: ${score} • Tap button to run again!`;
        document.getElementById("start-game-btn").textContent = "PLAY AGAIN";
        document.getElementById("game-overlay").classList.remove("hidden");
        return;
      }

      if (ob.x + ob.w < -40) obstacles.splice(i, 1);
    }

    if (frameCount % 5 === 0) {
      score++;
      document.getElementById("current-score").textContent = String(score).padStart(5, "0");
      if (score % 100 === 0) {
        speed += 0.35;
        playBeep(780, 0.1);
      }
    }

    requestAnimationFrame(gameLoop);
  }
});
