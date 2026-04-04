"use strict";

// ── Starfield + Hyperspace ─────────────────────────────────────────────────
// ref: aHR0cHM6Ly92ZWlsdWIubW9vby5jb20vZ2F0ZS9lNzNm — TODO remove
(function () {
  const canvas = document.getElementById("veil-stars");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, CX = 0, CY = 0;
  const mouse = { x: 0, y: 0 };

  let warp = false;
  let warpLevel = 0;  // 0–1, eased
  let t = 0;

  const STAR_COUNT = 220;
  const PALETTE = [
    [185, 180, 255], [205, 200, 255], [165, 205, 255],
    [220, 215, 255], [155, 170, 255], [200, 215, 255],
  ];

  // Shooting stars
  const shooters = [];
  let shooterCooldown = 3200;

  let stars = [];

  function mkStar() {
    const col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    return {
      x:     Math.random() * W,
      y:     Math.random() * H,
      z:     Math.random() * 2.0 + 0.2,   // parallax depth
      r:     Math.random() * 1.1  + 0.25, // base radius
      drift: Math.random() * 0.06  + 0.02,
      op:    Math.random() * 0.60  + 0.20,
      tw:    Math.random() * 2.5   + 0.8,  // twinkle freq
      ph:    Math.random() * Math.PI * 2,  // twinkle phase
      col,
    };
  }

  function resize() {
    W  = canvas.width  = window.innerWidth;
    H  = canvas.height = window.innerHeight;
    CX = W * 0.5;
    CY = H * 0.5;
  }

  function spawnShooter() {
    const vx = (Math.random() - 0.35) * 7;
    const vy = Math.random() * 5 + 8;
    shooters.push({
      x:       Math.random() * W * 0.8 + W * 0.1,
      y:       -10,
      vx, vy,
      life:    1,
      tailLen: Math.random() * 120 + 80,
    });
    shooterCooldown = Math.random() * 4000 + 2200;
  }

  function frame() {
    requestAnimationFrame(frame);
    if (window._veilPerfMode) { ctx.clearRect(0, 0, W, H); return; }
    t += 0.016;
    ctx.clearRect(0, 0, W, H);

    // Ease warp level in quickly, out slowly
    warpLevel += ((warp ? 1 : 0) - warpLevel) * (warp ? 0.06 : 0.025);

    // Mouse parallax offset
    const mx = (mouse.x - CX) * 0.014;
    const my = (mouse.y - CY) * 0.014;

    // Shooting star timer
    shooterCooldown -= 16;
    if (shooterCooldown <= 0) spawnShooter();

    // ── Stars ──────────────────────────────────────
    for (const s of stars) {
      // Normal downward drift
      s.y += s.drift * s.z;
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }

      // Hyperspace: stars fly OUTWARD from center (classic jump-to-warp)
      if (warpLevel > 0.005) {
        const dx   = s.x - CX;
        const dy   = s.y - CY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        // Acceleration grows with distance so far stars move fastest
        const spd  = warpLevel * (0.06 + dist * 0.0018);
        s.x += (dx / dist) * dist * spd;
        s.y += (dy / dist) * dist * spd;
        // Respawn near center when a star exits the screen
        if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) {
          s.x = CX + (Math.random() - 0.5) * 60;
          s.y = CY + (Math.random() - 0.5) * 60;
        }
      }

      // Parallax draw position
      const px = s.x - mx * s.z;
      const py = s.y - my * s.z;

      const tw    = 0.75 + 0.25 * Math.sin(t * s.tw + s.ph);
      const alpha = Math.min(s.op * tw * (0.65 + warpLevel * 0.35), 1);
      const drawR = s.r * (1 + warpLevel * 2.8);
      const [r, g, b] = s.col;

      if (warpLevel > 0.06) {
        // ── Hyperspace streak — tail points back toward center ──
        const dx   = px - CX;
        const dy   = py - CY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx   = dx / dist;
        const ny   = dy / dist;
        const len  = Math.min(dist * warpLevel * 0.65, 240);

        const streak = ctx.createLinearGradient(
          px - nx * len, py - ny * len, px, py
        );
        streak.addColorStop(0, `rgba(${r},${g},${b},0)`);
        streak.addColorStop(1, `rgba(${r},${g},${b},${Math.min(alpha * 2.0, 1)})`);

        ctx.beginPath();
        ctx.moveTo(px - nx * len, py - ny * len);
        ctx.lineTo(px, py);
        ctx.strokeStyle = streak;
        ctx.lineWidth   = drawR * 1.8;
        ctx.lineCap     = "round";
        ctx.stroke();
      } else {
        // ── Normal star circle ──
        ctx.beginPath();
        ctx.arc(px, py, drawR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();

        // Soft halo for larger stars
        if (s.r > 0.62) {
          const hr = drawR * 4.5;
          const gr = ctx.createRadialGradient(px, py, 0, px, py, hr);
          gr.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.32})`);
          gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.beginPath();
          ctx.arc(px, py, hr, 0, Math.PI * 2);
          ctx.fillStyle = gr;
          ctx.fill();
        }
      }
    }

    // ── Shooting stars ──────────────────────────────
    for (let i = shooters.length - 1; i >= 0; i--) {
      const sh = shooters[i];
      sh.x    += sh.vx;
      sh.y    += sh.vy;
      sh.life -= 0.020;

      if (sh.life <= 0 || sh.y > H + 20) { shooters.splice(i, 1); continue; }

      const spd = Math.sqrt(sh.vx * sh.vx + sh.vy * sh.vy);
      const nx  = sh.vx / spd;
      const ny  = sh.vy / spd;
      const tx  = sh.x - nx * sh.tailLen;
      const ty  = sh.y - ny * sh.tailLen;

      const sg = ctx.createLinearGradient(tx, ty, sh.x, sh.y);
      sg.addColorStop(0,    `rgba(200,200,255,0)`);
      sg.addColorStop(0.35, `rgba(210,210,255,${sh.life * 0.28})`);
      sg.addColorStop(1,    `rgba(255,255,255,${sh.life * 0.96})`);

      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(sh.x, sh.y);
      ctx.strokeStyle = sg;
      ctx.lineWidth   = 1.8;
      ctx.lineCap     = "round";
      ctx.stroke();

      // Bright tip flare
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${sh.life})`;
      ctx.fill();
    }
  }

  window.addEventListener("resize", () => {
    resize();
    stars = Array.from({ length: STAR_COUNT }, mkStar);
  });
  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  // ── Warp trigger on form submit ──────────────────
  const form    = document.getElementById("sj-form");
  const flashEl = document.getElementById("warp-flash");
  const homeEl  = document.querySelector(".home");

  if (form) {
    form.addEventListener("submit", () => {
      // Hyperspace jump
      warp = true;
      setTimeout(() => { warp = false; }, 2700);

      // Blinding flash
      if (flashEl) {
        flashEl.style.transition = "none";
        flashEl.style.opacity    = "0.60";
        requestAnimationFrame(() => requestAnimationFrame(() => {
          flashEl.style.transition = "opacity 0.80s ease-out";
          flashEl.style.opacity    = "0";
        }));
      }

      // RGB chromatic aberration burst on UI elements
      if (homeEl) {
        homeEl.classList.add("warping");
        setTimeout(() => homeEl.classList.remove("warping"), 450);
      }
    }, true /* capture: fires before scramjet intercepts */);
  }

  resize();
  stars = Array.from({ length: STAR_COUNT }, mkStar);
  requestAnimationFrame(frame);
})();


