// ── Veil AI floating chat widget ─────────────────────────────────────────────
// Self-contained — injects its own styles + DOM, works on any page.

(function () {
  if (document.getElementById("vai-root")) return; // already mounted

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #vai-root * { box-sizing: border-box; margin: 0; padding: 0; }

    /* Fab button */
    #vai-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483646;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: #6366f1;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(99,102,241,0.45);
      transition: transform 0.18s, box-shadow 0.18s;
      color: #fff;
    }
    #vai-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(99,102,241,0.6); }
    #vai-fab.open  { background: #4f46e5; }

    /* Panel */
    #vai-panel {
      position: fixed;
      bottom: 88px;
      right: 24px;
      z-index: 2147483645;
      width: 360px;
      height: 520px;
      background: #0e0e1e;
      border: 1px solid #1e1e38;
      border-radius: 16px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: ui-rounded, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      opacity: 0;
      transform: translateY(12px) scale(0.97);
      pointer-events: none;
      transition: opacity 0.18s, transform 0.18s;
    }
    #vai-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    /* Panel header */
    #vai-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid #1e1e38;
      flex-shrink: 0;
      background: #0e0e1e;
    }
    #vai-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #ecedf8;
    }
    #vai-header-right { display: flex; align-items: center; gap: 6px; }
    .vai-icon-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: #6264a0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      padding: 4px;
      transition: color 0.15s, background 0.15s;
    }
    .vai-icon-btn:hover { color: #ecedf8; background: #15152a; }

    /* Model picker */
    #vai-model {
      background: #15152a;
      border: 1px solid #1e1e38;
      border-radius: 6px;
      color: #a5b4fc;
      font-size: 11px;
      font-family: inherit;
      padding: 3px 6px;
      cursor: pointer;
      outline: none;
    }
    #vai-model:focus { border-color: #6366f1; }

    /* Screen share */
    #vai-screen-bar {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(74,222,128,0.06);
      border-bottom: 1px solid rgba(74,222,128,0.15);
      font-size: 11px;
      color: #4ade80;
      flex-shrink: 0;
    }
    #vai-screen-bar.show { display: flex; }
    #vai-screen-canvas {
      border-radius: 4px;
      border: 1px solid #4ade8033;
      max-width: 80px;
      max-height: 50px;
    }
    #vai-screen-stop {
      margin-left: auto;
      background: none;
      border: 1px solid #4ade8033;
      border-radius: 5px;
      color: #4ade80;
      font-size: 10px;
      font-family: inherit;
      padding: 2px 8px;
      cursor: pointer;
    }

    /* Messages */
    #vai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }
    #vai-messages::-webkit-scrollbar { width: 4px; }
    #vai-messages::-webkit-scrollbar-thumb { background: #1e1e38; border-radius: 4px; }

    #vai-empty {
      margin: auto;
      text-align: center;
      color: #6264a0;
      font-size: 12px;
      line-height: 1.6;
    }
    #vai-empty svg { display: block; margin: 0 auto 8px; opacity: 0.5; }

    .vai-msg {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .vai-msg.user { flex-direction: row-reverse; }
    .vai-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }
    .vai-msg.ai   .vai-avatar { background: #6366f1; }
    .vai-msg.user .vai-avatar { background: #1e1e38; }
    .vai-bubble {
      max-width: 82%;
      padding: 8px 11px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.55;
      color: #ecedf8;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .vai-msg.ai   .vai-bubble { background: #15152a; border: 1px solid #1e1e38; border-radius: 12px 12px 12px 3px; }
    .vai-msg.user .vai-bubble { background: #6366f1; border-radius: 12px 12px 3px 12px; }

    /* Markdown inside bubble */
    .vai-bubble p  { margin-bottom: 6px; }
    .vai-bubble p:last-child { margin-bottom: 0; }
    .vai-bubble code {
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 12px;
      font-family: ui-monospace, monospace;
    }
    .vai-bubble pre {
      background: rgba(0,0,0,0.35);
      border-radius: 7px;
      padding: 8px 10px;
      overflow-x: auto;
      margin: 4px 0;
    }
    .vai-bubble pre code { background: none; padding: 0; }
    .vai-bubble strong { font-weight: 700; }
    .vai-bubble em { font-style: italic; }

    /* Typing dots */
    .vai-typing { display: flex; gap: 4px; align-items: center; padding: 6px 0; }
    .vai-dot {
      width: 6px; height: 6px;
      background: #6264a0;
      border-radius: 50%;
      animation: vai-bounce 1.2s infinite;
    }
    .vai-dot:nth-child(2) { animation-delay: 0.2s; }
    .vai-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes vai-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

    /* Input */
    #vai-input-row {
      flex-shrink: 0;
      display: flex;
      gap: 8px;
      align-items: flex-end;
      padding: 10px 12px;
      border-top: 1px solid #1e1e38;
      background: #0e0e1e;
    }
    #vai-input {
      flex: 1;
      background: #15152a;
      border: 1px solid #1e1e38;
      border-radius: 10px;
      color: #ecedf8;
      font-size: 13px;
      font-family: inherit;
      padding: 8px 11px;
      resize: none;
      outline: none;
      min-height: 36px;
      max-height: 120px;
      line-height: 1.5;
      transition: border-color 0.15s;
    }
    #vai-input:focus { border-color: #6366f1; }
    #vai-input::placeholder { color: #6264a0; }
    #vai-send {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: none;
      background: #6366f1;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: filter 0.15s, opacity 0.15s;
    }
    #vai-send:hover:not(:disabled) { filter: brightness(1.12); }
    #vai-send:disabled { opacity: 0.35; cursor: not-allowed; }
    #vai-screen-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid #1e1e38;
      background: none;
      color: #6264a0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    #vai-screen-btn:hover { color: #ecedf8; border-color: #6366f1; }
    #vai-screen-btn.active { color: #4ade80; border-color: #4ade8055; background: rgba(74,222,128,0.07); }
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
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
          <button class="vai-icon-btn" id="vai-popout-btn" title="Open full AI page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
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
        <button id="vai-screen-btn" title="Share screen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </button>
        <textarea id="vai-input" placeholder="Ask anything…" rows="1"></textarea>
        <button id="vai-send" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const fab         = document.getElementById("vai-fab");
  const panel       = document.getElementById("vai-panel");
  const messagesEl  = document.getElementById("vai-messages");
  const emptyEl     = document.getElementById("vai-empty");
  const inputEl     = document.getElementById("vai-input");
  const sendBtn     = document.getElementById("vai-send");
  const modelSelect = document.getElementById("vai-model");
  const clearBtn    = document.getElementById("vai-clear-btn");
  const popoutBtn   = document.getElementById("vai-popout-btn");
  const screenBtn   = document.getElementById("vai-screen-btn");
  const screenBar   = document.getElementById("vai-screen-bar");
  const screenCanvas= document.getElementById("vai-screen-canvas");
  const screenStop  = document.getElementById("vai-screen-stop");
  const screenCtx   = screenCanvas.getContext("2d");

  // ── State ────────────────────────────────────────────────────────────────────
  const history = [];
  let isLoading    = false;
  let screenStream = null;
  let screenVideo  = null;
  let screenTick   = null;

  // ── FAB toggle ───────────────────────────────────────────────────────────────
  fab.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    fab.classList.toggle("open", open);
    if (open) { inputEl.focus(); }
  });

  // ── Clear ────────────────────────────────────────────────────────────────────
  clearBtn.addEventListener("click", () => {
    history.length = 0;
    messagesEl.innerHTML = "";
    messagesEl.appendChild(emptyEl);
  });

  // ── Pop-out ──────────────────────────────────────────────────────────────────
  popoutBtn.addEventListener("click", () => {
    window.open("/ai", "_blank");
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
        const maxW = 80, maxH = 50;
        const scale = Math.min(maxW / vw, maxH / vh, 1);
        screenCanvas.width  = Math.round(vw * scale);
        screenCanvas.height = Math.round(vh * scale);
        screenCtx.drawImage(screenVideo, 0, 0, screenCanvas.width, screenCanvas.height);
      }, 200);

      screenBtn.classList.add("active");
      screenBar.classList.add("show");
      modelSelect.value = "meta-llama/llama-4-scout-17b-16e-instruct";
    } catch (e) {
      if (e.name !== "NotAllowedError") console.warn("Screen share:", e);
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
    if (!screenVideo || screenVideo.readyState < 2) return null;
    const vw = screenVideo.videoWidth, vh = screenVideo.videoHeight;
    if (!vw || !vh) return null;
    const cap = document.createElement("canvas");
    cap.width = vw; cap.height = vh;
    cap.getContext("2d").drawImage(screenVideo, 0, 0, vw, vh);
    return cap.toDataURL("image/jpeg", 0.85).split(",")[1];
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

    fetch("/api/ai", {
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
        inputEl.focus();
      });
  }

  // ── Render helpers ───────────────────────────────────────────────────────────
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
    wrap.innerHTML = `
      <div class="vai-avatar"><svg width="12" height="12" viewBox="0 0 32 32" fill="none"><line x1="4" y1="21" x2="28" y2="21" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-linecap="round"/><path d="M8 26 L16 13 L24 26" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="vai-bubble"><div class="vai-typing"><span class="vai-dot"></span><span class="vai-dot"></span><span class="vai-dot"></span></div></div>
    `;
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
})();
