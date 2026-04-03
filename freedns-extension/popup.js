// ── Name / word lists ─────────────────────────────────────────────────────────

const ADJECTIVES = ["bright","calm","clear","green","steady","prime","solid","smart","keen","true"];
const NOUNS      = ["study","notes","class","learn","read","desk","quiz","math","plan","lab"];
const FIRSTNAMES = ["James","Liam","Noah","Oliver","Ethan","Lucas","Mason","Logan","Aiden","Jacob","Emma","Olivia","Ava","Sophia","Isabella","Mia","Charlotte","Amelia","Harper","Evelyn"];
const LASTNAMES  = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Lee","Walker"];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randNum(n) { return Math.floor(Math.random() * n); }

function generateUsername() {
  return `${rand(FIRSTNAMES).toLowerCase()}${rand(LASTNAMES).toLowerCase()}${10 + randNum(90)}`;
}
function generatePassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$";
  return Array.from({ length: 14 }, () => chars[randNum(chars.length)]).join("");
}

// ── 1secmail API ──────────────────────────────────────────────────────────────
const ONESEC = "https://www.1secmail.com/api/v1/";
const ONESEC_DOMAINS = ["1secmail.com", "1secmail.org", "1secmail.net", "esiix.com", "wwjmp.com", "xojxe.com"];

async function onesecNewInbox(username) {
  const domain = ONESEC_DOMAINS[Math.floor(Math.random() * ONESEC_DOMAINS.length)];
  const email = `${username.toLowerCase()}@${domain}`;
  // 1secmail doesn't need account creation — just start using the address
  return { email, token: JSON.stringify({ login: username.toLowerCase(), domain }) };
}

async function onesecGetMessages(token) {
  const { login, domain } = JSON.parse(token);
  const r = await fetch(`${ONESEC}?action=getMessages&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}`);
  if (!r.ok) throw new Error(`Messages HTTP ${r.status}`);
  return r.json();
}

async function onesecGetMessage(id, token) {
  const { login, domain } = JSON.parse(token);
  const r = await fetch(`${ONESEC}?action=readMessage&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}&id=${id}`);
  if (!r.ok) throw new Error(`Message HTTP ${r.status}`);
  return r.json();
}