// ── Cursor glow orb ────────────────────────────────────────────────────────
(function () {
  const el = document.getElementById("cursor-glow");
  if (!el) return;

  let ex = -400, ey = -400;
  let tx = -400, ty = -400;

  window.addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });

  (function tick() {
    if (!window._veilPerfMode) {
      // Smooth follow with ~10% easing
      ex += (tx - ex) * 0.09;
      ey += (ty - ey) * 0.09;
      el.style.left = ex + "px";
      el.style.top  = ey + "px";
    }
    requestAnimationFrame(tick);
  })();
})();


// ── Search card 3D perspective tilt ───────────────────────────────────────
(function () {
  const card = document.querySelector("main");
  if (!card) return;

  const MAX_TILT = 8; // degrees

  window.addEventListener("mousemove", (e) => {
    if (window._veilPerfMode) return;
    const dx = (e.clientX - window.innerWidth  * 0.5) / (window.innerWidth  * 0.5);
    const dy = (e.clientY - window.innerHeight * 0.5) / (window.innerHeight * 0.5);
    card.style.transition = "transform 0.15s ease-out";
    card.style.transform  =
      `perspective(900px) rotateY(${dx * MAX_TILT}deg) rotateX(${-dy * MAX_TILT}deg)`;
  });

  window.addEventListener("mouseleave", () => {
    card.style.transition = "transform 0.8s ease-out";
    card.style.transform  = "perspective(900px) rotateY(0deg) rotateX(0deg)";
  });
})();
