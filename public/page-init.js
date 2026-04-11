"use strict";

// page-init.js — applies veil_settings_v1 on any page (runs before DOMContentLoaded)
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

  let s = Object.assign({}, DEFAULTS);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = Object.assign(s, JSON.parse(raw));
  } catch (_) {}

  // Apply theme immediately (before render, prevents flash)
  if (s.theme && s.theme !== "veil") {
    document.documentElement.dataset.theme = s.theme;
  } else {
    delete document.documentElement.dataset.theme;
  }

  // Apply body classes — body exists by the time <script> in <head> runs via defer,
  // but to be safe we wait for DOMContentLoaded only for body class writes
  function applyBody() {
    document.body.classList.toggle("no-scanlines", !s.fxScanlines);
    document.body.classList.toggle("no-vignette",  !s.fxVignette);
    document.body.classList.toggle("perf-mode",    !!s.perfMode);
    window._veilPerfMode = !!s.perfMode;

    const bgEl   = document.getElementById("custom-bg");
    const canvas = document.getElementById("veil-stars");
    const aurora = document.querySelector(".aurora");
    const cursor = document.getElementById("cursor-glow");

    if (bgEl) {
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

  if (document.body) {
    applyBody();
  } else {
    document.addEventListener("DOMContentLoaded", applyBody);
  }

  window._veilPageSettings = s;
})();
