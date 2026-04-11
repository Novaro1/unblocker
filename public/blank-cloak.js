"use strict";

const BLANK_CLOAK_AUTO_KEY = "veil_blank_cloak_auto";

const CLOAK_PRESETS = {
  none:      { title: "Veil",                         favicon: "/favicon.ico" },
  docs:      { title: "Untitled document",            favicon: "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico" },
  classroom: { title: "Google Classroom",             favicon: "https://ssl.gstatic.com/classroom/favicon.png" },
  gmail:     { title: "Inbox (1) - Gmail",            favicon: "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico" },
  desmos:    { title: "Desmos | Graphing Calculator", favicon: "/favicons/desmos.ico" },
  khan:      { title: "Khan Academy",                 favicon: "/favicons/khan.ico" },
  youtube:   { title: "YouTube",                      favicon: "https://www.youtube.com/favicon.ico" },
  spotify:   { title: "Spotify - Web Player",         favicon: "/favicons/spotify.ico" },
  discord:   { title: "Discord",                      favicon: "/favicons/discord.ico" },
  roblox:    { title: "Roblox",                       favicon: "/favicons/roblox.ico" },
};

const CLOAK_ESCAPE_URLS = {
  youtube:  "https://www.youtube.com",
  spotify:  "https://open.spotify.com",
  discord:  "https://discord.com/app",
  roblox:   "https://www.roblox.com",
  docs:     "https://docs.google.com",
  classroom:"https://classroom.google.com",
  gmail:    "https://mail.google.com",
  desmos:   "https://www.desmos.com",
  khan:     "https://www.khanacademy.org",
};

function getCloakInfo() {
  const settings = JSON.parse(localStorage.getItem("veil_settings_v1") || "{}");
  const cloak = settings.cloak || "none";
  if (cloak === "custom") {
    return {
      title:   settings.cloakTitle   || document.title,
      favicon: settings.cloakFavicon || "/favicon.ico",
      escape:  "https://www.google.com",
    };
  }
  const preset = CLOAK_PRESETS[cloak] || CLOAK_PRESETS.none;
  return { ...preset, escape: CLOAK_ESCAPE_URLS[cloak] || "https://www.google.com" };
}

function applyCloak(w, info) {
  w.document.title = info.title;
  // inject favicon into the blank page
  const link = w.document.createElement("link");
  link.rel = "icon";
  link.href = info.favicon;
  w.document.head.appendChild(link);
}

function openBlankCloak() {
  const w = window.open("about:blank", "_blank");
  if (!w) return;

  const info = getCloakInfo();

  const iframe = w.document.createElement("iframe");
  iframe.src = location.href;
  iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;margin:0;padding:0;";
  w.document.documentElement.style.cssText = "margin:0;padding:0;height:100%;overflow:hidden;";
  w.document.body.style.cssText = "margin:0;padding:0;height:100%;overflow:hidden;";
  w.document.body.appendChild(iframe);
  applyCloak(w, info);

  // Listen for cloak updates sent from the iframe via postMessage
  const listenerScript = w.document.createElement("script");
  listenerScript.textContent = `
    window.addEventListener("message", (e) => {
      if (!e.data || e.data.type !== "veil-cloak") return;
      if (e.data.title)   document.title = e.data.title;
      if (e.data.favicon) {
        let lnk = document.querySelector("link[rel='icon']");
        if (!lnk) { lnk = document.createElement("link"); lnk.rel = "icon"; document.head.appendChild(lnk); }
        lnk.href = e.data.favicon;
      }
    });
  `;
  w.document.head.appendChild(listenerScript);

  // Close or navigate away the original tab
  setTimeout(() => {
    window.close();
    setTimeout(() => {
      if (!window.closed) location.replace(info.escape);
    }, 200);
  }, 50);
}

// Button
document.getElementById("blank-cloak-btn")?.addEventListener("click", openBlankCloak);

// Manual "about:blank" button auto toggle (legacy setting, kept for compat)
const autoCheckbox = document.getElementById("blank-cloak-auto");
if (autoCheckbox) {
  autoCheckbox.checked = localStorage.getItem(BLANK_CLOAK_AUTO_KEY) === "1";
  autoCheckbox.addEventListener("change", () => {
    localStorage.setItem(BLANK_CLOAK_AUTO_KEY, autoCheckbox.checked ? "1" : "0");
  });
}

// ── Stealth entry — defaults ON ─────────────────────────────────────────────
const STEALTH_ENTRY_KEY = "veil_stealth_entry";

function isStealthEntryOn() {
  const v = localStorage.getItem(STEALTH_ENTRY_KEY);
  return v === null ? true : v === "1"; // default ON
}

const stealthEntryToggle = document.getElementById("stealth-entry-toggle");
if (stealthEntryToggle) {
  stealthEntryToggle.checked = isStealthEntryOn();
  stealthEntryToggle.addEventListener("change", () => {
    localStorage.setItem(STEALTH_ENTRY_KEY, stealthEntryToggle.checked ? "1" : "0");
  });
}

