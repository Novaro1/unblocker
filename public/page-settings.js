"use strict";

// page-settings.js — floating appearance panel for non-home pages
(function () {
  const KEY = "veil_settings_v1";

  const BG_GRADIENTS = {
    sunset: "linear-gradient(135deg, #0d0508 0%, #3d1515 25%, #7a2c18 55%, #c95524 80%, #3d1515 100%)",
    cosmos: "linear-gradient(135deg, #050515 0%, #1a0d3d 30%, #2a1858 60%, #140a40 85%, #050515 100%)",
    forest: "linear-gradient(135deg, #030d05 0%, #0a2010 30%, #183818 60%, #0d2810 85%, #030d05 100%)",
    ocean:  "linear-gradient(160deg, #02080d 0%, #051a30 30%, #083050 60%, #051a30 85%, #02080d 100%)",
    dusk:   "linear-gradient(135deg, #0d0820 0%, #2a1848 30%, #522868 60%, #8a3858 80%, #2a1848 100%)",
    blaze:  "linear-gradient(135deg, #0d0200 0%, #7c1d06 30%, #c2410c 60%, #fb923c 100%)",
    neon:   "linear-gradient(135deg, #001a0d 0%, #065f46 30%, #059669 60%, #06b6d4 100%)",
  };

  const DEFAULTS = {
    theme: "veil", bgImage: "", bgGradient: "",
    fxStars: true, fxAurora: true, fxScanlines: true,
    fxCursor: true, fxVignette: true, perfMode: false,
  };

  const THEMES = [
    { id: "veil",    bg: "linear-gradient(135deg,#060610 0%,#6366f1 100%)" },
    { id: "ember",   bg: "linear-gradient(135deg,#0d0804 0%,#f97316 100%)" },
    { id: "emerald", bg: "linear-gradient(135deg,#040d09 0%,#10b981 100%)" },
    { id: "rose",    bg: "linear-gradient(135deg,#0d0608 0%,#f43f5e 100%)" },
    { id: "ocean",   bg: "linear-gradient(135deg,#04080d 0%,#06b6d4 100%)" },
    { id: "void",    bg: "linear-gradient(135deg,#080808 0%,#94a3b8 100%)" },
    { id: "chrome",  bg: "linear-gradient(135deg,#f1f3f4 0%,#ffffff 50%,#1a73e8 100%)", border: "#dadce0" },
    { id: "aura",    bg: "linear-gradient(135deg,#0a0014 0%,#c026d3 50%,#f0abfc 100%)" },
    { id: "crimson", bg: "linear-gradient(135deg,#0d0203 0%,#dc2626 50%,#fca5a5 100%)" },
    { id: "gold",    bg: "linear-gradient(135deg,#0d0900 0%,#d97706 50%,#fde68a 100%)" },
  ];

  const BG_SWATCHES = [
    { id: "",       label: "None",   bg: "var(--surface2)", border: "var(--border)" },
    { id: "sunset", label: "Sunset", bg: BG_GRADIENTS.sunset },
    { id: "cosmos", label: "Cosmos", bg: BG_GRADIENTS.cosmos },
    { id: "forest", label: "Forest", bg: BG_GRADIENTS.forest },
    { id: "ocean",  label: "Ocean",  bg: BG_GRADIENTS.ocean  },
    { id: "dusk",   label: "Dusk",   bg: BG_GRADIENTS.dusk   },
  ];

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch { return Object.assign({}, DEFAULTS); }
  }

  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

  function applyLive(s) {
    if (s.theme && s.theme !== "veil") {
      document.documentElement.dataset.theme = s.theme;
    } else {
      delete document.documentElement.dataset.theme;
    }
    document.body.classList.toggle("no-scanlines", !s.fxScanlines);
    document.body.classList.toggle("no-vignette",  !s.fxVignette);
    document.body.classList.toggle("perf-mode",    !!s.perfMode);
    window._veilPerfMode = !!s.perfMode;

    const bgEl   = document.getElementById("custom-bg");
    const canvas = document.getElementById("veil-stars");
    const aurora = document.querySelector(".aurora");
    const cursor = document.getElementById("cursor-glow");

    if (bgEl) {
      bgEl.style.backgroundImage = "";
      bgEl.style.background      = "";
      if (s.bgImage) {
        bgEl.style.backgroundImage    = `url(${s.bgImage})`;
        bgEl.style.backgroundSize     = "cover";
        bgEl.style.backgroundPosition = "center";
      } else if (s.bgGradient && BG_GRADIENTS[s.bgGradient]) {
        bgEl.style.background = BG_GRADIENTS[s.bgGradient];
      }
    }
    if (canvas) canvas.style.visibility = s.fxStars  ? "" : "hidden";
    if (aurora) aurora.style.visibility = s.fxAurora ? "" : "hidden";
    if (cursor) cursor.style.display    = s.fxCursor ? "" : "none";
  }

  // ── Build panel ────────────────────────────────────────────────────────────
  function buildPanel() {
    const style = document.createElement("style");
    style.textContent = `
      #ps-overlay {
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.45);
        backdrop-filter: blur(4px);
        display: none; align-items: flex-start; justify-content: flex-end;
      }
      #ps-overlay.open { display: flex; }
      #ps-panel {
        width: 280px; max-height: 100vh; overflow-y: auto;
        background: var(--surface, #0e0e1e);
        border-left: 1px solid var(--border, #1e1e38);
        padding: 0 0 1.5rem;
        display: flex; flex-direction: column;
        animation: ps-slide-in 0.2s ease-out both;
      }
      @keyframes ps-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
      #ps-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem 1rem 0.75rem;
        border-bottom: 1px solid var(--border, #1e1e38);
        font-size: 0.8rem; font-weight: 700; letter-spacing: 0.06em;
        color: var(--text, #ecedf8); text-transform: uppercase;
      }
      #ps-close {
        background: none; border: none; cursor: pointer;
        color: var(--muted, #6264a0); padding: 4px; border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
        transition: color 0.15s, background 0.15s;
      }
      #ps-close:hover { color: var(--text, #ecedf8); background: rgba(255,255,255,0.06); }
      .ps-section { padding: 0.85rem 1rem 0; }
      .ps-label {
        font-size: 0.68rem; font-weight: 600; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--muted, #6264a0);
        margin-bottom: 0.6rem;
      }
      .ps-theme-grid {
        display: grid; grid-template-columns: repeat(5,1fr); gap: 6px;
      }
      .ps-swatch {
        aspect-ratio: 1; border-radius: 7px;
        border: 2px solid transparent; cursor: pointer;
        transition: border-color 0.15s, transform 0.1s;
      }
      .ps-swatch:hover  { transform: scale(1.1); }
      .ps-swatch.active { border-color: var(--text, #ecedf8); }
      .ps-bg-grid {
        display: grid; grid-template-columns: repeat(3,1fr); gap: 6px;
      }
      .ps-bg-swatch {
        aspect-ratio: 2/1; border-radius: 6px;
        border: 2px solid transparent; cursor: pointer;
        font-size: 0.55rem; font-weight: 600; color: rgba(255,255,255,0.7);
        display: flex; align-items: flex-end; padding: 3px 4px;
        transition: border-color 0.15s, transform 0.1s;
      }
      .ps-bg-swatch:hover  { transform: scale(1.04); }
      .ps-bg-swatch.active { border-color: var(--text, #ecedf8); }
      .ps-toggle-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.4rem 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        font-size: 0.8rem; color: var(--text, #ecedf8);
      }
      .ps-toggle-row:last-child { border-bottom: none; }
      .ps-toggle {
        width: 34px; height: 20px; background: var(--border, #1e1e38);
        border-radius: 10px; position: relative; cursor: pointer;
        border: none; transition: background 0.2s; flex-shrink: 0;
      }
      .ps-toggle.on { background: var(--accent, #6366f1); }
      .ps-toggle::after {
        content: ''; position: absolute; top: 2px; left: 2px;
        width: 16px; height: 16px; background: white; border-radius: 50%;
        transition: transform 0.2s;
      }
      .ps-toggle.on::after { transform: translateX(14px); }
      #ps-home-link {
        margin: 1rem 1rem 0;
        display: flex; align-items: center; gap: 6px;
        font-size: 0.75rem; color: var(--muted, #6264a0);
        text-decoration: none;
        padding: 0.4rem 0.6rem; border-radius: 6px;
        border: 1px solid var(--border, #1e1e38);
        transition: color 0.15s, background 0.15s;
      }
      #ps-home-link:hover { color: var(--text, #ecedf8); background: rgba(255,255,255,0.04); }

      /* Nav gear button */
      .page-nav-gear {
        margin-left: auto;
        background: none; border: none; cursor: pointer;
        color: rgba(236,237,248,0.45);
        padding: 0.25rem 0.5rem; border-radius: 5px;
        display: flex; align-items: center;
        transition: color 0.15s, background 0.15s;
      }
      .page-nav-gear:hover {
        color: var(--text, #ecedf8);
        background: rgba(99,102,241,0.10);
      }
    `;
    document.head.appendChild(style);

    // Overlay + panel
    const overlay = document.createElement("div");
    overlay.id = "ps-overlay";
    overlay.innerHTML = `
      <div id="ps-panel">
        <div id="ps-header">
          Appearance
          <button id="ps-close" aria-label="Close settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="ps-section">
          <div class="ps-label">Theme</div>
          <div class="ps-theme-grid" id="ps-theme-grid"></div>
        </div>

        <div class="ps-section">
          <div class="ps-label">Background</div>
          <div class="ps-bg-grid" id="ps-bg-grid"></div>
        </div>

        <div class="ps-section">
          <div class="ps-label">Effects</div>
          <div id="ps-toggles"></div>
        </div>

        <a id="ps-home-link" href="/">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Full settings on home page
        </a>
      </div>
    `;
    document.body.appendChild(overlay);

    // Gear button in page-nav
    const nav = document.querySelector(".page-nav");
    if (nav) {
      const gear = document.createElement("button");
      gear.className = "page-nav-gear";
      gear.title = "Appearance settings";
      gear.setAttribute("aria-label", "Open appearance settings");
      gear.innerHTML = `<svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="9" cy="9" r="2.8"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.9 3.9l1.4 1.4M12.7 12.7l1.4 1.4M3.9 14.1l1.4-1.4M12.7 5.3l1.4-1.4"/></svg>`;
      nav.appendChild(gear);
      gear.addEventListener("click", () => overlay.classList.add("open"));
    }

    // Close
    overlay.querySelector("#ps-close").addEventListener("click", () => overlay.classList.remove("open"));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("open"); });

    // ── Populate & wire theme swatches ──────────────────────────────────────
    const themeGrid = overlay.querySelector("#ps-theme-grid");
    let s = load();

    THEMES.forEach(t => {
      const btn = document.createElement("button");
      btn.className = "ps-swatch" + (s.theme === t.id ? " active" : "");
      btn.style.background  = t.bg;
      btn.style.borderColor = t.border || "";
      btn.title = t.id;
      btn.addEventListener("click", () => {
        s = load();
        s.theme = t.id;
        save(s);
        applyLive(s);
        themeGrid.querySelectorAll(".ps-swatch").forEach(el => el.classList.remove("active"));
        btn.classList.add("active");
      });
      themeGrid.appendChild(btn);
    });

    // ── Background swatches ─────────────────────────────────────────────────
    const bgGrid = overlay.querySelector("#ps-bg-grid");

    BG_SWATCHES.forEach(bg => {
      const btn = document.createElement("button");
      btn.className = "ps-bg-swatch" + (s.bgGradient === bg.id ? " active" : "");
      btn.style.background  = bg.bg;
      btn.style.borderColor = bg.border || "";
      btn.textContent = bg.label;
      btn.addEventListener("click", () => {
        s = load();
        s.bgGradient = bg.id;
        s.bgImage    = "";
        save(s);
        applyLive(s);
        bgGrid.querySelectorAll(".ps-bg-swatch").forEach(el => el.classList.remove("active"));
        btn.classList.add("active");
      });
      bgGrid.appendChild(btn);
    });

    // ── Effect toggles ──────────────────────────────────────────────────────
    const togglesEl = overlay.querySelector("#ps-toggles");
    const FX = [
      { key: "fxStars",     label: "Starfield"     },
      { key: "fxAurora",    label: "Aurora glow"   },
      { key: "fxScanlines", label: "CRT scanlines" },
      { key: "fxCursor",    label: "Cursor glow"   },
      { key: "fxVignette",  label: "Vignette"      },
      { key: "perfMode",    label: "Lag reduction" },
    ];

    FX.forEach(fx => {
      const row = document.createElement("div");
      row.className = "ps-toggle-row";
      const isOn = !!s[fx.key];
      row.innerHTML = `<span>${fx.label}</span><button class="ps-toggle${isOn ? " on" : ""}"></button>`;
      row.querySelector("button").addEventListener("click", (e) => {
        s = load();
        const btn = e.currentTarget;
        s[fx.key] = !btn.classList.contains("on");
        save(s);
        applyLive(s);
        btn.classList.toggle("on");
      });
      togglesEl.appendChild(row);
    });
  }

  if (document.body) {
    buildPanel();
  } else {
    document.addEventListener("DOMContentLoaded", buildPanel);
  }
})();
