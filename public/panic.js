"use strict";

// ── Panic / Stealth Mode ────────────────────────────────────────────────────
(function () {
  const SETTINGS_KEY = "veil_settings_v1";

  const URL_PRESETS = {
    classroom: "https://classroom.google.com",
    google:    "https://www.google.com",
    gmail:     "https://mail.google.com",
    desmos:    "https://www.desmos.com/calculator",
    khan:      "https://www.khanacademy.org",
  };

  const EDUCATIONAL_CLOAKS = ["docs", "classroom", "gmail", "khan", "desmos"];
  const ENTERTAINMENT_CLOAKS = ["youtube", "discord", "spotify", "roblox"];

  function loadSettings() {
    try {
      return Object.assign({
        panicEnabled: true,
        panicKey:     "alt+x",
        panicUrl:     "https://classroom.google.com",
        panicMode:    "stealth",
        cloak:        "none",
      }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
    } catch {
      return { panicEnabled: true, panicKey: "alt+x", panicUrl: "https://classroom.google.com", panicMode: "stealth", cloak: "none" };
    }
  }

  function patchSettings(obj) {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      Object.assign(stored, obj);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
    } catch {}
  }

  // ── Key combo parsing ───────────────────────────────────────────────────
  function buildCombo(e) {
    const MODS = ["Control", "Alt", "Shift", "Meta"];
    if (MODS.includes(e.key)) return "";
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

  // ── Escape action ───────────────────────────────────────────────────────
  function doEscape(url) {
    const target = url || "https://www.google.com";
    const dest = "/escape?to=" + encodeURIComponent(target);
    // Navigate the top window so about:blank cloak wrapper also leaves
    try { window.top.location.replace(dest); } catch { window.location.replace(dest); }
  }

  // ── Fake UI templates ───────────────────────────────────────────────────
  function getEscapeUrl(s) {
    const CLOAK_ESCAPE = {
      docs:      "https://docs.google.com",
      classroom: "https://classroom.google.com",
      gmail:     "https://mail.google.com",
      desmos:    "https://www.desmos.com",
      khan:      "https://www.khanacademy.org",
    };
    return s.panicUrl || CLOAK_ESCAPE[s.cloak] || "https://www.google.com";
  }

  function buildFakeUI(cloak, dismissHint) {
    switch (cloak) {
      case "docs":      return buildDocsUI(dismissHint);
      case "classroom": return buildClassroomUI(dismissHint);
      case "gmail":     return buildGmailUI(dismissHint);
      case "khan":      return buildKhanUI(dismissHint);
      case "desmos":    return buildDesmosUI(dismissHint);
      default:          return buildDocsUI(dismissHint);
    }
  }

  function buildDocsUI(hint) {
    return `
<div style="display:flex;flex-direction:column;height:100%;font-family:Arial,sans-serif;background:#fff;">
  <!-- Top bar -->
  <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#fff;border-bottom:1px solid #e0e0e0;flex-shrink:0;">
    <!-- Docs icon -->
    <svg width="30" height="40" viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">
      <path d="M18 0H4C1.8 0 0 1.8 0 4v32c0 2.2 1.8 4 4 4h22c2.2 0 4-1.8 4-4V12L18 0z" fill="#4285f4"/>
      <path d="M18 0l12 12H18V0z" fill="#a8c7fa"/>
      <rect x="6" y="18" width="18" height="2" rx="1" fill="#fff"/>
      <rect x="6" y="23" width="18" height="2" rx="1" fill="#fff"/>
      <rect x="6" y="28" width="12" height="2" rx="1" fill="#fff"/>
    </svg>
    <div style="flex:1;">
      <div style="font-size:18px;color:#202124;font-weight:400;line-height:1.2;">Untitled document</div>
      <div style="display:flex;gap:8px;font-size:12px;color:#444;margin-top:2px;">
        <span style="cursor:pointer;">File</span>
        <span style="cursor:pointer;">Edit</span>
        <span style="cursor:pointer;">View</span>
        <span style="cursor:pointer;">Insert</span>
        <span style="cursor:pointer;">Format</span>
        <span style="cursor:pointer;">Tools</span>
        <span style="cursor:pointer;">Extensions</span>
        <span style="cursor:pointer;">Help</span>
      </div>
    </div>
    <button style="background:#1a73e8;color:#fff;border:none;border-radius:4px;padding:8px 16px;font-size:14px;cursor:pointer;font-weight:500;">Share</button>
    <div style="width:32px;height:32px;border-radius:50%;background:#ea4335;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;">S</div>
  </div>
  <!-- Toolbar -->
  <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#f8f9fa;border-bottom:1px solid #e0e0e0;flex-shrink:0;flex-wrap:wrap;">
    <select style="font-size:12px;border:1px solid #ccc;border-radius:3px;padding:2px 4px;height:26px;background:#fff;">
      <option>Arial</option><option>Times New Roman</option><option>Courier New</option>
    </select>
    <select style="font-size:12px;border:1px solid #ccc;border-radius:3px;padding:2px 4px;height:26px;width:52px;background:#fff;">
      <option>11</option><option>12</option><option>14</option><option>16</option>
    </select>
    <div style="width:1px;height:20px;background:#ccc;margin:0 2px;"></div>
    <button style="font-weight:700;font-size:14px;padding:2px 7px;border:none;border-radius:3px;background:transparent;cursor:pointer;">B</button>
    <button style="font-style:italic;font-size:14px;padding:2px 7px;border:none;border-radius:3px;background:transparent;cursor:pointer;">I</button>
    <button style="text-decoration:underline;font-size:14px;padding:2px 7px;border:none;border-radius:3px;background:transparent;cursor:pointer;">U</button>
    <div style="width:1px;height:20px;background:#ccc;margin:0 2px;"></div>
    <button style="font-size:12px;padding:2px 6px;border:none;border-radius:3px;background:transparent;cursor:pointer;">≡</button>
    <button style="font-size:12px;padding:2px 6px;border:none;border-radius:3px;background:transparent;cursor:pointer;">≡</button>
    <button style="font-size:12px;padding:2px 6px;border:none;border-radius:3px;background:transparent;cursor:pointer;">≡</button>
  </div>
  <!-- Page area -->
  <div style="flex:1;overflow:auto;background:#f1f3f4;display:flex;justify-content:center;padding:32px 16px;">
    <div style="width:816px;min-height:1056px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.2);padding:96px 96px 120px;font-size:11pt;line-height:1.8;color:#202124;font-family:'Times New Roman',serif;">
      <p style="margin-bottom:1em;">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
      <p style="margin-bottom:1em;">Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
      <p style="margin-bottom:1em;">Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
      <p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.</p>
    </div>
  </div>
  ${hint}
</div>`;
  }

  function buildClassroomUI(hint) {
    return `
<div style="display:flex;flex-direction:column;height:100%;font-family:'Google Sans',Arial,sans-serif;background:#f1f3f4;">
  <!-- Top bar -->
  <div style="display:flex;align-items:center;gap:12px;padding:0 16px;background:#fff;border-bottom:1px solid #e0e0e0;height:64px;flex-shrink:0;">
    <button style="background:none;border:none;cursor:pointer;color:#5f6368;font-size:22px;">☰</button>
    <div style="font-size:22px;color:#0f9d58;font-weight:500;letter-spacing:-0.5px;">Classroom</div>
    <div style="flex:1;"></div>
    <div style="width:10px;height:10px;border-radius:50%;background:#5f6368;margin:0 4px;opacity:0.5;"></div>
    <div style="width:10px;height:10px;border-radius:50%;background:#5f6368;margin:0 4px;opacity:0.5;"></div>
    <div style="width:10px;height:10px;border-radius:50%;background:#5f6368;margin:0 4px;opacity:0.5;"></div>
    <div style="width:36px;height:36px;border-radius:50%;background:#0f9d58;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:16px;margin-left:8px;">S</div>
  </div>
  <!-- Body -->
  <div style="display:flex;flex:1;overflow:hidden;">
    <!-- Sidebar -->
    <div style="width:256px;background:#fff;border-right:1px solid #e0e0e0;padding:8px 0;flex-shrink:0;overflow:auto;">
      <div style="padding:8px 16px 4px;font-size:11px;color:#5f6368;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Classes</div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;background:#e6f4ea;border-radius:0 20px 20px 0;margin-right:8px;">
        <div style="width:8px;height:8px;border-radius:50%;background:#0f9d58;"></div>
        <span style="font-size:14px;color:#202124;">Period 3 – English</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;">
        <div style="width:8px;height:8px;border-radius:50%;background:#9e9e9e;"></div>
        <span style="font-size:14px;color:#5f6368;">Period 1 – Algebra II</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;">
        <div style="width:8px;height:8px;border-radius:50%;background:#9e9e9e;"></div>
        <span style="font-size:14px;color:#5f6368;">Period 5 – US History</span>
      </div>
    </div>
    <!-- Main -->
    <div style="flex:1;overflow:auto;padding:24px;">
      <!-- Banner -->
      <div style="background:#0f9d58;border-radius:8px;padding:24px;color:#fff;margin-bottom:20px;min-height:120px;display:flex;align-items:flex-end;">
        <div>
          <div style="font-size:26px;font-weight:500;">Period 3 – English</div>
          <div style="font-size:14px;opacity:0.85;margin-top:4px;">Room 214 · Mrs. Johnson</div>
        </div>
      </div>
      <!-- Tabs -->
      <div style="display:flex;gap:0;border-bottom:2px solid #e0e0e0;margin-bottom:20px;">
        <div style="padding:10px 20px;font-size:14px;color:#0f9d58;font-weight:600;border-bottom:2px solid #0f9d58;margin-bottom:-2px;cursor:pointer;">Stream</div>
        <div style="padding:10px 20px;font-size:14px;color:#5f6368;cursor:pointer;">Classwork</div>
        <div style="padding:10px 20px;font-size:14px;color:#5f6368;cursor:pointer;">People</div>
        <div style="padding:10px 20px;font-size:14px;color:#5f6368;cursor:pointer;">Grades</div>
      </div>
      <!-- Post card -->
      <div style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.12);padding:20px;max-width:680px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="width:40px;height:40px;border-radius:50%;background:#0f9d58;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:16px;flex-shrink:0;">J</div>
          <div>
            <div style="font-size:14px;font-weight:500;color:#202124;">Mrs. Johnson</div>
            <div style="font-size:12px;color:#5f6368;">Today, 9:15 AM</div>
          </div>
          <div style="margin-left:auto;background:#e8f5e9;color:#0f9d58;font-size:12px;font-weight:600;padding:4px 10px;border-radius:12px;">Assignment</div>
        </div>
        <div style="font-size:15px;font-weight:500;color:#202124;margin-bottom:6px;">Read Chapter 5 – The Great Gatsby</div>
        <div style="font-size:13px;color:#5f6368;line-height:1.5;">Please read Chapter 5 and come prepared to discuss Gatsby's reunion with Daisy. Pay attention to the symbolism used throughout the chapter. Due tomorrow.</div>
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button style="background:none;border:none;color:#0f9d58;font-size:13px;cursor:pointer;font-weight:500;padding:4px 0;">View assignment</button>
        </div>
      </div>
    </div>
  </div>
  ${hint}
</div>`;
  }

  function buildGmailUI(hint) {
    return `
<div style="display:flex;flex-direction:column;height:100%;font-family:Arial,sans-serif;background:#f6f8fc;">
  <!-- Top bar -->
  <div style="display:flex;align-items:center;gap:12px;padding:8px 16px;background:#f6f8fc;border-bottom:1px solid #e0e0e0;flex-shrink:0;height:64px;">
    <div style="font-size:22px;color:#d93025;font-weight:500;">Gmail</div>
    <div style="flex:1;max-width:720px;">
      <div style="display:flex;align-items:center;background:#eaf1fb;border-radius:24px;padding:8px 16px;gap:8px;">
        <span style="color:#5f6368;font-size:18px;">🔍</span>
        <input type="text" placeholder="Search mail" style="border:none;background:transparent;outline:none;font-size:16px;color:#202124;flex:1;" value="" />
      </div>
    </div>
    <div style="flex:1;"></div>
    <div style="width:36px;height:36px;border-radius:50%;background:#d93025;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:16px;">S</div>
  </div>
  <!-- Body -->
  <div style="display:flex;flex:1;overflow:hidden;">
    <!-- Sidebar -->
    <div style="width:256px;background:#f6f8fc;padding:8px 0;flex-shrink:0;overflow:auto;">
      <button style="margin:8px 16px 16px;background:#c2e7ff;border:none;border-radius:16px;padding:16px 24px;font-size:14px;font-weight:500;color:#001d35;cursor:pointer;display:flex;align-items:center;gap:8px;width:calc(100% - 32px);">
        <span style="font-size:22px;">✏️</span> Compose
      </button>
      <div style="display:flex;align-items:center;gap:10px;padding:6px 16px 6px 24px;cursor:pointer;background:#d3e3fd;border-radius:0 20px 20px 0;margin-right:8px;">
        <span>📥</span><span style="font-size:14px;font-weight:700;color:#202124;">Inbox</span>
        <span style="margin-left:auto;font-size:13px;font-weight:700;color:#202124;">3</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:6px 16px 6px 24px;cursor:pointer;">
        <span>⭐</span><span style="font-size:14px;color:#444;">Starred</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:6px 16px 6px 24px;cursor:pointer;">
        <span>🕐</span><span style="font-size:14px;color:#444;">Snoozed</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:6px 16px 6px 24px;cursor:pointer;">
        <span>📤</span><span style="font-size:14px;color:#444;">Sent</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:6px 16px 6px 24px;cursor:pointer;">
        <span>📋</span><span style="font-size:14px;color:#444;">Drafts</span>
      </div>
    </div>
    <!-- Email list -->
    <div style="flex:1;overflow:auto;background:#fff;border-radius:16px;margin:8px 8px 8px 0;">
      <!-- Email row 1 (unread) -->
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:#fff;font-weight:700;" onmouseover="this.style.background='#f2f6fc'" onmouseout="this.style.background='#fff'">
        <input type="checkbox" style="flex-shrink:0;" />
        <span style="flex-shrink:0;font-size:16px;">⭐</span>
        <span style="width:160px;flex-shrink:0;font-size:14px;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Mrs. Johnson</span>
        <span style="flex:1;font-size:14px;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Re: Chapter 5 Questions – <span style="font-weight:400;color:#5f6368;">Hi! Great questions about the green light symbolism…</span></span>
        <span style="flex-shrink:0;font-size:12px;color:#5f6368;">9:47 AM</span>
      </div>
      <!-- Email row 2 (unread) -->
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:#fff;font-weight:700;" onmouseover="this.style.background='#f2f6fc'" onmouseout="this.style.background='#fff'">
        <input type="checkbox" style="flex-shrink:0;" />
        <span style="flex-shrink:0;font-size:16px;">☆</span>
        <span style="width:160px;flex-shrink:0;font-size:14px;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Google Classroom</span>
        <span style="flex:1;font-size:14px;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">New assignment: Read Chapter 5 – <span style="font-weight:400;color:#5f6368;">Mrs. Johnson posted a new assignment in Period 3 – English</span></span>
        <span style="flex-shrink:0;font-size:12px;color:#5f6368;">9:15 AM</span>
      </div>
      <!-- Email row 3 (unread) -->
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:#fff;font-weight:700;" onmouseover="this.style.background='#f2f6fc'" onmouseout="this.style.background='#fff'">
        <input type="checkbox" style="flex-shrink:0;" />
        <span style="flex-shrink:0;font-size:16px;">☆</span>
        <span style="width:160px;flex-shrink:0;font-size:14px;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Principal Dawkins</span>
        <span style="flex:1;font-size:14px;color:#202124;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Important: Reminder about Chromebook Policy – <span style="font-weight:400;color:#5f6368;">All students are reminded that school Chromebooks should only…</span></span>
        <span style="flex-shrink:0;font-size:12px;color:#5f6368;">8:02 AM</span>
      </div>
      <!-- Email row 4 (read) -->
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;" onmouseover="this.style.background='#f2f6fc'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" style="flex-shrink:0;" />
        <span style="flex-shrink:0;font-size:16px;">☆</span>
        <span style="width:160px;flex-shrink:0;font-size:14px;color:#5f6368;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Counselor Office</span>
        <span style="flex:1;font-size:14px;color:#5f6368;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Schedule change – <span style="color:#5f6368;">Your schedule for next semester has been updated…</span></span>
        <span style="flex-shrink:0;font-size:12px;color:#5f6368;">Yesterday</span>
      </div>
    </div>
  </div>
  ${hint}
</div>`;
  }

  function buildKhanUI(hint) {
    return `
<div style="display:flex;flex-direction:column;height:100%;font-family:'Lato',Arial,sans-serif;background:#fff;">
  <!-- Top nav -->
  <div style="display:flex;align-items:center;gap:16px;padding:0 20px;background:#1b7943;height:56px;flex-shrink:0;">
    <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">Khan Academy</div>
    <div style="flex:1;max-width:480px;">
      <div style="display:flex;align-items:center;background:rgba(255,255,255,0.15);border-radius:4px;padding:6px 12px;gap:8px;">
        <span style="color:rgba(255,255,255,0.7);font-size:14px;">🔍</span>
        <input type="text" placeholder="Search" style="border:none;background:transparent;outline:none;font-size:14px;color:#fff;flex:1;" />
      </div>
    </div>
    <span style="font-size:14px;color:rgba(255,255,255,0.9);cursor:pointer;">Courses</span>
    <span style="font-size:14px;color:rgba(255,255,255,0.9);cursor:pointer;">Donate</span>
    <div style="width:32px;height:32px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;color:#1b7943;font-weight:700;font-size:14px;">S</div>
  </div>
  <!-- Body -->
  <div style="display:flex;flex:1;overflow:hidden;">
    <!-- Left sidebar -->
    <div style="width:240px;border-right:1px solid #e4e4e4;padding:16px 0;flex-shrink:0;overflow:auto;background:#fafafa;">
      <div style="font-size:13px;font-weight:700;color:#333;padding:8px 20px 4px;text-transform:uppercase;letter-spacing:0.05em;">Math</div>
      <div style="padding:8px 20px;font-size:14px;color:#333;cursor:pointer;background:#e6f4ef;">Unit 4: Systems of equations</div>
      <div style="padding:8px 20px;font-size:14px;color:#666;cursor:pointer;">Unit 5: Inequalities</div>
      <div style="padding:8px 20px;font-size:14px;color:#666;cursor:pointer;">Unit 6: Functions</div>
      <div style="padding:8px 20px;font-size:14px;color:#666;cursor:pointer;">Unit 7: Sequences</div>
      <div style="height:1px;background:#e4e4e4;margin:8px 20px;"></div>
      <div style="font-size:13px;font-weight:700;color:#333;padding:8px 20px 4px;text-transform:uppercase;letter-spacing:0.05em;">Science</div>
      <div style="padding:8px 20px;font-size:14px;color:#666;cursor:pointer;">Biology</div>
      <div style="padding:8px 20px;font-size:14px;color:#666;cursor:pointer;">Chemistry</div>
    </div>
    <!-- Main content -->
    <div style="flex:1;overflow:auto;padding:24px 32px;">
      <div style="font-size:13px;color:#666;margin-bottom:8px;">Algebra 1 › Unit 4</div>
      <h2 style="font-size:24px;color:#1b1b1b;font-weight:700;margin-bottom:8px;">Systems of equations</h2>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
        <div style="flex:1;background:#e4e4e4;height:6px;border-radius:3px;">
          <div style="width:38%;background:#1b7943;height:100%;border-radius:3px;"></div>
        </div>
        <span style="font-size:13px;color:#666;flex-shrink:0;">38% complete</span>
      </div>
      <!-- Video section -->
      <div style="max-width:680px;">
        <div style="background:#000;border-radius:8px;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;margin-bottom:16px;position:relative;overflow:hidden;">
          <div style="position:absolute;inset:0;background:linear-gradient(135deg,#1b3a2d,#0a1f14);"></div>
          <div style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;position:relative;cursor:pointer;">
            <div style="width:0;height:0;border-top:14px solid transparent;border-bottom:14px solid transparent;border-left:22px solid #1b7943;margin-left:4px;"></div>
          </div>
        </div>
        <h3 style="font-size:18px;color:#1b1b1b;font-weight:600;margin-bottom:8px;">Introduction to systems of equations</h3>
        <p style="font-size:15px;color:#444;line-height:1.6;margin-bottom:16px;">Learn what a system of equations is and explore their solutions through substitution and elimination methods.</p>
        <div style="display:flex;gap:12px;">
          <button style="background:#1b7943;color:#fff;border:none;border-radius:4px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;">Start exercise</button>
          <button style="background:transparent;color:#1b7943;border:2px solid #1b7943;border-radius:4px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;">Watch video</button>
        </div>
      </div>
    </div>
  </div>
  ${hint}
</div>`;
  }

  function buildDesmosUI(hint) {
    return `
<div style="display:flex;flex-direction:column;height:100%;font-family:Arial,sans-serif;background:#fff;">
  <!-- Top bar -->
  <div style="display:flex;align-items:center;padding:0 12px;background:#fff;border-bottom:1px solid #e0e0e0;height:48px;flex-shrink:0;gap:12px;">
    <div style="font-size:20px;font-weight:700;color:#2f72dc;letter-spacing:-0.5px;">Desmos</div>
    <div style="flex:1;"></div>
    <button style="background:transparent;border:1px solid #ccc;border-radius:4px;padding:5px 12px;font-size:13px;cursor:pointer;color:#333;">Share</button>
    <button style="background:transparent;border:none;color:#666;font-size:20px;cursor:pointer;">⚙</button>
  </div>
  <!-- Main area -->
  <div style="display:flex;flex:1;overflow:hidden;">
    <!-- Expression panel -->
    <div style="width:280px;border-right:1px solid #e0e0e0;display:flex;flex-direction:column;flex-shrink:0;">
      <div style="padding:8px;border-bottom:1px solid #e0e0e0;flex-shrink:0;">
        <div style="display:flex;align-items:center;background:#f5f5f5;border-radius:4px;padding:6px 10px;gap:8px;">
          <span style="color:#999;font-size:13px;">🔍</span>
          <input type="text" placeholder="Search…" style="border:none;background:transparent;outline:none;font-size:13px;flex:1;" />
        </div>
      </div>
      <!-- Expression items -->
      <div style="flex:1;overflow:auto;">
        <div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #f0f0f0;gap:8px;">
          <div style="width:14px;height:14px;border-radius:50%;background:#2f72dc;flex-shrink:0;"></div>
          <div style="font-size:15px;color:#202124;font-family:'Courier New',monospace;flex:1;">f(x) = x²</div>
        </div>
        <div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #f0f0f0;gap:8px;">
          <div style="width:14px;height:14px;border-radius:50%;background:#c74440;flex-shrink:0;"></div>
          <div style="font-size:15px;color:#202124;font-family:'Courier New',monospace;flex:1;">g(x) = 2x + 1</div>
        </div>
        <div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #f0f0f0;gap:8px;opacity:0.4;">
          <div style="width:14px;height:14px;border-radius:50%;border:1px solid #aaa;flex-shrink:0;"></div>
          <div style="font-size:14px;color:#999;flex:1;">Expression</div>
        </div>
      </div>
      <!-- Bottom toolbar -->
      <div style="display:flex;border-top:1px solid #e0e0e0;flex-shrink:0;">
        <button style="flex:1;background:transparent;border:none;border-right:1px solid #e0e0e0;padding:10px;font-size:20px;cursor:pointer;color:#555;">+</button>
        <button style="flex:1;background:transparent;border:none;padding:10px;font-size:14px;cursor:pointer;color:#555;">abc</button>
      </div>
    </div>
    <!-- Graph area -->
    <div style="flex:1;position:relative;overflow:hidden;">
      <svg width="100%" height="100%" viewBox="-200 -200 400 400" xmlns="http://www.w3.org/2000/svg" style="background:#fff;">
        <!-- Grid lines -->
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f0f0f0" stroke-width="1"/>
          </pattern>
          <pattern id="grid5" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#e0e0e0" stroke-width="1"/>
          </pattern>
        </defs>
        <rect x="-200" y="-200" width="400" height="400" fill="url(#grid)"/>
        <rect x="-200" y="-200" width="400" height="400" fill="url(#grid5)"/>
        <!-- Axes -->
        <line x1="-200" y1="0" x2="200" y2="0" stroke="#555" stroke-width="1.5"/>
        <line x1="0" y1="-200" x2="0" y2="200" stroke="#555" stroke-width="1.5"/>
        <!-- Axis arrows -->
        <polygon points="200,-4 206,0 200,4" fill="#555"/>
        <polygon points="-4,-200 0,-206 4,-200" fill="#555"/>
        <!-- Axis labels -->
        <text x="192" y="14" font-size="12" fill="#555">x</text>
        <text x="6" y="-190" font-size="12" fill="#555">y</text>
        <!-- Tick marks -->
        <text x="36" y="14" font-size="10" fill="#777">1</text>
        <text x="76" y="14" font-size="10" fill="#777">2</text>
        <text x="116" y="14" font-size="10" fill="#777">3</text>
        <text x="-44" y="14" font-size="10" fill="#777">-1</text>
        <text x="-84" y="14" font-size="10" fill="#777">-2</text>
        <text x="-124" y="14" font-size="10" fill="#777">-3</text>
        <!-- Parabola f(x)=x^2 in blue (scaled: x in [-2.2,2.2], y = x^2*40) -->
        <path d="M -88,193.6 L -80,160 L -72,129.6 L -64,102.4 L -56,78.4 L -48,57.6 L -40,40 L -32,25.6 L -24,14.4 L -16,6.4 L -8,1.6 L 0,0 L 8,1.6 L 16,6.4 L 24,14.4 L 32,25.6 L 40,40 L 48,57.6 L 56,78.4 L 64,102.4 L 72,129.6 L 80,160 L 88,193.6"
              fill="none" stroke="#2f72dc" stroke-width="2.5" stroke-linejoin="round"/>
        <!-- Linear g(x)=2x+1 in red -->
        <line x1="-100" y1="-199" x2="99" y2="201" stroke="#c74440" stroke-width="2"/>
      </svg>
      <!-- Zoom controls -->
      <div style="position:absolute;right:12px;top:12px;display:flex;flex-direction:column;gap:2px;">
        <button style="width:32px;height:32px;background:#fff;border:1px solid #ccc;border-radius:4px;font-size:18px;cursor:pointer;color:#333;">+</button>
        <button style="width:32px;height:32px;background:#fff;border:1px solid #ccc;border-radius:4px;font-size:18px;cursor:pointer;color:#333;">−</button>
        <button style="width:32px;height:32px;background:#fff;border:1px solid #ccc;border-radius:4px;font-size:12px;cursor:pointer;color:#333;">⟳</button>
      </div>
    </div>
  </div>
  ${hint}
</div>`;
  }

  // ── Overlay management ──────────────────────────────────────────────────
  let overlayVisible = false;
  let holdTimer = null;

  function getOverlayEl() {
    return document.getElementById("panic-overlay");
  }

  function showOverlay(cloak, escapeUrl, dismissHint) {
    const el = getOverlayEl();
    if (!el) return;

    el.innerHTML = buildFakeUI(cloak, dismissHint);
    el.style.display = "block";
    el.classList.add("visible");
    document.body.classList.add("panic-active");
    overlayVisible = true;
  }

  function hideOverlay() {
    const el = getOverlayEl();
    if (!el) return;

    el.style.display = "none";
    el.classList.remove("visible");
    document.body.classList.remove("panic-active");
    overlayVisible = false;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  }

  // ── Double-tap tracking ─────────────────────────────────────────────────
  let lastKeyTime = 0;
  let lastKeyValue = "";

  // ── Panic trigger ───────────────────────────────────────────────────────
  let capturing = false;

  function triggerPanic() {
    const s = loadSettings();
    const cloak = s.cloak || "none";
    const panicMode = s.panicMode || "stealth";
    const escapeUrl = getEscapeUrl(s);
    const isEducational = EDUCATIONAL_CLOAKS.includes(cloak);

    if (overlayVisible) {
      // Already showing: dismiss (return to proxy)
      hideOverlay();
      return;
    }

    // Escape mode: always navigate away
    if (panicMode === "escape") {
      doEscape(escapeUrl);
      return;
    }

    // Stealth mode: show fake UI — default to docs if cloak isn't educational
    const effectiveCloak = isEducational ? cloak : "docs";
    const keyDisplay = formatCombo(s.panicKey);
    const hint = `<div class="panic-dismiss-hint">press ${keyDisplay} again to return</div>`;
    showOverlay(effectiveCloak, escapeUrl, hint);
  }

  // ── Key listener ────────────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (capturing) return;
    const s = loadSettings();
    if (!s.panicEnabled) return;

    // While overlay is active: panic key dismisses, any other key held 1.5s escapes
    if (overlayVisible) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const combo = buildCombo(e);
      const panicKey = s.panicKey || "alt+x";
      const tapKey = panicKey.includes(",") ? panicKey.split(",")[0].trim() : panicKey;
      if (combo === tapKey) {
        // Panic key pressed while overlay visible → dismiss
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        hideOverlay();
      } else if (!holdTimer) {
        // Any other key held → escape after 1.5s
        holdTimer = setTimeout(() => {
          holdTimer = null;
          doEscape(getEscapeUrl(s));
        }, 1500);
      }
      return;
    }

    const panicKey = s.panicKey || "alt+x";

    // Double-tap detection (e.g. "escape,escape" stored as "escape+escape")
    // We encode double-tap in settings as "escape+escape" with a special comma format
    // Check if panicKey contains a repeat indicator
    // Format: if panicKey is exactly a single key repeated (like "escape" repeated), use timestamp
    const combo = buildCombo(e);
    if (!combo) return;

    // Check for double-tap: key appears twice separated by comma in stored value
    // We store double-tap as "key,key" pattern but buildCombo returns "key"
    // Need to handle both single combo (alt+x) and double-tap (escape,escape)
    if (panicKey.includes(",")) {
      // Double-tap mode: two identical keys
      const parts = panicKey.split(",");
      const tapKey = parts[0].trim();
      const now = Date.now();
      if (combo === tapKey) {
        if (lastKeyValue === tapKey && (now - lastKeyTime) < 500) {
          // Double tap confirmed
          e.preventDefault();
          e.stopImmediatePropagation();
          lastKeyTime = 0;
          lastKeyValue = "";
          triggerPanic();
        } else {
          lastKeyTime = now;
          lastKeyValue = tapKey;
        }
      }
    } else {
      // Single combo mode (e.g. alt+x)
      if (combo === panicKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        triggerPanic();
      }
    }
  }, true);

  // Hold key release: cancel hold timer
  document.addEventListener("keyup", () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  }, true);

  // ── UI wiring ───────────────────────────────────────────────────────────
  const captureBtn   = document.getElementById("panic-key-capture");
  const urlSelect    = document.getElementById("panic-url-select");
  const urlCustomRow = document.getElementById("panic-url-custom-row");
  const urlCustom    = document.getElementById("panic-url-custom");

  function refreshUi() {
    const s = loadSettings();

    if (captureBtn) {
      const pk = s.panicKey || "alt+x";
      if (pk.includes(",")) {
        const parts = pk.split(",");
        const keyName = formatCombo(parts[0].trim());
        captureBtn.textContent = `Double ${keyName}`;
      } else {
        captureBtn.textContent = formatCombo(pk);
      }
      captureBtn.classList.remove("capturing");
    }

    if (urlSelect && urlCustomRow && urlCustom) {
      const match = Object.entries(URL_PRESETS).find(([, v]) => v === s.panicUrl);
      urlSelect.value = match ? match[0] : "custom";
      urlCustom.value = s.panicUrl || "";
      urlCustomRow.style.display = match ? "none" : "";
    }

    const panicModeEl = document.getElementById("panic-mode-select");
    if (panicModeEl) panicModeEl.value = s.panicMode || "stealth";
  }

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
      if (!combo) return;

      // Special case: Escape key = double-tap
      if (combo === "escape") {
        capturing = false;
        document.removeEventListener("keydown", onKey, true);
        patchSettings({ panicKey: "escape,escape" });
        refreshUi();
        return;
      }

      capturing = false;
      document.removeEventListener("keydown", onKey, true);
      patchSettings({ panicKey: combo });
      refreshUi();
    }

    document.addEventListener("keydown", onKey, true);
  });

  // Redirect destination select
  urlSelect?.addEventListener("change", function () {
    const isCustom = this.value === "custom";
    if (urlCustomRow) urlCustomRow.style.display = isCustom ? "" : "none";
    if (!isCustom) {
      patchSettings({ panicUrl: URL_PRESETS[this.value] });
      if (urlCustom) urlCustom.value = URL_PRESETS[this.value];
    }
  });

  urlCustom?.addEventListener("input", function () {
    patchSettings({ panicUrl: this.value });
  });

  // Panic mode select (stealth vs escape)
  const panicModeSelect = document.getElementById("panic-mode-select");
  panicModeSelect?.addEventListener("change", function () {
    patchSettings({ panicMode: this.value });
  });

  // Init — ensure panicMode is persisted so loadSettings always reads it explicitly
  const _initSettings = loadSettings();
  if (!JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}").panicMode) {
    patchSettings({ panicMode: _initSettings.panicMode });
  }
  refreshUi();
})();