// Auto-open on load if the legacy setting is enabled
if (localStorage.getItem(BLANK_CLOAK_AUTO_KEY) === "1" && window.top === window) {
  openBlankCloak();
}

// ── DevTools blocking ────────────────────────────────────────────────────────
const BLOCK_DT_KEY = "veil_block_devtools";

function isBlockDevToolsOn() {
  const v = localStorage.getItem(BLOCK_DT_KEY);
  return v === null ? true : v === "1"; // default ON
}

const blockDevToolsToggle = document.getElementById("block-devtools-toggle");
if (blockDevToolsToggle) {
  blockDevToolsToggle.checked = isBlockDevToolsOn();
  blockDevToolsToggle.addEventListener("change", () => {
    localStorage.setItem(BLOCK_DT_KEY, blockDevToolsToggle.checked ? "1" : "0");
  });
}

if (isBlockDevToolsOn()) {
  document.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "F12") { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (ctrl && e.shiftKey && ["i","I","j","J","c","C"].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (ctrl && (e.key === "u" || e.key === "U")) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (ctrl && (e.key === "s" || e.key === "S")) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    // Block Print (Ctrl+P) and PrintScreen
    if (ctrl && (e.key === "p" || e.key === "P")) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === "PrintScreen") { e.preventDefault(); e.stopImmediatePropagation(); return; }
  }, true);

  document.addEventListener("contextmenu", (e) => {
    const frame = document.getElementById("sj-frame-container");
    if (frame && frame.style.display === "flex") return;
    e.preventDefault();
  }, true);
}

// ── History poisoning — replace Veil URLs in history with Google Classroom ──
const POISON_HIST_KEY = "veil_poison_history";

function isPoisonHistoryOn() {
  const v = localStorage.getItem(POISON_HIST_KEY);
  return v === null ? true : v === "1";
}

const poisonHistoryToggle = document.getElementById("poison-history-toggle");
if (poisonHistoryToggle) {
  poisonHistoryToggle.checked = isPoisonHistoryOn();
  poisonHistoryToggle.addEventListener("change", () => {
    localStorage.setItem(POISON_HIST_KEY, poisonHistoryToggle.checked ? "1" : "0");
  });
}

if (isPoisonHistoryOn()) {
  // Replace current history entry with Google Classroom URL
  // so back/forward and history list show an innocent URL
  try {
    history.replaceState(null, "Google Classroom", "https://classroom.google.com");
    // Push a few more innocent entries so the history stack looks normal
    history.pushState(null, "Google Classroom", "https://classroom.google.com");
    history.pushState(null, "Google Classroom", location.href);
  } catch (_) {}
}

// ── Tab-switch cloak — show panic overlay when tab becomes hidden ────────────
const TAB_SWITCH_KEY = "veil_tab_switch_cloak";

function isTabSwitchCloakOn() {
  const v = localStorage.getItem(TAB_SWITCH_KEY);
  return v === null ? true : v === "1";
}

const tabSwitchToggle = document.getElementById("tab-switch-cloak-toggle");
if (tabSwitchToggle) {
  tabSwitchToggle.checked = isTabSwitchCloakOn();
  tabSwitchToggle.addEventListener("change", () => {
    localStorage.setItem(TAB_SWITCH_KEY, tabSwitchToggle.checked ? "1" : "0");
  });
}

if (isTabSwitchCloakOn()) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Tab switched away — trigger panic key combo to show cloak
      window._veilTriggerPanic?.();
    }
  });
}

// ── Auto-poison on idle ──────────────────────────────────────────────────────
const AUTO_POISON_KEY = "veil_auto_poison_delay";

const autoPoisonSelect = document.getElementById("auto-poison-delay");
if (autoPoisonSelect) {
  autoPoisonSelect.value = localStorage.getItem(AUTO_POISON_KEY) ?? "5";
  autoPoisonSelect.addEventListener("change", () => {
    localStorage.setItem(AUTO_POISON_KEY, autoPoisonSelect.value);
    resetIdleTimer();
  });
}

let idleTimer = null;

function activateTeacherPanic() {
  document.cookie = "v_poison=1; max-age=300; path=/; SameSite=Lax";
  document.cookie = "v_ok=; max-age=0; path=/; SameSite=Lax";
  localStorage.removeItem("v_ok");
  const o = document.getElementById("poison-overlay");
  if (o) o.style.display = "flex";
  setTimeout(() => window.location.replace("https://classroom.google.com"), 1500);
}

function resetIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const mins = parseInt(localStorage.getItem(AUTO_POISON_KEY) ?? "5", 10);
  if (!mins) return;
  idleTimer = setTimeout(activateTeacherPanic, mins * 60 * 1000);
}

["mousemove","mousedown","keydown","touchstart","scroll"].forEach(ev => {
  document.addEventListener(ev, resetIdleTimer, { passive: true });
});
resetIdleTimer();
