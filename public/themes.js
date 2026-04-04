// themes.js — Automatic holiday themes for Veil
(function () {
  const now  = new Date();
  const m    = now.getMonth() + 1; // 1-12
  const d    = now.getDate();

  // Determine theme based on date
  let theme = null;
  if      (m === 10)                        theme = 'halloween';
  else if (m === 12 && d >= 1  && d <= 25)  theme = 'christmas';
  else if ((m === 12 && d >= 26) || (m === 1 && d <= 7)) theme = 'newyear';
  else if (m === 2  && d >= 1  && d <= 14)  theme = 'valentine';
  else if (m === 3  && d >= 10 && d <= 17)  theme = 'stpatricks';
  else if (m === 7  && d >= 1  && d <= 4)   theme = 'july4';
  else if (m === 11 && d >= 20)             theme = 'thanksgiving';

  if (!theme) return;

  document.documentElement.dataset.theme = theme;

  // Particle effects for visual holidays
  const PARTICLE_THEMES = ['christmas', 'newyear', 'halloween', 'valentine'];
  if (!PARTICLE_THEMES.includes(theme)) return;

  // Wait for body to be ready
  function init() {
    const canvas = document.createElement('canvas');
    canvas.id = 'theme-particles';
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;
    const particles = [];

    function resize() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Per-theme config
    const CONFIGS = {
      christmas: {
        count: 90,
        shape: 'circle',
        color:  () => `rgba(255,255,255,${(Math.random() * 0.5 + 0.3).toFixed(2)})`,
        size:   () => Math.random() * 3.5 + 1,
        speedY: () => Math.random() * 1.2 + 0.3,
        speedX: () => (Math.random() - 0.5) * 0.5,
        startY: () => Math.random() * -H,
        resetY: (p) => p.y > H + 10,
        respawnY: () => -10,
      },
      newyear: {
        count: 70,
        shape: 'rect',
        color:  () => ['#f59e0b','#fbbf24','#ffffff','#f43f5e','#60a5fa','#a78bfa'][Math.floor(Math.random() * 6)],
        size:   () => Math.random() * 6 + 3,
        speedY: () => Math.random() * 2 + 0.5,
        speedX: () => (Math.random() - 0.5) * 1.5,
        startY: () => Math.random() * -H,
        resetY: (p) => p.y > H + 20,
        respawnY: () => -20,
      },
      halloween: {
        count: 18,
        shape: 'bat',
        color:  () => '#f97316',
        size:   () => Math.random() * 12 + 10,
        speedY: () => (Math.random() - 0.5) * 0.6,
        speedX: () => (Math.random() < 0.5 ? -1 : 1) * (Math.random() * 0.9 + 0.4),
        startY: () => Math.random() * H,
        resetY: () => false, // bats wrap around
        respawnY: () => 0,
      },
      valentine: {
        count: 35,
        shape: 'heart',
        color:  () => ['#ec4899','#f43f5e','#fb7185','#fda4af'][Math.floor(Math.random() * 4)],
        size:   () => Math.random() * 14 + 7,
        speedY: () => -(Math.random() * 0.7 + 0.2),
        speedX: () => (Math.random() - 0.5) * 0.4,
        startY: () => H + Math.random() * H,
        resetY: (p) => p.y < -p.size * 2,
        respawnY: () => H + 20,
      },
    };

    const cfg = CONFIGS[theme];

    for (let i = 0; i < cfg.count; i++) {
      particles.push({
        x:        Math.random() * window.innerWidth,
        y:        cfg.startY(),
        size:     cfg.size(),
        color:    cfg.color(),
        speedX:   cfg.speedX(),
        speedY:   cfg.speedY(),
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.06,
        opacity:  Math.random() * 0.55 + 0.45,
        wobble:   Math.random() * Math.PI * 2,
        wobbleS:  Math.random() * 0.025 + 0.008,
      });
    }

    function drawHeart(x, y, s, color, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.3);
      ctx.bezierCurveTo(x, y,             x - s * 0.5, y,             x - s * 0.5, y + s * 0.3);
      ctx.bezierCurveTo(x - s * 0.5, y + s * 0.65, x, y + s * 0.9, x, y + s);
      ctx.bezierCurveTo(x, y + s * 0.9, x + s * 0.5, y + s * 0.65, x + s * 0.5, y + s * 0.3);
      ctx.bezierCurveTo(x + s * 0.5, y,             x, y,             x, y + s * 0.3);
      ctx.fill();
      ctx.restore();
    }

    function drawBat(x, y, s, color, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      // Body
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.18, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      // Left wing
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.05);
      ctx.bezierCurveTo(x - s * 0.35, y - s * 0.28, x - s * 0.65, y + s * 0.1, x - s, y - s * 0.05);
      ctx.bezierCurveTo(x - s * 0.65, y - s * 0.08, x - s * 0.3, y - s * 0.12, x, y - s * 0.05);
      ctx.fill();
      // Right wing
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.05);
      ctx.bezierCurveTo(x + s * 0.35, y - s * 0.28, x + s * 0.65, y + s * 0.1, x + s, y - s * 0.05);
      ctx.bezierCurveTo(x + s * 0.65, y - s * 0.08, x + s * 0.3, y - s * 0.12, x, y - s * 0.05);
      ctx.fill();
      ctx.restore();
    }

    function animate() {
      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.wobble += p.wobbleS;
        p.x += p.speedX + Math.sin(p.wobble) * 0.35;
        p.y += p.speedY;
        p.rotation += p.rotSpeed;

        // Wrap or respawn
        if (cfg.resetY(p)) {
          p.y = cfg.respawnY();
          p.x = Math.random() * W;
          p.color = cfg.color();
        }
        // Horizontal wrap (all themes)
        if (p.x < -60) p.x = W + 60;
        if (p.x > W + 60) p.x = -60;
        // Bat vertical wrap
        if (theme === 'halloween') {
          if (p.y < -60) p.y = H + 60;
          if (p.y > H + 60) p.y = -60;
        }

        if (cfg.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.opacity;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (cfg.shape === 'rect') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.opacity;
          ctx.fillRect(-p.size / 2, -p.size * 0.35, p.size, p.size * 0.7);
          ctx.restore();
          ctx.globalAlpha = 1;
        } else if (cfg.shape === 'heart') {
          drawHeart(p.x - p.size / 2, p.y - p.size / 2, p.size, p.color, p.opacity);
        } else if (cfg.shape === 'bat') {
          drawBat(p.x, p.y, p.size, p.color, p.opacity * 0.85);
        }
      }

      requestAnimationFrame(animate);
    }

    animate();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
