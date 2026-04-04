"use strict";

// ── Games Section ──────────────────────────────────────────────────────────
// Paste your Google Sheet's published CSV URL below.
// In your sheet: File → Share → Publish to web → CSV → copy the link.
// Columns: Name, URL, Emoji, Hue
(function () {

  const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRyBP2PKfjznxIzMYnGIUv5E6V7wAE5vkhhtID71UAZFXuiDsC4y--z16d2N5yWySekVwQzwVDNVSr9/pub?gid=817149491&single=true&output=csv"; // ← paste your published CSV URL here

  const COLLAPSE_KEY = "veil_games_collapsed";
  const FAVS_KEY = "veil_game_favs";
  const isAmbassador = !!JSON.parse(localStorage.getItem("veil_ambassador_v1") || "null");

  function loadFavs() {
    try { return JSON.parse(localStorage.getItem(FAVS_KEY) || "[]"); } catch { return []; }
  }
  function saveFavs(favs) { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); }
  function isFav(name) { return loadFavs().includes(name); }
  function toggleFav(name) {
    const favs = loadFavs();
    const idx = favs.indexOf(name);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(name);
    saveFavs(favs);
    return favs.includes(name);
  }

  const FALLBACK = [
    { name: "Slope",          url: "https://www.crazygames.com/game/slope",                emoji: "⛷",  hue: 120 },
    { name: "1v1.LOL",        url: "https://1v1.lol",                                      emoji: "🎯", hue: 200 },
    { name: "Bloxorz",        url: "https://www.coolmathgames.com/0-bloxorz",              emoji: "🟦", hue: 210 },
    { name: "Drift Boss",     url: "https://www.coolmathgames.com/0-drift-boss",           emoji: "🚗", hue: 25  },
    { name: "Run 3",          url: "https://www.coolmathgames.com/0-run-3",                emoji: "🏃", hue: 280 },
    { name: "Cluster Rush",   url: "https://www.crazygames.com/game/cluster-rush",         emoji: "🏎",  hue: 45  },
    { name: "Cut the Rope",   url: "https://www.crazygames.com/game/cut-the-rope",         emoji: "🐸", hue: 100 },
    { name: "BitLife",        url: "https://bitlife.com",                                  emoji: "👤", hue: 260 },
    { name: "Subway Surfers", url: "https://www.crazygames.com/game/subway-surfers-2",     emoji: "🛹", hue: 180 },
    { name: "Death Run 3D",   url: "https://www.crazygames.com/game/death-run-3d",         emoji: "💀", hue: 0   },
    { name: "Angry Birds",    url: "https://www.crazygames.com/game/angry-birds-reloaded", emoji: "🐦", hue: 15  },
    { name: "Basket Bros",    url: "https://www.crazygames.com/game/basket-bros",          emoji: "🏀", hue: 25  },
    { name: "Coreball",       url: "https://www.crazygames.com/game/core-ball",            emoji: "⚽", hue: 270 },
    { name: "Drift Hunters",  url: "https://www.crazygames.com/game/drift-hunters",        emoji: "🏁", hue: 40  },
    { name: "Granny",         url: "https://www.crazygames.com/game/granny",               emoji: "👵", hue: 270 },
    { name: "Candy Crush",    url: "https://www.crazygames.com/game/candy-crush-saga",     emoji: "🍬", hue: 330 },
    { name: "Paper.io 2",     url: "https://paper-io.com",                                 emoji: "📄", hue: 155 },
    { name: "2048",           url: "https://play2048.co",                                  emoji: "🔢", hue: 40  },
    { name: "Geometry Dash",  url: "https://www.crazygames.com/game/geometry-dash-classic",emoji: "⬛", hue: 0   },
    { name: "Minesweeper",    url: "https://minesweeperonline.com",                        emoji: "💣", hue: 0   },
    { name: "Wordle",         url: "https://www.nytimes.com/games/wordle/index.html",      emoji: "🟩", hue: 130 },
    { name: "Chess",             url: "https://www.chess.com/play/online",                        emoji: "♟",  hue: 45  },
    { name: "Agar.io",           url: "https://agar.io",                                          emoji: "🔵", hue: 200 },
    { name: "Krunker.io",        url: "https://krunker.io",                                       emoji: "🔫", hue: 200 },
    { name: "Shell Shockers",    url: "https://shellshock.io",                                    emoji: "🥚", hue: 200 },
    { name: "Smash Karts",       url: "https://www.crazygames.com/game/smash-karts",              emoji: "🏎",  hue: 0   },
    { name: "Stickman Hook",     url: "https://www.crazygames.com/game/stickman-hook",            emoji: "🕷",  hue: 220 },
    { name: "Getaway Shootout",  url: "https://www.crazygames.com/game/getaway-shootout",         emoji: "🏃", hue: 15  },
    { name: "Rooftop Snipers",   url: "https://www.crazygames.com/game/rooftop-snipers",          emoji: "🎯", hue: 0   },
    { name: "Happy Wheels",      url: "https://www.coolmathgames.com/0-happy-wheels",             emoji: "🚲", hue: 50  },
    { name: "Monkey Mart",       url: "https://www.crazygames.com/game/monkey-mart",              emoji: "🐒", hue: 45  },
    { name: "Eggy Car",          url: "https://www.crazygames.com/game/eggy-car",                 emoji: "🥚", hue: 55  },
    { name: "Cat Ninja",         url: "https://www.coolmathgames.com/0-cat-ninja",                emoji: "🐱", hue: 270 },
    { name: "Color Tunnel",      url: "https://www.crazygames.com/game/color-tunnel",             emoji: "🌈", hue: 280 },
    { name: "Friday Night Funkin", url: "https://www.crazygames.com/game/friday-night-funkin",   emoji: "🎤", hue: 340 },
    { name: "Fireboy & Watergirl 1", url: "https://www.coolmathgames.com/0-fireboy-and-watergirl-1", emoji: "🔥", hue: 15 },

    { name: "Vortelli's Pizza",  url: "https://www.crazygames.com/game/vortellis-pizza",          emoji: "🍕", hue: 10  },
    { name: "Stickman Warriors", url: "https://www.crazygames.com/game/stickman-warriors",        emoji: "🥷", hue: 0   },
    { name: "Penalty Shooters 2",url: "https://www.crazygames.com/game/penalty-shooters-2",      emoji: "⚽", hue: 100 },
    { name: "Earn to Die",       url: "https://www.crazygames.com/game/earn-to-die",              emoji: "🧟", hue: 20  },
    { name: "Bullet Force",      url: "https://www.crazygames.com/game/bullet-force-multiplayer", emoji: "💥", hue: 0   },
    { name: "Road Fury",         url: "https://www.crazygames.com/game/road-fury",                emoji: "💨", hue: 40  },
  ];


  // ── Local (self-hosted) games ──────────────────────────────────────────────
  const LOCAL_GAMES = [
    { name: "Time Shooter 2",        emoji: "🔫", hue: 10,  url: "/games/200.html" },
    { name: "Bowmasters",            emoji: "🏹", hue: 30,  url: "/games/0.html" },
    { name: "Cluster Rush",          emoji: "🚛", hue: 40,  url: "/games/81.html" },
    { name: "Dreadhead Parkour",     emoji: "🤸", hue: 200, url: "/games/310.html" },
    { name: "Paper.io 2",            emoji: "📄", hue: 280, url: "/games/102.html" },
    { name: "Basket Random",         emoji: "🏀", hue: 30,  url: "/games/66.html" },
    { name: "Boxing Random",         emoji: "🥊", hue: 0,   url: "/games/77.html" },
    { name: "Gladihoppers",          emoji: "⚔️",  hue: 350, url: "/games/4.html" },
    { name: "OvO",                   emoji: "🏃", hue: 220, url: "/games/1-fde.html" },
    { name: "Vex 3",                 emoji: "🤺", hue: 180, url: "/games/47.html" },
    { name: "Vex 5",                 emoji: "🤺", hue: 190, url: "/games/50.html" },
    { name: "Vex 6",                 emoji: "🤺", hue: 200, url: "/games/51.html" },
    { name: "Big Tower Tiny Square", emoji: "🏗️",  hue: 50,  url: "/games/170.html" },
    { name: "Bob The Robber 2",      emoji: "🕵️",  hue: 240, url: "/games/76.html" },
    { name: "Fireboy & Watergirl 2", emoji: "🔥", hue: 20,  url: "/games/88.html" },
    { name: "Fireboy & Watergirl 3", emoji: "❄️",  hue: 190, url: "/games/89.html" },
    { name: "Moto X3M",              emoji: "🏍️",  hue: 15,  url: "/games/55.html" },
    { name: "Moto X3M 2",            emoji: "🏍️",  hue: 20,  url: "/games/97.html" },
    { name: "Moto X3M 3",            emoji: "🏍️",  hue: 25,  url: "/games/98.html" },
    { name: "Moto X3M Pool Party",   emoji: "🏊", hue: 200, url: "/games/124.html" },
    { name: "Moto X3M Spooky Land",  emoji: "🎃", hue: 30,  url: "/games/99.html" },
    { name: "Highway Racer 2",       emoji: "🚗", hue: 210, url: "/games/92.html" },
    { name: "FNAF 1",                emoji: "🐻", hue: 20,  url: "/games/38.html" },
    { name: "FNAF 2",                emoji: "🐻", hue: 15,  url: "/games/39.html" },
    { name: "FNAF 3",                emoji: "🐻", hue: 10,  url: "/games/40.html" },
    { name: "FNAF 4",                emoji: "🐻", hue: 5,   url: "/games/41.html" },
    { name: "Granny",                emoji: "👵", hue: 40,  url: "/games/90.html" },
    { name: "Baldi's Basics",        emoji: "📏", hue: 60,  url: "/games/65.html" },
    { name: "Temple Run 2",          emoji: "🏛️",  hue: 30,  url: "/games/10.html" },
    { name: "Jetpack Joyride",       emoji: "🚀", hue: 220, url: "/games/7.html" },
    { name: "Crossy Road",           emoji: "🐔", hue: 90,  url: "/games/24.html" },
    { name: "Retro Bowl",            emoji: "🏈", hue: 35,  url: "/games/33.html" },
    { name: "Tiny Fishing",          emoji: "🎣", hue: 190, url: "/games/108.html" },
    { name: "BitLife",               emoji: "💬", hue: 240, url: "/games/70.html" },
    { name: "Gunspin",               emoji: "🔫", hue: 0,   url: "/games/91.html" },
    { name: "WebOsu",                emoji: "🎵", hue: 340, url: "/games/130.html" },
    { name: "Flappy Bird",           emoji: "🐦", hue: 55,  url: "/games/129.html" },
    { name: "Minecraft Beta 1.7.3",  emoji: "⛏️",  hue: 100, url: "/games/300.html" },
    { name: "Wordle",                emoji: "🟩", hue: 130, url: "/games/112.html" },
    { name: "2048",                  emoji: "🔢", hue: 40,  url: "/games/2048.html" },
    { name: "Snake",                 emoji: "🐍", hue: 120, url: "/games/snake.html" },
    { name: "Tetris",                emoji: "🟦", hue: 220, url: "/games/tetris.html" },
    { name: "Pong",                  emoji: "🏓", hue: 180, url: "/games/pong.html" },
    { name: "Breakout",              emoji: "🧱", hue: 30,  url: "/games/breakout.html" },
    { name: "Minesweeper",           emoji: "💣", hue: 0,   url: "/games/minesweeper.html" },
    { name: "Slither.io",            emoji: "🐍", hue: 100, url: "/games/slither.html" },
  ];

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navigateTo(url) {
    const input = document.getElementById("sj-address");
    const form  = document.getElementById("sj-form");
    if (!input || !form) return;
    input.value = url;
    form.requestSubmit();
  }

  function navigateLocal(path) {
    // If already inside a cloak iframe, navigate within it to stay cloaked
    if (window.top !== window) {
      window.location.href = location.origin + path;
      return;
    }

    const blankCloakOn = isAmbassador && localStorage.getItem("veil_blank_cloak_auto") === "1";

    if (!blankCloakOn) {
      window.open(location.origin + path, "_blank");
      return;
    }

    // Open with blank cloak applied
    const w = window.open("about:blank", "_blank");
    if (!w) return;
    const info = (typeof getCloakInfo === "function") ? getCloakInfo() : { title: document.title, favicon: "/favicon.ico" };

    const iframe = w.document.createElement("iframe");
    iframe.src = location.origin + path;
    iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;margin:0;padding:0;";
    w.document.documentElement.style.cssText = "margin:0;padding:0;height:100%;overflow:hidden;";
    w.document.body.style.cssText = "margin:0;padding:0;height:100%;overflow:hidden;";
    w.document.body.appendChild(iframe);

    w.document.title = info.title;
    const link = w.document.createElement("link");
    link.rel = "icon"; link.href = info.favicon;
    w.document.head.appendChild(link);
  }

  // ── Render grid ────────────────────────────────────────────────────────────
  function makeTile(game, isLocal) {
    const tile = document.createElement("div");
    tile.className = "ql-tile";
    tile.title = game.name;

    const icon = document.createElement("div");
    icon.className = "gs-tile-icon";
    if (game.svg) { icon.innerHTML = game.svg; }
    else          { icon.textContent = game.emoji || "🎮"; }
    icon.style.background = `hsla(${game.hue ?? 220}, 55%, 20%, 1)`;

    const label = document.createElement("div");
    label.className = "ql-tile-name";
    label.textContent = game.name;

    tile.appendChild(icon);
    tile.appendChild(label);

    // Ambassador: favorite star
    if (isAmbassador) {
      const star = document.createElement("button");
      star.className = "gs-fav-btn" + (isFav(game.name) ? " active" : "");
      star.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
      star.title = isFav(game.name) ? "Remove from favorites" : "Add to favorites";
      star.addEventListener("click", (e) => {
        e.stopPropagation();
        const on = toggleFav(game.name);
        star.classList.toggle("active", on);
        star.title = on ? "Remove from favorites" : "Add to favorites";
        // Re-render to update favorites section
        if (window._veilLastGamesList) renderWith(window._veilLastGamesList);
      });
      tile.appendChild(star);
    }

    tile.addEventListener("click", () => {
      if (isLocal)        { navigateLocal(game.url); }

      else                { navigateTo(game.url); }
    });
    return tile;
  }

  function renderWith(gamesList) {
    window._veilLastGamesList = gamesList;
    const grid = document.getElementById("gs-grid");
    if (!grid) return;
    grid.innerHTML = "";

    // ── Ambassador: Favorites section ────────────────────────────────────
    if (isAmbassador) {
      const favNames = loadFavs();
      if (favNames.length) {
        const favHeader = document.createElement("div");
        favHeader.className = "gs-section-header";
        favHeader.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="none" style="vertical-align:-2px;margin-right:4px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Favorites';
        grid.appendChild(favHeader);
        const allGames = [...LOCAL_GAMES.map(g => ({ ...g, _local: true })), ...gamesList.map(g => ({ ...g, _local: false }))];
        favNames.forEach(name => {
          const g = allGames.find(g => g.name === name);
          if (g) grid.appendChild(makeTile(g, g._local));
        });
      }
    }

    // ── Veil Music featured tile ───────────────────────────────────────────
    const musicTile = makeTile({ name: "Veil Music", hue: 240, url: "/music.html", svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' }, true);
    musicTile.classList.add("gs-featured");
    grid.appendChild(musicTile);

    // ── Local games header + tiles ─────────────────────────────────────────
    const localHeader = document.createElement("div");
    localHeader.className = "gs-section-header";
    localHeader.textContent = "Offline Games";
    grid.appendChild(localHeader);
    LOCAL_GAMES.forEach(g => grid.appendChild(makeTile(g, true)));

    // ── Proxied games header + tiles ───────────────────────────────────────
    const proxyHeader = document.createElement("div");
    proxyHeader.className = "gs-section-header";
    proxyHeader.textContent = "Online Games";
    grid.appendChild(proxyHeader);
    gamesList.forEach(g => grid.appendChild(makeTile(g, false)));
  }

  // ── CSV parsing (handles quoted fields) ────────────────────────────────────
  function parseCsvRow(line) {
    const fields = [];
    let field = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { field += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === "," && !inQuote) {
        fields.push(field);
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  }

  function parseSheetCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return null;

    const headers  = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());
    const nameIdx  = headers.indexOf("name");
    const urlIdx   = headers.indexOf("url");
    const emojiIdx = headers.indexOf("emoji");
    const hueIdx   = headers.indexOf("hue");

    if (nameIdx === -1 || urlIdx === -1) return null;

    const games = [];
    for (let i = 1; i < lines.length; i++) {
      const cols  = parseCsvRow(lines[i]);
      const name  = cols[nameIdx]?.trim();
      const url   = cols[urlIdx]?.trim();
      if (!name || !url) continue;
      const emoji = emojiIdx >= 0 ? (cols[emojiIdx]?.trim() || "🎮") : "🎮";
      const hue   = hueIdx >= 0
        ? (parseInt(cols[hueIdx]) || 0)
        : ([...url].reduce((a, c) => a + c.charCodeAt(0), 0) % 360);
      games.push({ name, url, emoji, hue });
    }
    return games.length ? games : null;
  }

  // ── Fetch from Google Sheet or use fallback ────────────────────────────────
  async function renderGames() {
    try {
      if (SHEET_URL) {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error("non-200");
        const text  = await res.text();
        const games = parseSheetCSV(text);
        if (games) { renderWith(games); return; }
      }
    } catch { /* fall through to fallback */ }
    renderWith(FALLBACK);
  }

  window._veilRenderGames = renderGames;

  // ── Collapse toggle ────────────────────────────────────────────────────────
  const grid   = document.getElementById("gs-grid");
  const toggle = document.getElementById("gs-toggle");

  function setCollapsed(on) {
    if (!grid || !toggle) return;
    grid.classList.toggle("collapsed", on);
    toggle.classList.toggle("collapsed", on);
    toggle.title = on ? "Expand games" : "Collapse games";
    localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0");
  }

  toggle?.addEventListener("click", () => setCollapsed(!grid.classList.contains("collapsed")));

  // ── Init ───────────────────────────────────────────────────────────────────
  renderGames();
  setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
})();
