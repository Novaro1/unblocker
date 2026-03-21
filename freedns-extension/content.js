// ── FreeDNS Account Helper — Content Script ───────────────────────────────────

// ── Generators ────────────────────────────────────────────────────────────────
const ADJECTIVES = ["swift","dark","neon","blue","iron","cool","fast","free","wild","bold"];
const NOUNS      = ["proxy","link","node","wave","core","path","edge","gate","hub","veil"];
const FIRSTNAMES = ["James","Liam","Noah","Oliver","Ethan","Lucas","Mason","Logan","Aiden","Jacob","Emma","Olivia","Ava","Sophia","Isabella","Mia","Charlotte","Amelia","Harper","Evelyn"];
const LASTNAMES  = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Lee","Walker"];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randNum(n) { return Math.floor(Math.random() * n); }
function generateUsername() { return `${rand(ADJECTIVES)}${rand(NOUNS)}${100 + randNum(900)}`; }
function generatePassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$";
  return Array.from({ length: 14 }, () => chars[randNum(chars.length)]).join("");
}

// ── mail.tm API ───────────────────────────────────────────────────────────────
const MAILTM = "https://api.mail.tm";

async function mailtmGetDomain() {
  const r = await fetch(`${MAILTM}/domains?page=1`);
  if (!r.ok) throw new Error(`Domains HTTP ${r.status}`);
  const d = await r.json();
  const domain = d["hydra:member"]?.[0]?.domain;
  if (!domain) throw new Error(`No domains in response: ${JSON.stringify(d).slice(0, 100)}`);
  return domain;
}

async function mailtmNewInbox(username) {
  const domain  = await mailtmGetDomain();
  const address = `${username.toLowerCase()}@${domain}`;
  const password = `Veil${randNum(9999)}xZ!`;

  const cr = await fetch(`${MAILTM}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!cr.ok) {
    const t = await cr.text();
    throw new Error(`Create account HTTP ${cr.status}: ${t.slice(0, 100)}`);
  }

  const tr = await fetch(`${MAILTM}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!tr.ok) throw new Error(`Get token HTTP ${tr.status}`);
  const { token } = await tr.json();
  return { email: address, token };
}

async function mailtmGetMessages(token) {
  const r = await fetch(`${MAILTM}/messages?page=1`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Messages HTTP ${r.status}`);
  const d = await r.json();
  return d["hydra:member"] || [];
}

async function mailtmGetMessage(id, token) {
  const r = await fetch(`${MAILTM}/messages/${id}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Fetch message HTTP ${r.status}`);
  return r.json();
}

async function pushAccountToServer(account) {
  const { serverUrl, apiKey } = await new Promise(r => chrome.storage.local.get(["serverUrl","apiKey"], r));
  const base = (serverUrl || "").replace(/\/$/, "");
  if (!base || !apiKey) return { skipped: true, reason: "not configured" };
  const r = await fetch(`${base}/api/freedns-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: apiKey, username: account.username, password: account.password, email: account.email }),
  });
  return r.json();
}

function extractActivationUrl(text) {
  const m = String(text).match(/https?:\/\/(?:www\.)?freedns\.afraid\.org\/signup\/activate\.php\?[^\s"'<>]+/);
  return m ? m[0] : null;
}

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById("fdh-styles")) return;
  const s = document.createElement("style");
  s.id = "fdh-styles";
  s.textContent = `
    #fdh-bar, #fdh-inbox {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px; box-sizing: border-box;
    }
    #fdh-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
      background: #1e2130; border-bottom: 2px solid #6366f1;
      padding: 8px 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }
    .fdh-title { color: #a5b4fc; font-weight: 700; font-size: 13px; flex-shrink: 0; }
    .fdh-field {
      background: #0f1117; border: 1px solid #2d3148; border-radius: 5px;
      color: #e2e8f0; font-size: 12px; padding: 4px 8px; font-family: monospace;
    }
    .fdh-label { color: #64748b; font-size: 11px; }
    .fdh-btn {
      border: none; border-radius: 6px; cursor: pointer; font-size: 12px;
      font-weight: 600; padding: 6px 12px; transition: filter 0.15s; flex-shrink: 0;
    }
    .fdh-btn:hover:not(:disabled) { filter: brightness(1.15); }
    .fdh-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .fdh-btn-primary { background: #6366f1; color: #fff; }
    .fdh-btn-green   { background: #22c55e; color: #fff; }
    .fdh-btn-sm      { padding: 4px 8px; font-size: 11px; }
    #fdh-status { font-size: 12px; color: #94a3b8; }
    #fdh-status.err { color: #fca5a5; }
    #fdh-creds-row { display: none; align-items: center; gap: 8px; flex-wrap: wrap; }

    #fdh-inbox {
      margin: 12px auto; max-width: 540px; background: #1e2130;
      border: 1.5px solid #6366f1; border-radius: 10px; padding: 14px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #fdh-inbox h2 { color: #a5b4fc; font-size: 14px; margin: 0 0 10px; font-weight: 700; }
    .fdh-email-chip {
      font-family: monospace; background: #0f1117; border: 1px solid #2d3148;
      border-radius: 5px; padding: 4px 10px; color: #e2e8f0; font-size: 13px;
      display: inline-block; margin-bottom: 10px;
    }
    #fdh-inbox-status {
      display: flex; align-items: center; gap: 8px; padding: 8px 10px;
      border-radius: 6px; margin-bottom: 10px; font-size: 12px;
    }
    #fdh-inbox-status.waiting { background: #0f1117; color: #94a3b8; border: 1px solid #2d3148; }
    #fdh-inbox-status.found   { background: #14532d; color: #86efac; border: 1px solid #22c55e55; }
    #fdh-inbox-status.error   { background: #450a0a; color: #fca5a5; border: 1px solid #ef444455; }
    .fdh-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    #fdh-inbox-status.waiting .fdh-dot { background: #475569; animation: fdh-pulse 1.4s infinite; }
    #fdh-inbox-status.found   .fdh-dot { background: #22c55e; }
    #fdh-inbox-status.error   .fdh-dot { background: #ef4444; }
    @keyframes fdh-pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
    #fdh-activate-btn { display:none; width:100%; padding:10px; font-size:14px; margin-bottom:8px; }
    .fdh-inbox-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  `;
  document.head.appendChild(s);
}