function extractActivationUrl(text) {
  const m = String(text).match(/https?:\/\/(?:www\.)?freedns\.afraid\.org\/signup\/activate\.php\?[^\s"'<>]+/);
  return m ? m[0] : null;
}

// ── State ─────────────────────────────────────────────────────────────────────

let current = { username: "", password: "", email: "", sid_token: "", firstName: "", lastName: "" };
let pollTimer = null;

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadAccounts(cb) {
  chrome.storage.local.get("accounts", ({ accounts }) => cb(accounts || []));
}
function saveAccounts(accounts, cb) {
  chrome.storage.local.set({ accounts }, cb);
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function fillFields() {
  document.getElementById("gen-firstname").value = current.firstName;
  document.getElementById("gen-lastname").value  = current.lastName;
  document.getElementById("gen-user").value      = current.username;
  document.getElementById("gen-pass").value      = current.password;
  document.getElementById("gen-email").value     = current.email || "";
}

function setVerifyStatus(state, text) {
  const el = document.getElementById("verify-status");
  el.className = `verify-status ${state}`;
  document.getElementById("verify-text").textContent = text;
}

function showActivateBtn(url) {
  const btn = document.getElementById("btn-activate");
  btn.style.display = "";
  btn.onclick = () => chrome.tabs.create({ url });
}

function hideActivateBtn() {
  document.getElementById("btn-activate").style.display = "none";
}

function toast(msg, color = "#22c55e") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.style.background = color;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1800);
}

function renderList(accounts) {
  const el = document.getElementById("accounts-list");
  document.getElementById("acct-count").textContent = accounts.length;
  if (!accounts.length) { el.innerHTML = `<div class="empty">No accounts saved yet.</div>`; return; }
  el.innerHTML = accounts.map((a, i) => `
    <div class="account-item">
      <span class="username" title="${escHtml(a.username)}">${escHtml(a.username)}</span>
      <span style="color:#475569;font-size:11px;flex-shrink:0">${escHtml((a.email || "").split("@")[1] || "")}</span>
      <button class="del-btn" data-idx="${i}" title="Remove">×</button>
    </div>
  `).join("");
  el.querySelectorAll(".del-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      loadAccounts(acc => { acc.splice(idx, 1); saveAccounts(acc, () => renderList(acc)); });
    });
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Inbox polling ─────────────────────────────────────────────────────────────

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function checkInbox() {
  const { pendingVerify } = await new Promise(r => chrome.storage.local.get("pendingVerify", r));
  const tok = pendingVerify?.token || current.token;
  if (!tok) { setVerifyStatus("waiting", "No pending verification — fill and submit the signup form first."); return; }

  setVerifyStatus("waiting", "Checking inbox…");
  try {
    const msgs = await onesecGetMessages(tok);
    if (!msgs.length) {
      setVerifyStatus("waiting", "No activation email yet. Checks every 6 seconds.");
      return;
    }

    const target = msgs.find(m =>
      /afraid\.org/i.test(m.from || "") || /activate|confirm|verify/i.test(m.subject || "")
    ) || msgs[0];

    const full = await onesecGetMessage(target.id, tok);
    const body = full.htmlBody || full.textBody || full.body || "";
    const url  = extractActivationUrl(body);

    if (url) {
      setVerifyStatus("found", "Activation email received! Click the button to activate.");
      showActivateBtn(url);
      stopPolling();
      if (pendingVerify) {
        const { username, password, email, firstName, lastName } = pendingVerify;
        loadAccounts(acc => {
          if (!acc.some(a => a.username === username)) {
            acc.push({ username, password, email, firstName, lastName });
            saveAccounts(acc, () => renderList(acc));
          }
        });
        chrome.storage.local.remove("pendingVerify");
      }
    } else {
      setVerifyStatus("waiting", `Email from "${escHtml(target.from?.address || "?")}" — no activation link yet.`);
    }
  } catch (e) {
    setVerifyStatus("error", `Inbox check failed: ${e.message}`);
  }
}

function startPolling() {
  stopPolling();
  checkInbox();
  pollTimer = setInterval(checkInbox, 6000);
}

// ── Generate ──────────────────────────────────────────────────────────────────

async function generate() {
  document.getElementById("btn-fill").disabled = true;
  document.getElementById("btn-regen").disabled = true;
  const emailEl = document.getElementById("gen-email");
  emailEl.placeholder = "Fetching inbox…";
  emailEl.value = "";
  emailEl.style.borderColor = "";

  const u = generateUsername();
  let email = "", sid_token = "";
  let token = "";
  try {
    ({ email, token } = await onesecNewInbox(u));
  } catch (e) {
    emailEl.placeholder = `Error: ${e.message}`;
    emailEl.style.borderColor = "#ef4444";
    toast("Could not get temp email — click ↻ to retry", "#ef4444");
    document.getElementById("btn-regen").disabled = false;
    current = { username: u, password: generatePassword(), email: "", token: "", firstName: rand(FIRSTNAMES), lastName: rand(LASTNAMES) };
    document.getElementById("gen-firstname").value = current.firstName;
    document.getElementById("gen-lastname").value  = current.lastName;
    document.getElementById("gen-user").value      = current.username;
    document.getElementById("gen-pass").value      = current.password;
    return;
  }

  current = {
    username:  u,
    password:  generatePassword(),
    email,
    token,
    firstName: rand(FIRSTNAMES),
    lastName:  rand(LASTNAMES),
  };

  fillFields();
  document.getElementById("btn-fill").disabled = false;
  document.getElementById("btn-regen").disabled = false;
  hideActivateBtn();
  setVerifyStatus("waiting", "Submit the signup form to start watching for the activation email.");
  stopPolling();
}

// ── Init ──────────────────────────────────────────────────────────────────────

generate();
loadAccounts(renderList);

// Load saved server IP into field
chrome.storage.local.get("serverIp", ({ serverIp }) => {
  if (serverIp) document.getElementById("cfg-ip").value = serverIp;
});

// Restore pending verify state if popup was closed mid-flow
chrome.storage.local.get("pendingVerify", ({ pendingVerify }) => {
  if (!pendingVerify) return;
  setVerifyStatus("waiting", `Watching inbox for ${pendingVerify.email}…`);
  startPolling();
});

// ── Button handlers ───────────────────────────────────────────────────────────

document.getElementById("btn-regen").addEventListener("click", generate);

document.getElementById("btn-fill").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const isSignup = tab?.url?.startsWith("https://freedns.afraid.org/signup");
    // Store pendingVerify so the content script and popup can both access it
    chrome.storage.local.set({ pendingVerify: { ...current } });

    if (isSignup) {
      chrome.tabs.sendMessage(tab.id, { type: "fill", ...current }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) toast("Could not reach page. Reload it.", "#ef4444");
        else { toast("Form filled!"); setVerifyStatus("waiting", `Watching inbox for ${current.email}…`); startPolling(); }
      });
    } else {
      chrome.storage.local.set({ pendingFill: { ...current } }, () => {
        chrome.tabs.create({ url: "https://freedns.afraid.org/signup/" });
      });
      toast("Opening FreeDNS signup…");
      setVerifyStatus("waiting", `Will watch inbox for ${current.email} once form is submitted.`);
    }
  });
});

document.getElementById("btn-save").addEventListener("click", () => {
  if (!current.username) return;
  loadAccounts(accounts => {
    if (accounts.some(a => a.username === current.username)) { toast("Already saved.", "#f59e0b"); return; }
    accounts.push({ username: current.username, password: current.password, email: current.email, firstName: current.firstName, lastName: current.lastName });
    saveAccounts(accounts, () => { renderList(accounts); toast("Saved!"); });
  });
});

document.getElementById("btn-check").addEventListener("click", () => {
  checkInbox();
  // Restart polling timer so it resets the 6s interval from now
  stopPolling();
  pollTimer = setInterval(checkInbox, 6000);
});

document.getElementById("btn-export").addEventListener("click", () => {
  loadAccounts(accounts => {
    if (!accounts.length) { toast("Nothing to export.", "#f59e0b"); return; }
    // Strip non-server fields before exporting
    const exported = accounts.map(({ username, password, email }) => ({ username, password, email }));
    navigator.clipboard.writeText(JSON.stringify(exported, null, 2)).then(() => toast(`Copied ${exported.length} account(s)!`));
  });
});

document.getElementById("btn-clear").addEventListener("click", () => {
  if (!confirm("Delete all saved accounts from the extension?")) return;
  saveAccounts([], () => renderList([]));
  toast("Cleared.", "#64748b");
});

document.getElementById("btn-save-cfg").addEventListener("click", () => {
  const serverIp = document.getElementById("cfg-ip").value.trim();
  chrome.storage.local.set({ serverIp }, () => toast("Settings saved!"));
});

document.querySelectorAll(".copy-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const val = document.getElementById(btn.dataset.target).value;
    if (val) navigator.clipboard.writeText(val).then(() => toast("Copied!"));
  });
});
