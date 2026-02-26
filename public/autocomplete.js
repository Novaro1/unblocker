"use strict";

// ── Search Autocomplete ────────────────────────────────────────────────────
// Shows history/bookmark matches instantly + search suggestions from Google.
(function () {
  const input = document.getElementById("sj-address");
  const form  = document.getElementById("sj-form");
  if (!input || !form) return;

  const HIST_KEY   = "veil_history_v1";
  const BM_KEY     = "veil_bookmarks_v1";
  const MAX_LOCAL  = 3;   // history + bookmark items to show
  const MAX_SUGG   = 6;   // suggestion items to show
  const DEBOUNCE   = 180; // ms before fetching suggestions

  // ── Wrap the search-bar so dropdown can position absolutely ────────────────
  const searchBar = input.closest(".search-bar");
  const wrap = document.createElement("div");
  wrap.className = "ac-wrap";
  searchBar.parentNode.insertBefore(wrap, searchBar);
  wrap.appendChild(searchBar);

  // ── Dropdown element ───────────────────────────────────────────────────────
  const dropdown = document.createElement("div");
  dropdown.id = "ac-dropdown";
  dropdown.setAttribute("role", "listbox");
  wrap.appendChild(dropdown);

  let debounceTimer = null;
  let currentItems  = [];
  let activeIdx     = -1;
  let lastQuery     = "";
  let pendingFetch  = 0; // incrementing token to discard stale fetches

  function isOpen() { return dropdown.classList.contains("ac-open"); }
  function open()   { dropdown.classList.add("ac-open"); }
  function close()  {
    dropdown.classList.remove("ac-open");
    activeIdx = -1;
  }

  // ── Local data sources ─────────────────────────────────────────────────────
  function localMatches(q) {
    const lq  = q.toLowerCase();
    const seen = new Set();
    const out  = [];

    function tryAdd(item) {
      const key = item.value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    }

    try {
      const hist = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
      for (const h of hist) {
        if (out.length >= MAX_LOCAL) break;
        const url   = h.url   || "";
        const title = h.title || "";
        if (url.toLowerCase().includes(lq) || title.toLowerCase().includes(lq)) {
          tryAdd({ type: "history", label: title || url, sub: url, value: url });
        }
      }
    } catch {}

    try {
      const bms = JSON.parse(localStorage.getItem(BM_KEY) || "[]");
      for (const b of bms) {
        if (out.length >= MAX_LOCAL) break;
        const url   = b.url   || "";
        const title = b.title || "";
        if (url.toLowerCase().includes(lq) || title.toLowerCase().includes(lq)) {
          tryAdd({ type: "bookmark", label: title || url, sub: url, value: url });
        }
      }
    } catch {}

    return out;
  }

  // ── Google search suggestions ──────────────────────────────────────────────
  async function fetchSuggestions(q, token) {
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`;
      const res  = await fetch(url);
      if (!res.ok || token !== pendingFetch) return [];
      const data = await res.json();
      // Returns ["query", ["s1", "s2", ...]]
      const suggs = Array.isArray(data[1]) ? data[1] : [];
      return suggs.slice(0, MAX_SUGG).map(s => ({ type: "suggestion", label: s, value: s }));
    } catch { return []; }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const ICONS = {
    history:    `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    bookmark:   `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    suggestion: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L13 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  };

  function render(items) {
    currentItems = items;
    activeIdx    = -1;
    dropdown.innerHTML = "";
    if (!items.length) { close(); return; }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const el = document.createElement("div");
      el.className = "ac-item";
      el.setAttribute("role", "option");
      el.dataset.idx = i;

      const icon = document.createElement("div");
      icon.className = `ac-icon ac-icon--${item.type}`;
      icon.innerHTML = ICONS[item.type] || ICONS.suggestion;

      const text  = document.createElement("div");
      text.className = "ac-text";

      const label = document.createElement("div");
      label.className = "ac-label";
      label.textContent = item.label;
      text.appendChild(label);

      if (item.sub && item.sub !== item.label) {
        const sub = document.createElement("div");
        sub.className = "ac-sub";
        sub.textContent = item.sub;
        text.appendChild(sub);
      }

      el.appendChild(icon);
      el.appendChild(text);

      // Mousedown so it fires before blur
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        select(i);
      });

      dropdown.appendChild(el);
    }
    open();
  }

  function setActive(idx) {
    dropdown.querySelectorAll(".ac-item").forEach((el, i) => {
      el.classList.toggle("ac-active", i === idx);
    });
    activeIdx  = idx;
    input.value = idx >= 0 ? currentItems[idx].value : lastQuery;
  }

  function select(idx) {
    const item = currentItems[idx];
    if (!item) return;
    input.value = item.value;
    close();
    if (item.type === "history" || item.type === "bookmark") {
      form.requestSubmit();
    }
    // Suggestions just fill the input and let the user submit
  }

  // ── Update (called on input) ───────────────────────────────────────────────
  async function update(q) {
    if (!q) { close(); return; }
    lastQuery = q;
    const token = ++pendingFetch;

    // Show local results immediately
    const local = localMatches(q);
    render(local);

    // Fetch remote suggestions
    const suggs = await fetchSuggestions(q, token);
    if (token !== pendingFetch) return; // superseded

    // Merge: local first, then suggestions not already in local
    const localVals = new Set(local.map(i => i.value.toLowerCase()));
    const filtered  = suggs.filter(s => !localVals.has(s.value.toLowerCase()));
    render([...local, ...filtered]);
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) { close(); return; }
    // Show local results immediately, fetch after debounce
    const local = localMatches(q);
    render(local);
    lastQuery = q;
    debounceTimer = setTimeout(() => update(q), DEBOUNCE);
  });

  input.addEventListener("keydown", (e) => {
    if (!isOpen()) return;
    const n = currentItems.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIdx + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIdx <= 0 ? -1 : activeIdx - 1);
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      select(activeIdx);
    } else if (e.key === "Escape") {
      close();
    }
  });

  input.addEventListener("focus", () => {
    const q = input.value.trim();
    if (q) update(q);
  });

  input.addEventListener("blur", () => {
    // Delay so mousedown on items can fire first
    setTimeout(close, 120);
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) close();
  });
})();
