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

// Auto toggle
const autoCheckbox = document.getElementById("blank-cloak-auto");
if (autoCheckbox) {
  autoCheckbox.checked = localStorage.getItem(BLANK_CLOAK_AUTO_KEY) === "1";
  autoCheckbox.addEventListener("change", () => {
    localStorage.setItem(BLANK_CLOAK_AUTO_KEY, autoCheckbox.checked ? "1" : "0");
  });
}

// Auto-open on load if enabled — only when not already in a blank cloak
if (localStorage.getItem(BLANK_CLOAK_AUTO_KEY) === "1" && window.top === window) {
  openBlankCloak();
}
