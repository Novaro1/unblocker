// ── Veil AI — bookmarklet widget ─────────────────────────────────────────────
// Loaded from https://veilub.mooo.com/ai-widget-ext.js
// Works on any page — uses absolute URLs for API and assets.

(function () {
  const API = "https://veilub.mooo.com/api/ai";

  if (document.getElementById("vai-root")) {
    // Already loaded — just toggle
    const fab = document.getElementById("vai-fab");
    if (fab) fab.click();
    return;
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #vai-root * { box-sizing: border-box; margin: 0; padding: 0; }

    #vai-fab {
      all: unset;
      position: fixed !important;
      bottom: 24px !important;
      right: 24px !important;
      z-index: 2147483646 !important;
      width: 52px !important;
      height: 52px !important;
      border-radius: 50% !important;
      background: #6366f1 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 4px 20px rgba(99,102,241,0.45) !important;
      transition: transform 0.18s, box-shadow 0.18s !important;
      color: #fff !important;
    }
    #vai-fab:hover { transform: scale(1.08) !important; }
    #vai-fab.open  { background: #4f46e5 !important; }

    #vai-panel {
      all: unset;
      position: fixed !important;
      bottom: 88px !important;
      right: 24px !important;
      z-index: 2147483645 !important;
      width: 360px !important;
      height: 520px !important;
      background: #0e0e1e !important;
      border: 1px solid #1e1e38 !important;
      border-radius: 16px !important;
      box-shadow: 0 16px 48px rgba(0,0,0,0.6) !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      font-family: ui-rounded, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif !important;
      opacity: 0 !important;
      transform: translateY(12px) scale(0.97) !important;
      pointer-events: none !important;
      transition: opacity 0.18s, transform 0.18s !important;
    }
    #vai-panel.open {
      opacity: 1 !important;
      transform: translateY(0) scale(1) !important;
      pointer-events: all !important;
    }

    #vai-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 12px 14px !important;
      border-bottom: 1px solid #1e1e38 !important;
      flex-shrink: 0 !important;
      background: #0e0e1e !important;
      cursor: move !important;
      user-select: none !important;
    }
    #vai-header-left {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      color: #ecedf8 !important;
    }
    #vai-header-right { display: flex !important; align-items: center !important; gap: 6px !important; }

    #vai-root .vai-icon-btn {
      background: none !important;
      border: none !important;
      cursor: pointer !important;
      color: #6264a0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 6px !important;
      padding: 4px !important;
      transition: color 0.15s, background 0.15s !important;
    }
    #vai-root .vai-icon-btn:hover { color: #ecedf8 !important; background: #15152a !important; }

    #vai-model {
      background: #15152a !important;
      border: 1px solid #1e1e38 !important;
      border-radius: 6px !important;
      color: #a5b4fc !important;
      font-size: 11px !important;
      font-family: inherit !important;
      padding: 3px 6px !important;
      cursor: pointer !important;
      outline: none !important;
    }

    #vai-screen-bar {
      display: none !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 6px 12px !important;
      background: rgba(74,222,128,0.06) !important;
      border-bottom: 1px solid rgba(74,222,128,0.15) !important;
      font-size: 11px !important;
      color: #4ade80 !important;
      flex-shrink: 0 !important;
    }
    #vai-screen-bar.show { display: flex !important; }
    #vai-screen-canvas {
      border-radius: 4px !important;
      border: 1px solid #4ade8033 !important;
      max-width: 80px !important;
      max-height: 50px !important;
    }
    #vai-screen-stop {
      margin-left: auto !important;
      background: none !important;
      border: 1px solid #4ade8033 !important;
      border-radius: 5px !important;
      color: #4ade80 !important;
      font-size: 10px !important;
      font-family: inherit !important;
      padding: 2px 8px !important;
      cursor: pointer !important;
    }

    #vai-messages {
      flex: 1 !important;
      overflow-y: auto !important;
      padding: 12px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
      scroll-behavior: smooth !important;
    }
    #vai-messages::-webkit-scrollbar { width: 4px !important; }
    #vai-messages::-webkit-scrollbar-thumb { background: #1e1e38 !important; border-radius: 4px !important; }

    #vai-empty {
      margin: auto !important;
      text-align: center !important;
      color: #6264a0 !important;
      font-size: 12px !important;
      line-height: 1.6 !important;
    }
    #vai-empty svg { display: block !important; margin: 0 auto 8px !important; opacity: 0.5 !important; }

    #vai-root .vai-msg {
      display: flex !important;
      gap: 8px !important;
      align-items: flex-start !important;
    }
    #vai-root .vai-msg.user { flex-direction: row-reverse !important; }
    #vai-root .vai-avatar {
      width: 26px !important; height: 26px !important;
      border-radius: 50% !important;
      flex-shrink: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    #vai-root .vai-msg.ai   .vai-avatar { background: #6366f1 !important; }
    #vai-root .vai-msg.user .vai-avatar { background: #1e1e38 !important; }
    #vai-root .vai-bubble {
      max-width: 82% !important;
      padding: 8px 11px !important;
      border-radius: 12px !important;
      font-size: 13px !important;
      line-height: 1.55 !important;
      color: #ecedf8 !important;
      word-break: break-word !important;
    }
    #vai-root .vai-msg.ai   .vai-bubble { background: #15152a !important; border: 1px solid #1e1e38 !important; border-radius: 12px 12px 12px 3px !important; }
    #vai-root .vai-msg.user .vai-bubble { background: #6366f1 !important; border-radius: 12px 12px 3px 12px !important; }
    #vai-root .vai-bubble p  { margin-bottom: 6px !important; }
    #vai-root .vai-bubble p:last-child { margin-bottom: 0 !important; }
    #vai-root .vai-bubble code {
      background: rgba(255,255,255,0.08) !important;
      border-radius: 4px !important;
      padding: 1px 5px !important;
      font-size: 12px !important;
      font-family: ui-monospace, monospace !important;
    }
    #vai-root .vai-bubble pre {
      background: rgba(0,0,0,0.35) !important;
      border-radius: 7px !important;
      padding: 8px 10px !important;
      overflow-x: auto !important;
      margin: 4px 0 !important;
    }
    #vai-root .vai-bubble pre code { background: none !important; padding: 0 !important; }
    #vai-root .vai-bubble strong { font-weight: 700 !important; }
    #vai-root .vai-bubble em { font-style: italic !important; }

    #vai-root .vai-typing { display: flex !important; gap: 4px !important; align-items: center !important; padding: 4px 0 !important; }
    #vai-root .vai-dot {
      width: 6px !important; height: 6px !important;
      background: #6264a0 !important;
      border-radius: 50% !important;
      animation: vai-bounce 1.2s infinite !important;
    }
    #vai-root .vai-dot:nth-child(2) { animation-delay: 0.2s !important; }
    #vai-root .vai-dot:nth-child(3) { animation-delay: 0.4s !important; }
    @keyframes vai-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

    #vai-input-row {
      flex-shrink: 0 !important;
      display: flex !important;
      gap: 8px !important;
      align-items: flex-end !important;
      padding: 10px 12px !important;
      border-top: 1px solid #1e1e38 !important;
      background: #0e0e1e !important;
    }
    #vai-input {
      flex: 1 !important;
      background: #15152a !important;
      border: 1px solid #1e1e38 !important;
      border-radius: 10px !important;
      color: #ecedf8 !important;
      font-size: 13px !important;
      font-family: inherit !important;
      padding: 8px 11px !important;
      resize: none !important;
      outline: none !important;
      min-height: 36px !important;
      max-height: 120px !important;
      line-height: 1.5 !important;
      transition: border-color 0.15s !important;
    }
    #vai-input:focus { border-color: #6366f1 !important; }
    #vai-input::placeholder { color: #6264a0 !important; }

    #vai-send {
      width: 32px !important; height: 32px !important;
      border-radius: 8px !important; border: none !important;
      background: #6366f1 !important; color: #fff !important;
      cursor: pointer !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      flex-shrink: 0 !important;
      transition: filter 0.15s, opacity 0.15s !important;
    }
    #vai-send:hover:not([disabled]) { filter: brightness(1.12) !important; }
    #vai-send[disabled] { opacity: 0.35 !important; cursor: not-allowed !important; }

    #vai-screen-btn {
      width: 32px !important; height: 32px !important;
      border-radius: 8px !important;
      border: 1px solid #1e1e38 !important;
      background: none !important; color: #6264a0 !important;
      cursor: pointer !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      flex-shrink: 0 !important;
      transition: color 0.15s, border-color 0.15s !important;
    }
    #vai-screen-btn:hover { color: #ecedf8 !important; border-color: #6366f1 !important; }
    #vai-screen-btn.active { color: #4ade80 !important; border-color: #4ade8055 !important; background: rgba(74,222,128,0.07) !important; }
  `;
  document.head.appendChild(style);

  // ── DOM ──────────────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "vai-root";
  root.innerHTML = `
    <button id="vai-fab" title="Veil AI">
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
        <line x1="4" y1="21" x2="28" y2="21" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M8 26 L16 13 L24 26" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <div id="vai-panel">
      <div id="vai-header">
        <div id="vai-header-left">
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
            <line x1="4" y1="21" x2="28" y2="21" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M8 26 L16 13 L24 26" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Veil AI
        </div>
        <div id="vai-header-right">
          <select id="vai-model">
            <option value="llama-3.1-8b-instant">Llama 3.1 8B</option>
            <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
            <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout</option>
          </select>
          <button class="vai-icon-btn" id="vai-clear-btn" title="Clear chat">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
          <button class="vai-icon-btn" id="vai-close-btn" title="Close">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div id="vai-screen-bar">
        <canvas id="vai-screen-canvas"></canvas>
        <span>Screen sharing</span>
        <button id="vai-screen-stop">Stop</button>
      </div>
      <div id="vai-messages">
        <div id="vai-empty">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <line x1="4" y1="21" x2="28" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M8 26 L16 13 L24 26" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Ask anything — homework help,<br>code, explanations, ideas.
        </div>
      </div>
      <div id="vai-input-row">
        <button id="vai-screen-btn" title="Share screen with AI">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        </button>
        <textarea id="vai-input" placeholder="Ask anything…" rows="1"></textarea>
        <button id="vai-send" disabled>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const fab          = document.getElementById("vai-fab");
  const panel        = document.getElementById("vai-panel");
  const messagesEl   = document.getElementById("vai-messages");
  const emptyEl      = document.getElementById("vai-empty");
  const inputEl      = document.getElementById("vai-input");
  const sendBtn      = document.getElementById("vai-send");
  const modelSelect  = document.getElementById("vai-model");
  const clearBtn     = document.getElementById("vai-clear-btn");
  const closeBtn     = document.getElementById("vai-close-btn");
  const screenBtn    = document.getElementById("vai-screen-btn");
  const screenBar    = document.getElementById("vai-screen-bar");
  const screenCanvas = document.getElementById("vai-screen-canvas");
  const screenStop   = document.getElementById("vai-screen-stop");
  const screenCtx    = screenCanvas.getContext("2d");

  // ── State ────────────────────────────────────────────────────────────────────
  const history = [];
  let isLoading    = false;
  let screenStream = null;
  let screenVideo  = null;
  let screenTick   = null;

  // ── Open / close ─────────────────────────────────────────────────────────────
  fab.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    fab.classList.toggle("open", open);
    if (open) setTimeout(() => inputEl.focus(), 20);
  });
  closeBtn.addEventListener("click", () => {
    panel.classList.remove("open");
    fab.classList.remove("open");
  });

  // ── Drag to reposition ───────────────────────────────────────────────────────
  const header = document.getElementById("vai-header");
  let dragging = false, dx = 0, dy = 0;
  header.addEventListener("mousedown", e => {
    dragging = true;
    const r = panel.getBoundingClientRect();
    dx = e.clientX - r.left;
    dy = e.clientY - r.top;
    panel.style.transition = "none";
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const x = e.clientX - dx, y = e.clientY - dy;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = x + "px";
    panel.style.top  = y + "px";
  });
  document.addEventListener("mouseup", () => {
    dragging = false;
    panel.style.transition = "";
  });

  // ── Clear ────────────────────────────────────────────────────────────────────
  clearBtn.addEventListener("click", () => {
    history.length = 0;
    messagesEl.innerHTML = "";
    messagesEl.appendChild(emptyEl);
  });

  // ── Input ────────────────────────────────────────────────────────────────────
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
    sendBtn.disabled = !inputEl.value.trim() || isLoading;
  });
  inputEl.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  sendBtn.addEventListener("click", send);

  // ── Screen share ─────────────────────────────────────────────────────────────
  screenBtn.addEventListener("click", async () => {
    if (screenStream) { stopScreen(); return; }
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      screenVideo  = document.createElement("video");
      screenVideo.srcObject = screenStream;
      screenVideo.muted = true;
      await screenVideo.play();
      screenStream.getVideoTracks()[0].addEventListener("ended", stopScreen);

      screenTick = setInterval(() => {
        if (!screenVideo || screenVideo.readyState < 2) return;
        const vw = screenVideo.videoWidth, vh = screenVideo.videoHeight;
        const scale = Math.min(80 / vw, 50 / vh, 1);
        screenCanvas.width  = Math.round(vw * scale);
        screenCanvas.height = Math.round(vh * scale);
        screenCtx.drawImage(screenVideo, 0, 0, screenCanvas.width, screenCanvas.height);
      }, 200);

      screenBtn.classList.add("active");
      screenBar.classList.add("show");
      modelSelect.value = "meta-llama/llama-4-scout-17b-16e-instruct";
    } catch (e) {
      if (e.name !== "NotAllowedError") console.warn("Veil AI screen share:", e);
    }
  });
  screenStop.addEventListener("click", stopScreen);

  function stopScreen() {
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    if (screenTick)   { clearInterval(screenTick); screenTick = null; }
    screenVideo = null;
    screenBtn.classList.remove("active");
    screenBar.classList.remove("show");
    if (modelSelect.value === "meta-llama/llama-4-scout-17b-16e-instruct") modelSelect.value = "llama-3.1-8b-instant";
  }

  function captureFrame() {
    if (!screenCanvas.width || !screenCanvas.height) return null;
    return screenCanvas.toDataURL("image/jpeg", 0.7).split(",")[1];
  }

  // ── Send ─────────────────────────────────────────────────────────────────────
  function send() {
    const text = inputEl.value.trim();
    if (!text || isLoading) return;
    if (emptyEl.parentNode) emptyEl.remove();

    const frame = captureFrame();
    addMsg("user", text);
    history.push({ role: "user", content: text });

    const messagesForApi = [
      ...history.slice(0, -1),
      {
        role: "user",
        content: frame
          ? [{ type: "text", text }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${frame}` } }]
          : text,
      },
    ];

    inputEl.value = "";
    inputEl.style.height = "auto";
    sendBtn.disabled = true;
    isLoading = true;

    const typingEl = addTyping();

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelSelect.value,
        messages: [
          { role: "system", content: frame ? "You are a helpful assistant built into Veil. The user has shared their screen — a screenshot is attached to their message. ALWAYS look at the screenshot first to understand the context of their request before answering. If they refer to problems, questions, or items by number or range (like \"46-54\"), find those on the screen rather than interpreting it as math. Keep responses clear and concise. Format using markdown where helpful." : "You are a helpful, friendly assistant built into Veil. Keep responses clear and concise. Format using markdown where helpful." },
          ...messagesForApi,
        ],
      }),
    })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        typingEl.remove();
        if (!ok) throw new Error(d.error || "Unknown error");
        const reply = d.content.trim();
        history.push({ role: "assistant", content: reply });
        addMsg("ai", reply);
      })
      .catch(err => {
        typingEl.remove();
        addMsg("ai", `Error: ${err.message}`);
      })
      .finally(() => {
        isLoading = false;
        sendBtn.disabled = !inputEl.value.trim();
      });
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  function addMsg(role, content) {
    const wrap = document.createElement("div");
    wrap.className = `vai-msg ${role}`;
    const avatar = document.createElement("div");
    avatar.className = "vai-avatar";
    avatar.innerHTML = role === "ai"
      ? `<svg width="12" height="12" viewBox="0 0 32 32" fill="none"><line x1="4" y1="21" x2="28" y2="21" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linecap="round"/><path d="M8 26 L16 13 L24 26" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const bubble = document.createElement("div");
    bubble.className = "vai-bubble";
    bubble.innerHTML = role === "ai" ? renderMd(content) : escHtml(content);
    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return wrap;
  }

  function addTyping() {
    const wrap = document.createElement("div");
    wrap.className = "vai-msg ai";
    wrap.innerHTML = `<div class="vai-avatar"><svg width="12" height="12" viewBox="0 0 32 32" fill="none"><line x1="4" y1="21" x2="28" y2="21" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linecap="round"/><path d="M8 26 L16 13 L24 26" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="vai-bubble"><div class="vai-typing"><span class="vai-dot"></span><span class="vai-dot"></span><span class="vai-dot"></span></div></div>`;
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return wrap;
  }

  function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }
  function renderMd(text) {
    return escHtml(text)
      .replace(/```[\s\S]*?```/g, m => {
        const code = m.slice(3, m.lastIndexOf("```")).replace(/^[^\n]*\n?/, "");
        return `<pre><code>${code}</code></pre>`;
      })
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>");
  }

  // Auto-open on first inject
  fab.click();
})();