// ── SIGNUP PAGE — floating fill bar ──────────────────────────────────────────
function injectFillBar() {
  injectStyles();
  if (document.getElementById("fdh-bar")) return;

  const bar = document.createElement("div");
  bar.id = "fdh-bar";
  bar.innerHTML = `
    <span class="fdh-title">FreeDNS Helper</span>
    <button class="fdh-btn fdh-btn-primary" id="fdh-fill-btn">Auto-Fill Form</button>
    <span id="fdh-status">Click to generate credentials and fill the form.</span>
    <div id="fdh-creds-row">
      <span class="fdh-label">Email:</span>
      <input class="fdh-field" id="fdh-email-val" readonly style="max-width:200px">
      <button class="fdh-btn fdh-btn-sm fdh-btn-primary" id="fdh-copy-email">Copy</button>
      <span class="fdh-label" style="margin-left:6px">Pass:</span>
      <input class="fdh-field" id="fdh-pass-val" readonly style="max-width:130px">
      <button class="fdh-btn fdh-btn-sm fdh-btn-primary" id="fdh-copy-pass">Copy</button>
    </div>
  `;
  document.body.prepend(bar);
  document.body.style.paddingTop = "52px";

  document.getElementById("fdh-fill-btn").addEventListener("click", async () => {
    const fillBtn  = document.getElementById("fdh-fill-btn");
    const statusEl = document.getElementById("fdh-status");
    const credsRow = document.getElementById("fdh-creds-row");

    fillBtn.disabled = true;
    fillBtn.textContent = "Working…";
    statusEl.className = "";
    statusEl.textContent = "Creating temp inbox via mail.tm…";
    credsRow.style.display = "none";

    const u = generateUsername();
    let email = "", token = "";

    try {
      ({ email, token } = await mailtmNewInbox(u));
      statusEl.textContent = "Got inbox! Filling form…";
    } catch (e) {
      statusEl.className = "err";
      statusEl.textContent = `⚠ mail.tm error: ${e.message}`;
      fillBtn.textContent = "↻ Retry";
      fillBtn.disabled = false;
      return;
    }

    const creds = {
      username: u, password: generatePassword(), email, token,
      firstName: rand(FIRSTNAMES), lastName: rand(LASTNAMES),
    };

    doFillForm(creds);
    chrome.storage.local.set({ pendingVerify: creds });

    document.getElementById("fdh-email-val").value = email;
    document.getElementById("fdh-pass-val").value  = creds.password;
    document.getElementById("fdh-copy-email").onclick = () => navigator.clipboard.writeText(email);
    document.getElementById("fdh-copy-pass").onclick  = () => navigator.clipboard.writeText(creds.password);
    credsRow.style.display = "flex";

    statusEl.className = "";
    statusEl.textContent = "Form filled! Solve the CAPTCHA and submit.";
    fillBtn.textContent = "↻ Refill";
    fillBtn.disabled = false;
  });
}

