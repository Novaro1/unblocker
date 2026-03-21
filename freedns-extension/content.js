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
  // Stick to alphanumeric — some services reject special chars in passwords
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 14 }, () => chars[randNum(chars.length)]).join("");
}

// ── Email services ────────────────────────────────────────────────────────────
// Tries mail.tm first, then Guerrilla Mail domains as fallback.

const MAILTM = "https://api.mail.tm";
const GM     = "https://api.guerrillamail.com/ajax.php";
// Guerrilla Mail domains less likely to be on disposable-email blocklists
const GM_DOMAINS = ["grr.la", "spam4.me", "guerrillamail.de", "guerrillamail.net", "guerrillamail.org"];

async function mailtmNewInbox(username) {
  const dr = await fetch(`${MAILTM}/domains?page=1`);
  if (!dr.ok) throw new Error(`mail.tm domains HTTP ${dr.status}`);
  const dd = await dr.json();
  const domain = dd["hydra:member"]?.[0]?.domain;
  if (!domain) throw new Error("No mail.tm domains available");

  const address  = `${username.toLowerCase()}@${domain}`;
  const password = generatePassword();
  const cr = await fetch(`${MAILTM}/accounts`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!cr.ok) { const t = await cr.text(); throw new Error(`mail.tm create HTTP ${cr.status}: ${t.slice(0,80)}`); }
  const tr = await fetch(`${MAILTM}/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  if (!tr.ok) throw new Error(`mail.tm token HTTP ${tr.status}`);
  const { token } = await tr.json();
  return { email: address, token, service: "mailtm" };
}

async function gmNewInbox(username) {
  for (const domain of GM_DOMAINS) {
    try {
      const r = await fetch(`${GM}?f=set_email_user&email_user=${encodeURIComponent(username)}&email_domain=${domain}&lang=en&sid_token=`, {
        credentials: "omit",
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.email_addr) return { email: d.email_addr, token: d.sid_token || "", service: "guerrillamail" };
    } catch {}
  }
  throw new Error("All Guerrilla Mail domains failed");
}

async function getNewInbox(username) {
  try { return await mailtmNewInbox(username); } catch (e) {
    console.warn("[FreeDNS Helper] mail.tm failed, trying Guerrilla Mail:", e.message);
  }
  try { return await gmNewInbox(username); } catch (e) {
    console.warn("[FreeDNS Helper] Guerrilla Mail failed:", e.message);
  }
  throw new Error("All email services failed");
}

// Poll for activation email
async function checkForActivationEmail(service, token) {
  if (service === "mailtm") {
    const r = await fetch(`${MAILTM}/messages?page=1`, { headers: { "Authorization": `Bearer ${token}` } });
    if (!r.ok) throw new Error(`mail.tm messages HTTP ${r.status}`);
    const d = await r.json();
    const msgs = d["hydra:member"] || [];
    for (const m of msgs) {
      const full = await fetch(`${MAILTM}/messages/${m.id}`, { headers: { "Authorization": `Bearer ${token}` } }).then(r => r.json());
      const url = extractActivationUrl(full.html?.[0] || full.text || "");
      if (url) return url;
    }
  } else if (service === "guerrillamail") {
    const r = await fetch(`${GM}?f=check_email&seq=0&sid_token=${encodeURIComponent(token)}`, { credentials: "omit" });
    if (!r.ok) throw new Error(`GM check HTTP ${r.status}`);
    const d = await r.json();
    const list = d.list || [];
    for (const m of list) {
      const full = await fetch(`${GM}?f=fetch_email&email_id=${m.mail_id}&sid_token=${encodeURIComponent(token)}`, { credentials: "omit" }).then(r => r.json());
      const url = extractActivationUrl(full.mail_body || full.mail_excerpt || "");
      if (url) return url;
    }
  }
  return null;
}

function extractActivationUrl(text) {
  const m = String(text).match(/https?:\/\/(?:www\.)?freedns\.afraid\.org\/signup\/activate\.php\?[^\s"'<>]+/);
  return m ? m[0] : null;
}

// ── Push to server ────────────────────────────────────────────────────────────
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
    .fdh-field:focus { outline: none; border-color: #6366f1; }
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
      margin: 12px auto; max-width: 560px; background: #1e2130;
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
    .fdh-inbox-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
    .fdh-divider { border: none; border-top: 1px solid #2d3148; margin: 10px 0; }
    .fdh-manual-row { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
    .fdh-manual-row input {
      flex: 1; background: #0f1117; border: 1px solid #2d3148; border-radius: 5px;
      color: #e2e8f0; font-size: 12px; padding: 5px 8px; font-family: monospace;
    }
    .fdh-manual-row input:focus { outline: none; border-color: #6366f1; }
    .fdh-hint { color: #475569; font-size: 11px; margin-top: 4px; }
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
      <input class="fdh-field" id="fdh-email-val" style="max-width:220px" placeholder="your@email.com" title="You can edit this — use any real email if temp services are blocked">
      <button class="fdh-btn fdh-btn-sm fdh-btn-primary" id="fdh-copy-email">Copy</button>
      <span class="fdh-label" style="margin-left:4px">Pass:</span>
      <input class="fdh-field" id="fdh-pass-val" readonly style="max-width:130px">
      <button class="fdh-btn fdh-btn-sm fdh-btn-primary" id="fdh-copy-pass">Copy</button>
      <button class="fdh-btn fdh-btn-sm fdh-btn-green" id="fdh-refill-btn">↻ Refill form</button>
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
    statusEl.textContent = "Getting temp inbox…";
    credsRow.style.display = "none";

    const u = generateUsername();
    let email = "", token = "", service = "manual";

    try {
      ({ email, token, service } = await getNewInbox(u));
      statusEl.textContent = `Got inbox (${service})! Filling form…`;
    } catch (e) {
      statusEl.className = "err";
      statusEl.textContent = `⚠ Temp email failed: ${e.message} — edit the email field to use your own, then click ↻ Refill form.`;
      email = "";
    }

    const creds = {
      username: u, password: generatePassword(), email, token, service,
      firstName: rand(FIRSTNAMES), lastName: rand(LASTNAMES),
    };

    doFillForm(creds);
    chrome.storage.local.set({ pendingVerify: creds });

    const emailInput = document.getElementById("fdh-email-val");
    emailInput.value = email;
    // When user manually edits the email, update pendingVerify
    emailInput.addEventListener("change", () => {
      creds.email = emailInput.value.trim();
      creds.service = "manual";
      chrome.storage.local.set({ pendingVerify: creds });
      setField('input[name="email"]',  creds.email);
      setField('input[name="email2"]', creds.email);
    });

    document.getElementById("fdh-pass-val").value = creds.password;
    document.getElementById("fdh-copy-email").onclick = () => navigator.clipboard.writeText(emailInput.value);
    document.getElementById("fdh-copy-pass").onclick  = () => navigator.clipboard.writeText(creds.password);
    document.getElementById("fdh-refill-btn").onclick = () => {
      creds.email = emailInput.value.trim();
      setField('input[name="email"]',  creds.email);
      setField('input[name="email2"]', creds.email);
      doFillForm(creds);
      statusEl.textContent = "Re-filled!";
    };
    credsRow.style.display = "flex";

    if (!email) {
      statusEl.className = "err";
      statusEl.textContent = "⚠ Temp email unavailable. Enter your own email above, then click ↻ Refill form.";
    } else {
      statusEl.className = "";
      statusEl.textContent = "Form filled! Solve the CAPTCHA and submit.";
    }
    fillBtn.textContent = "↻ Regenerate";
    fillBtn.disabled = false;
  });
}

// ── SUCCESS PAGE — embedded inbox panel ───────────────────────────────────────
function injectInboxPanel() {
  injectStyles();
  if (document.getElementById("fdh-inbox")) return;

  chrome.storage.local.get("pendingVerify", ({ pendingVerify }) => {
    const creds = pendingVerify;
    const hasTempInbox = creds?.token && creds?.service && creds.service !== "manual";

    const panel = document.createElement("div");
    panel.id = "fdh-inbox";

    const emailChip = creds?.email
      ? `<div>Inbox: <span class="fdh-email-chip">${escHtml(creds.email)}</span></div>`
      : "";

    panel.innerHTML = `
      <h2>FreeDNS Helper — Email Verification</h2>
      ${emailChip}
      <div id="fdh-inbox-status" class="${hasTempInbox ? "waiting" : "error"}">
        <span class="fdh-dot"></span>
        <span id="fdh-inbox-text">${hasTempInbox
          ? "Checking for activation email…"
          : "No temp inbox — paste your activation link below."
        }</span>
      </div>
      <button class="fdh-btn fdh-btn-green" id="fdh-activate-btn" style="display:none;width:100%;padding:10px;font-size:14px;margin-bottom:8px">
        Activate Account →
      </button>

      <hr class="fdh-divider">
      <div class="fdh-label" style="margin-bottom:6px">PASTE ACTIVATION LINK (from your email)</div>
      <div class="fdh-manual-row">
        <input id="fdh-link-input" placeholder="https://freedns.afraid.org/signup/activate.php?...">
        <button class="fdh-btn fdh-btn-green fdh-btn-sm" id="fdh-link-btn">Activate</button>
      </div>
      <div class="fdh-hint">FreeDNS sends an activation link — paste it here if auto-detect doesn't work.</div>

      ${hasTempInbox ? `
      <div class="fdh-inbox-row" style="margin-top:10px">
        <button class="fdh-btn fdh-btn-primary fdh-btn-sm" id="fdh-refresh-btn">Check Inbox Now</button>
        <span style="color:#475569;font-size:11px">Auto-checks every 6s</span>
      </div>` : ""}
    `;
    insertPanel(panel);

    // Manual paste handler
    document.getElementById("fdh-link-btn").addEventListener("click", () => {
      const url = document.getElementById("fdh-link-input").value.trim();
      if (!url.includes("activate.php")) {
        setStatus("error", "That doesn't look like a FreeDNS activation link.");
        return;
      }
      handleActivation(url, creds);
    });
    document.getElementById("fdh-link-input").addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("fdh-link-btn").click();
    });

    if (!hasTempInbox) return;

    // Auto-poll
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
        const url = await checkForActivationEmail(creds.service, creds.token);
        if (url) {
          done = true;
          clearInterval(pollTimer);
          handleActivation(url, creds);
        } else {
          setStatus("waiting", "No activation email yet — waiting…");
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

function handleActivation(url, creds) {
  const statusEl = document.getElementById("fdh-inbox-status");
  if (statusEl) statusEl.className = "fdh-inbox-status found";
  const textEl = document.getElementById("fdh-inbox-text");

  const btn = document.getElementById("fdh-activate-btn");
  if (btn) { btn.style.display = "block"; btn.onclick = () => window.open(url, "_blank"); }

  // Auto-save locally
  if (creds) {
    chrome.storage.local.get("accounts", ({ accounts }) => {
      const list = accounts || [];
      const { username, password, email, firstName, lastName } = creds;
      if (username && !list.some(a => a.username === username)) {
        list.push({ username, password, email, firstName, lastName });
        chrome.storage.local.set({ accounts: list });
      }
    });

    // Push to server
    pushAccountToServer(creds)
      .then(d => {
        if (textEl) textEl.textContent = d.skipped
          ? "Ready! Account already on server."
          : `Ready! Added to server (pool: ${d.poolSize}).`;
      })
      .catch(e => {
        if (textEl) textEl.textContent = `Activation found! (Server push failed: ${e.message} — use Push All in popup)`;
      });

    chrome.storage.local.remove("pendingVerify");
  }
}

function setStatus(state, text) {
  const s = document.getElementById("fdh-inbox-status");
  if (s) s.className = `fdh-inbox-status ${state}`;
  const t = document.getElementById("fdh-inbox-text");
  if (t) t.textContent = text;
}

function insertPanel(el) {
  const anchor = document.querySelector("h1, h2, form, .content, #content");
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
  if (!el || value == null) return;
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

if (isSuccess) injectInboxPanel();
