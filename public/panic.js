"use strict";

// ── Panic Key ──────────────────────────────────────────────────────────────
(function () {
  const SETTINGS_KEY = "veil_settings_v1";

  const PRESETS = {
    classroom: "https://classroom.google.com",
    google:    "https://www.google.com",
    gmail:     "https://mail.google.com",
    desmos:    "https://www.desmos.com/calculator",
    khan:      "https://www.khanacademy.org",
  };

  function loadPanic() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return {
        panicEnabled: s.panicEnabled !== false,
        panicKey:     s.panicKey  || "alt+x",
        panicUrl:     s.panicUrl  || "https://classroom.google.com",
      };
    } catch {
      return { panicEnabled: true, panicKey: "alt+x", panicUrl: "https://classroom.google.com" };
    }
  }

  function patchPanic(obj) {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      Object.assign(stored, obj);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
    } catch {}
  }

  // Build "ctrl+alt+x" style string from a KeyboardEvent
  function buildCombo(e) {
    const MODS = ["Control", "Alt", "Shift", "Meta"];
    if (MODS.includes(e.key)) return ""; // pure modifier press, not a combo yet
    const parts = [];
    if (e.ctrlKey)  parts.push("ctrl");
    if (e.altKey)   parts.push("alt");
    if (e.shiftKey) parts.push("shift");
    if (e.metaKey)  parts.push("meta");
    parts.push(e.key.toLowerCase());
    return parts.join("+");
  }

  function formatCombo(combo) {
    if (!combo) return "Not set";
    return combo.split("+").map(p => {
      if (p === "ctrl")  return "Ctrl";
      if (p === "alt")   return "Alt";
      if (p === "shift") return "Shift";
      if (p === "meta")  return "⌘";
      return p.length === 1 ? p.toUpperCase() : p;
    }).join(" + ");
  }

  // ── Key listener (capture phase so it fires before anything else) ─────────
  let capturing = false;

  document.addEventListener("keydown", (e) => {
    if (capturing) return; // don't trigger panic while reconfiguring
    const s = loadPanic();
    if (!s.panicEnabled) return;
    const combo = buildCombo(e);
    if (combo && combo === s.panicKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Replace history entry so Back won't return to the unblocker
      window.location.replace(s.panicUrl);
    }
  }, true /* capture phase */);

  // ── UI wiring ─────────────────────────────────────────────────────────────
  const captureBtn    = document.getElementById("panic-key-capture");
  const urlSelect     = document.getElementById("panic-url-select");
  const urlCustomRow  = document.getElementById("panic-url-custom-row");
  const urlCustom     = document.getElementById("panic-url-custom");

  function refreshUi() {
    const s = loadPanic();

    if (captureBtn) {
      captureBtn.textContent = formatCombo(s.panicKey);
      captureBtn.classList.remove("capturing");
    }

    if (urlSelect && urlCustomRow && urlCustom) {
      const match = Object.entries(PRESETS).find(([, v]) => v === s.panicUrl);
      urlSelect.value = match ? match[0] : "custom";
      urlCustom.value = s.panicUrl;
      urlCustomRow.style.display = match ? "none" : "";
    }
  }

  // Expose so settings.js can call this when opening the panel
  window._veilPanicRefreshUi = refreshUi;

  // Key capture button
  captureBtn?.addEventListener("click", function () {
    if (capturing) return;
    capturing = true;
    captureBtn.textContent = "Press a key…";
    captureBtn.classList.add("capturing");

    function onKey(e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const combo = buildCombo(e);
      if (!combo) return; // only a modifier key was pressed; wait for the real key

      capturing = false;
      document.removeEventListener("keydown", onKey, true);
      patchPanic({ panicKey: combo });
      refreshUi();
    }

    // Cancel on Escape
    function onEsc(e) {
      if (e.key !== "Escape") return;
      capturing = false;
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keydown", onEsc, true);
      refreshUi();
    }

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keydown", onEsc, true);
  });

  // Redirect destination select
  urlSelect?.addEventListener("change", function () {
    const isCustom = this.value === "custom";
    if (urlCustomRow) urlCustomRow.style.display = isCustom ? "" : "none";
    if (!isCustom) {
      patchPanic({ panicUrl: PRESETS[this.value] });
      if (urlCustom) urlCustom.value = PRESETS[this.value];
    }
  });

  urlCustom?.addEventListener("input", function () {
    patchPanic({ panicUrl: this.value });
  });

  // Init
  refreshUi();
})();