// ── SUCCESS PAGE — embedded inbox panel ───────────────────────────────────────
function injectInboxPanel() {
  injectStyles();
  if (document.getElementById("fdh-inbox")) return;

  chrome.storage.local.get("pendingVerify", ({ pendingVerify }) => {
    const creds = pendingVerify;

    const panel = document.createElement("div");
    panel.id = "fdh-inbox";

    if (!creds?.email || !creds?.token) {
      panel.innerHTML = `<h2>FreeDNS Helper</h2>
        <p style="color:#94a3b8;font-size:12px">No temp inbox found — go back and use the Auto-Fill button to create an account.</p>`;
      insertPanel(panel);
      return;
    }

    panel.innerHTML = `
      <h2>FreeDNS Helper — Email Verification</h2>
      <div>Inbox: <span class="fdh-email-chip">${escHtml(creds.email)}</span></div>
      <div id="fdh-inbox-status" class="waiting">
        <span class="fdh-dot"></span>
        <span id="fdh-inbox-text">Checking for activation email…</span>
      </div>
      <button class="fdh-btn fdh-btn-green" id="fdh-activate-btn">Activate Account →</button>
      <div class="fdh-inbox-row">
        <button class="fdh-btn fdh-btn-primary fdh-btn-sm" id="fdh-refresh-btn">Check Now</button>
        <span style="color:#475569;font-size:11px">Auto-checks every 6 seconds</span>
      </div>
    `;
    insertPanel(panel);

    let pollTimer = null;
    let done = false;

    function setStatus(state, text) {
      const s = document.getElementById("fdh-inbox-status");
      if (s) s.className = `fdh-inbox-status ${state}`;
      const t = document.getElementById("fdh-inbox-text");
      if (t) t.textContent = text;
    }

    async function checkInbox() {
      if (done) return;
      try {
        const msgs = await mailtmGetMessages(creds.token);
        if (!msgs.length) {
          setStatus("waiting", "No emails yet — waiting…");
          return;
        }
        // Pick the FreeDNS activation email
        const target = msgs.find(m =>
          /afraid\.org/i.test(m.from?.address || "") ||
          /activate|confirm|verify/i.test(m.subject || "")
        ) || msgs[0];

        const full = await mailtmGetMessage(target.id, creds.token);
        const body = full.html?.[0] || full.text || "";
        const url  = extractActivationUrl(body);

        if (url) {
          done = true;
          clearInterval(pollTimer);
          setStatus("found", "Activation email received!");
          const btn = document.getElementById("fdh-activate-btn");
          if (btn) { btn.style.display = "block"; btn.onclick = () => window.open(url, "_blank"); }

          // Auto-save locally
          chrome.storage.local.get("accounts", ({ accounts }) => {
            const list = accounts || [];
            const { username, password, email, firstName, lastName } = creds;
            if (!list.some(a => a.username === username)) {
              list.push({ username, password, email, firstName, lastName });
              chrome.storage.local.set({ accounts: list });
            }
          });
          chrome.storage.local.remove("pendingVerify");

          // Push to server
          const statusEl = document.getElementById("fdh-inbox-text");
          pushAccountToServer(creds)
            .then(d => {
              if (statusEl) statusEl.textContent = d.skipped
                ? "Activation email received! Account already on server."
                : `Activation email received! Added to server (pool: ${d.poolSize}).`;
            })
            .catch(e => {
              if (statusEl) statusEl.textContent = `Activation email received! (Server push failed: ${e.message})`;
            });
        } else {
          setStatus("waiting", `Email from "${escHtml(target.from?.address || "?")}" — no activation link yet.`);
        }
      } catch (e) {
        setStatus("error", `Check failed: ${e.message}`);
      }
    }

    document.getElementById("fdh-refresh-btn").addEventListener("click", () => {
      clearInterval(pollTimer);
      checkInbox();
      pollTimer = setInterval(checkInbox, 6000);
    });

    checkInbox();
    pollTimer = setInterval(checkInbox, 6000);
  });
}

function insertPanel(el) {
  const anchor = document.querySelector("h1, h2, .content, #content, form");
  if (anchor) anchor.insertAdjacentElement("beforebegin", el);
  else document.body.prepend(el);
}

// ── Form fill ─────────────────────────────────────────────────────────────────
function doFillForm({ username, password, email, firstName, lastName }) {
  setField('input[name="username"]',  username);
  setField('input[name="password"]',  password);
  setField('input[name="password2"]', password);
  setField('input[name="email"]',     email);
  setField('input[name="email2"]',    email);
  setField('input[name="firstname"]', firstName);
  setField('input[name="lastname"]',  lastName);
  const captcha = document.querySelector('img[src*="captcha"], img[src*="securimage"]');
  if (captcha) { captcha.style.outline = "3px solid #6366f1"; captcha.scrollIntoView({ behavior: "smooth", block: "center" }); }
}

function setField(sel, value) {
  const el = document.querySelector(sel);
  if (!el || !value) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Route ─────────────────────────────────────────────────────────────────────
const isSignup  = location.href.includes("/signup");
const isSuccess = document.body?.textContent?.includes("The process has begun");

if (isSignup && !isSuccess) {
  injectFillBar();
  chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    if (msg.type === "fill") { doFillForm(msg); sendResponse({ ok: true }); }
  });
  chrome.storage.local.get("pendingFill", ({ pendingFill }) => {
    if (!pendingFill) return;
    doFillForm(pendingFill);
    chrome.storage.local.remove("pendingFill");
  });
}

if (isSuccess) {
  injectInboxPanel();
}
