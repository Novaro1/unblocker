"use strict";

// share.js — Veil share system client
(function () {

  // ── Modal ──────────────────────────────────────────────────────────────────
  function buildModal() {
    if (document.getElementById("veil-share-modal")) return;

    const style = document.createElement("style");
    style.textContent = `
      #veil-share-overlay {
        position: fixed; inset: 0; z-index: 90000;
        background: rgba(0,0,0,0.55);
        backdrop-filter: blur(6px);
        display: none; align-items: center; justify-content: center;
      }
      #veil-share-overlay.open { display: flex; }
      #veil-share-modal {
        background: var(--surface, #0e0e1e);
        border: 1px solid var(--border, #1e1e38);
        border-radius: 16px;
        padding: 1.5rem;
        width: 100%;
        max-width: 400px;
        margin: 1rem;
        box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        animation: share-pop 0.18s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      @keyframes share-pop {
        from { transform: scale(0.88); opacity: 0; }
        to   { transform: scale(1);    opacity: 1; }
      }
      #veil-share-modal h3 {
        font-size: 0.85rem; font-weight: 700;
        letter-spacing: 0.06em; text-transform: uppercase;
        color: var(--text, #ecedf8); margin-bottom: 1rem;
        display: flex; align-items: center; gap: 8px;
      }
      #veil-share-modal h3 svg { color: var(--accent, #6366f1); }
      #veil-share-type-badge {
        font-size: 0.65rem; font-weight: 600;
        padding: 2px 7px; border-radius: 99px;
        background: color-mix(in srgb, var(--accent, #6366f1) 18%, transparent);
        color: var(--accent-lighter, #a5b4fc);
        border: 1px solid color-mix(in srgb, var(--accent, #6366f1) 30%, transparent);
        text-transform: capitalize; margin-left: auto;
      }
      #veil-share-url-row {
        display: flex; gap: 0.5rem; align-items: stretch;
        margin-bottom: 0.85rem;
      }
      #veil-share-url {
        flex: 1; min-width: 0;
        background: var(--surface2, #15152a);
        border: 1px solid var(--border, #1e1e38);
        border-radius: 8px;
        padding: 0.55rem 0.7rem;
        font-size: 0.78rem;
        font-family: ui-monospace, monospace;
        color: var(--text, #ecedf8);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        outline: none;
        cursor: default;
        user-select: all;
      }
      #veil-share-copy {
        background: var(--accent, #6366f1);
        color: #fff;
        border: none; border-radius: 8px;
        padding: 0 1rem;
        font-size: 0.8rem; font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s, background 0.15s;
        white-space: nowrap;
        display: flex; align-items: center; gap: 5px;
      }
      #veil-share-copy:hover { opacity: 0.88; }
      #veil-share-copy.copied {
        background: #22c55e;
      }
      #veil-share-hint {
        font-size: 0.72rem; color: var(--muted, #6264a0);
        margin-bottom: 1rem; line-height: 1.5;
      }
      #veil-share-close {
        width: 100%; padding: 0.5rem;
        background: transparent;
        border: 1px solid var(--border, #1e1e38);
        border-radius: 8px;
        color: var(--muted, #6264a0);
        font-size: 0.8rem; cursor: pointer;
        transition: color 0.15s, background 0.15s;
      }
      #veil-share-close:hover { color: var(--text, #ecedf8); background: rgba(255,255,255,0.04); }
      #veil-share-loading {
        text-align: center; padding: 1rem 0;
        color: var(--muted, #6264a0); font-size: 0.8rem;
      }
      #veil-share-error {
        color: var(--danger, #f87171); font-size: 0.78rem;
        margin-bottom: 0.75rem; display: none;
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "veil-share-overlay";
    overlay.innerHTML = `
      <div id="veil-share-modal">
        <h3>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
          <span id="veil-share-type-badge"></span>
        </h3>
        <div id="veil-share-loading">Generating link…</div>
        <div id="veil-share-error"></div>
        <div id="veil-share-url-row" style="display:none">
          <input id="veil-share-url" readonly type="text" />
          <button id="veil-share-copy">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
          </button>
        </div>
        <p id="veil-share-hint"></p>
        <button id="veil-share-close">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", e => { if (e.target === overlay) closeShare(); });
    document.getElementById("veil-share-close").addEventListener("click", closeShare);
    document.getElementById("veil-share-copy").addEventListener("click", () => {
      const url = document.getElementById("veil-share-url").value;
      navigator.clipboard.writeText(url).catch(() => {});
      const btn = document.getElementById("veil-share-copy");
      btn.classList.add("copied");
      btn.textContent = "Copied!";
      setTimeout(() => { btn.classList.remove("copied"); btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/></svg> Copy`; }, 2000);
    });
  }

  function closeShare() {
    const overlay = document.getElementById("veil-share-overlay");
    if (overlay) overlay.classList.remove("open");
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  // veilShare(type, data, hint?)
  //   type: 'site' | 'ai' | 'music'
  //   data: { url } | { messages, model } | { title, artist }
  //   hint: optional string shown below the link
  window.veilShare = async function (type, data, hint) {
    buildModal();

    const overlay = document.getElementById("veil-share-overlay");
    const loading = document.getElementById("veil-share-loading");
    const urlRow  = document.getElementById("veil-share-url-row");
    const urlEl   = document.getElementById("veil-share-url");
    const errEl   = document.getElementById("veil-share-error");
    const hintEl  = document.getElementById("veil-share-hint");
    const badge   = document.getElementById("veil-share-type-badge");
    const copyBtn = document.getElementById("veil-share-copy");

    // Reset
    loading.style.display  = "block";
    urlRow.style.display   = "none";
    errEl.style.display    = "none";
    errEl.textContent      = "";
    hintEl.textContent     = hint || "";
    badge.textContent      = type;
    copyBtn.classList.remove("copied");
    copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/></svg> Copy`;

    overlay.classList.add("open");

    try {
      const res  = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create share link.");

      loading.style.display = "none";
      urlEl.value           = json.url;
      urlRow.style.display  = "flex";

      if (!hint) {
        const labels = { site: "Anyone with this link can open this site through Veil.", ai: "Anyone with this link can view this conversation.", music: "Anyone with this link can listen to this track through Veil." };
        hintEl.textContent = labels[type] || "";
      }
    } catch (e) {
      loading.style.display = "none";
      errEl.textContent     = e.message;
      errEl.style.display   = "block";
    }
  };
})();
