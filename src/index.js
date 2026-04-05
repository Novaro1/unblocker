import "dotenv/config";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { readFileSync, statSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";
import SoundCloud from "soundcloud-scraper";

const publicPath        = fileURLToPath(new URL("../public/", import.meta.url));
const tokensPath        = fileURLToPath(new URL("../tokens.json", import.meta.url));
const betaFeaturesPath  = fileURLToPath(new URL("../beta-features.json", import.meta.url));
const bareAsModule3Path = fileURLToPath(
  new URL("../node_modules/@mercuryworkshop/bare-as-module3/dist/", import.meta.url)
);

logging.set_level(logging.NONE);

// ── Simple in-memory rate limiter ──────────────────────────────────────────
const rateLimitStore = new Map(); // ip -> { count, resetAt }
function rateLimit(req, reply, { max, windowMs }) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    // Evict expired entries to prevent unbounded memory growth
    if (rateLimitStore.size > 10000) {
      for (const [k, v] of rateLimitStore) { if (now > v.resetAt) rateLimitStore.delete(k); }
    }
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return false; // not limited
  }
  entry.count++;
  if (entry.count > max) {
    reply.code(429).send({ error: "Too many requests. Try again later." });
    return true; // limited
  }
  return false;
}
Object.assign(wisp.options, {
  allow_udp_streams: true,
  dns_servers: ["1.1.1.1", "1.0.0.1"],
});

// Bare server handles HTTPS fetching server-side using Node.js CA bundle.
// Raise the keep-alive connection limit — default of 10/min is hit immediately
// by pages like YouTube that make dozens of parallel requests.
// ── File caches (avoids readFileSync on every request) ────────────────────
let _tokensCache = null, _tokensMtime = 0;
let _betaCache   = null, _betaMtime   = 0;

function loadTokens() {
  try {
    const { mtimeMs } = statSync(tokensPath);
    if (mtimeMs !== _tokensMtime) {
      _tokensCache  = JSON.parse(readFileSync(tokensPath, "utf-8"));
      _tokensMtime  = mtimeMs;
    }
  } catch { _tokensCache = []; }
  return _tokensCache ?? [];
}

function loadBeta() {
  try {
    const { mtimeMs } = statSync(betaFeaturesPath);
    if (mtimeMs !== _betaMtime) {
      _betaCache  = JSON.parse(readFileSync(betaFeaturesPath, "utf-8"));
      _betaMtime  = mtimeMs;
    }
  } catch { _betaCache = []; }
  return _betaCache ?? [];
}

const bareServer = createBareServer("/bare/", {
  connectionLimiter: {
    maxConnectionsPerIP: 10000,
    windowDuration: 60,
    blockDuration: 1,
  },
});

const fastify = Fastify({
  bodyLimit: 1048576,
  serverFactory: (handler) => {
    return createServer()
      .on("request", (req, res) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
        res.setHeader("X-XSS-Protection", "1; mode=block");
        if (bareServer.shouldRoute(req)) {
          bareServer.routeRequest(req, res);
        } else {
          handler(req, res);
        }
      })
      .on("upgrade", (req, socket, head) => {
        if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
        else if (req.url === "/remote-ws") remoteWss.handleUpgrade(req, socket, head, ws => remoteWss.emit("connection", ws, req));
        else if (bareServer.shouldRoute(req)) bareServer.routeUpgrade(req, socket, head);
        else socket.end();
      });
  },
});

fastify.register(fastifyStatic, {
  root: publicPath,
  decorateReply: true,
});

fastify.register(fastifyStatic, {
  root: scramjetPath,
  prefix: "/scramjet/",
  decorateReply: false,
});

fastify.register(fastifyStatic, {
  root: baremuxPath,
  prefix: "/baremux/",
  decorateReply: false,
});

fastify.register(fastifyStatic, {
  root: bareAsModule3Path,
  prefix: "/bare-as-module3/",
  decorateReply: false,
});

// Capture raw body for GitHub webhook HMAC verification
fastify.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
  req.rawBody = body;
  try { done(null, JSON.parse(body.toString())); }
  catch (e) { done(e); }
});

// ── GET / — launcher page ─────────────────────────────────────────────────────
fastify.get("/", (_req, reply) => {
  return reply.type("text/html").sendFile("loader.html");
});

// ── GET /go — proxy / unblocker ───────────────────────────────────────────────
fastify.get("/go", (_req, reply) => {
  return reply.type("text/html").sendFile("index.html");
});

// Panic escape redirect — bypasses Scramjet service worker interception
fastify.get('/escape', (req, reply) => {
  const { to } = req.query;
  if (!to || !/^https?:\/\//.test(to)) return reply.code(400).send('bad url');
  return reply.code(302).header('Location', to).send();
});

// Caddy on-demand TLS ask endpoint — always approve
fastify.get('/caddy-ask', (_req, reply) => {
  reply.code(200).send('ok');
});

// Ambassador token verification
fastify.get('/api/verify-token', (req, reply) => {
  if (rateLimit(req, reply, { max: 10, windowMs: 60_000 })) return;
  const { token } = req.query;
  if (!token) return reply.code(400).send({ valid: false });
  const entry = loadTokens().find((t) => t.token === token);
  if (entry) return reply.send({ valid: true, username: entry.username });
  return reply.send({ valid: false });
});

// Ambassador leaderboard — returns top ambassadors sorted by points (no tokens exposed)
fastify.get('/api/leaderboard', (_req, reply) => {
  const board = loadTokens()
    .map((t) => ({ username: t.username, points: t.points ?? 0 }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 20)
    .map((t, i) => ({ rank: i + 1, username: t.username, points: t.points }));
  return reply.send(board);
});

// Beta feature status — computes whether each feature is still in its ambassador-only window
fastify.get('/api/beta-features', (_req, reply) => {
  const now = Date.now();
  const result = loadBeta().map((f) => {
    const betaMs  = (f.betaDays ?? 14) * 86400000;
    const elapsed = now - new Date(f.releasedAt).getTime();
    const isBeta  = elapsed < betaMs;
    return { id: f.id, type: f.type, key: f.key, label: f.label, isBeta,
      daysLeft: isBeta ? Math.ceil((betaMs - elapsed) / 86400000) : 0 };
  });
  return reply.send(result);
});

// SoundCloud client — lazily initialized with a fresh client_id
let scClient = null;
let scClientId = null;
async function getSCClient() {
  if (scClient) return scClient;
  scClientId = await SoundCloud.keygen();
  scClient = new SoundCloud.Client(scClientId);
  return scClient;
}

// CORS for music API (used by static site)
fastify.addHook("onSend", (req, reply, payload, done) => {
  if (req.url.startsWith("/api/music/")) {
    reply.header("Access-Control-Allow-Origin", "*");
  }
  done();
});
fastify.options("/api/music/*", (_req, reply) => {
  reply.header("Access-Control-Allow-Origin", "*")
       .header("Access-Control-Allow-Methods", "GET, OPTIONS")
       .header("Access-Control-Allow-Headers", "Content-Type, Range")
       .code(204).send();
});

// Music: search SoundCloud (no API key, no bot detection)
fastify.get("/api/music/search", async (req, reply) => {
  const q     = String(req.query.q || "").trim();
  const limit = Math.min(parseInt(req.query.limit) || 24, 50);
  if (!q) return reply.send([]);
  try {
    const client  = await getSCClient();
    const found   = await client.search(q, "track");
    const tracks  = found.filter(r => r.type === "track").slice(0, limit);
    const infos   = await Promise.all(tracks.map(t => client.getSongInfo(t.url).catch(() => null)));
    const results = infos.filter(s => s?.url).map(s => ({
      id:        Buffer.from(s.url).toString("base64url"),
      title:     s.title     || "Unknown",
      artist:    s.author?.name || "Unknown",
      album:     "",
      artwork:   `/api/music/thumb?url=${Buffer.from(s.thumbnail || "").toString("base64url")}`,
      duration:  s.duration  || 0,
      sourceUrl: s.url,
    }));
    reply.send(results);
  } catch (err) {
    console.error("[music/search]", err.message);
    scClient = null; scClientId = null; // reset on error so keygen retries
    reply.send([]);
  }
});

// Artwork proxy — serves SoundCloud thumbnails via our domain to bypass school filters
fastify.get("/api/music/thumb", async (req, reply) => {
  let artworkUrl;
  if (req.query.url) {
    try { artworkUrl = Buffer.from(String(req.query.url), "base64url").toString(); }
    catch { return reply.status(400).send("Invalid URL"); }
    if (!artworkUrl.startsWith("https://i1.sndcdn.com/") && !artworkUrl.startsWith("https://i2.sndcdn.com/"))
      return reply.status(400).send("Invalid artwork URL");
  } else {
    // Legacy: YouTube thumbnail by video ID
    const id = String(req.query.id || "");
    if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return reply.status(400).send("Invalid ID");
    artworkUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  try {
    const upstream = await fetch(artworkUrl);
    reply
      .header("Content-Type",  upstream.headers.get("content-type") || "image/jpeg")
      .header("Cache-Control", "public, max-age=86400")
      .send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    reply.status(502).send("Failed to fetch thumbnail");
  }
});

// Music: related tracks for autoplay — uses SoundCloud's native related API (free)
fastify.get("/api/music/related", async (req, reply) => {
  const sourceUrl = String(req.query.sourceUrl || "").trim();
  if (!sourceUrl.startsWith("https://soundcloud.com/")) return reply.send([]);

  try {
    const client = await getSCClient();
    // Resolve the track to get its numeric ID
    const info = await client.getSongInfo(sourceUrl);
    const trackId = info?.id;
    if (!trackId) return reply.send([]);

    // Hit SoundCloud's related tracks endpoint directly
    const res = await fetch(
      `https://api-v2.soundcloud.com/tracks/${trackId}/related?limit=20&client_id=${scClientId}`
    );
    if (!res.ok) return reply.send([]);

    const data = await res.json();
    const tracks = (data.collection || [])
      .filter(t => t.kind === "track" && t.streamable)
      .slice(0, 12)
      .map(t => ({
        id:        Buffer.from(t.permalink_url).toString("base64url"),
        title:     t.title                 || "Unknown",
        artist:    t.user?.username        || "Unknown",
        album:     "",
        artwork:   t.artwork_url
          ? `/api/music/thumb?url=${Buffer.from(t.artwork_url.replace("-large", "-t300x300")).toString("base64url")}`
          : "",
        duration:  t.duration             || 0,
        sourceUrl: t.permalink_url,
      }));

    reply.send(tracks);
  } catch (err) {
    console.error("[music/related]", err.message);
    reply.send([]);
  }
});

// SoundCloud audio stream — resolves direct URL for seek support, proxied through our server
fastify.get("/api/music/stream", async (req, reply) => {
  const id = String(req.query.id || "").trim();
  let scUrl;
  try { scUrl = Buffer.from(id, "base64url").toString(); }
  catch { return reply.status(400).send("Invalid ID"); }
  if (!scUrl.startsWith("https://soundcloud.com/")) return reply.status(400).send("Invalid URL");

  // Resolve the direct progressive MP3 URL so the browser can seek via range requests
  const directUrl = await new Promise((resolve) => {
    execFile(
      "yt-dlp",
      ["--no-playlist", "-f", "http_mp3_1_0/bestaudio[ext=mp3]/bestaudio", "--get-url", scUrl],
      { timeout: 15000 },
      (err, stdout) => resolve(err ? null : stdout.trim().split("\n")[0] || null)
    );
  });

  if (directUrl) {
    // Proxy with range header forwarding so the browser can seek
    const upstreamHeaders = {};
    if (req.headers.range) upstreamHeaders["range"] = req.headers.range;
    try {
      const upstream = await fetch(directUrl, { headers: upstreamHeaders });
      reply.code(upstream.status);
      reply.header("Content-Type",  upstream.headers.get("content-type")  || "audio/mpeg");
      reply.header("Accept-Ranges", "bytes");
      reply.header("Cache-Control", "no-cache");
      const cl = upstream.headers.get("content-length");
      const cr = upstream.headers.get("content-range");
      if (cl) reply.header("Content-Length", cl);
      if (cr) reply.header("Content-Range",  cr);
      return reply.send(Readable.fromWeb(upstream.body));
    } catch (err) {
      console.error("[music/stream] proxy error:", err.message);
    }
  }

  // Fallback: pipe yt-dlp stdout (no seeking, but always works)
  reply.header("Content-Type", "audio/mpeg");
  const child = spawn("yt-dlp", ["--no-playlist", "-f", "hls_mp3_1_0/bestaudio", "-o", "-", scUrl]);
  child.stderr.on("data", d => console.error("[music/stream]", d.toString().trim()));
  child.on("error", err => console.error("[music/stream] spawn error:", err.message));
  return reply.send(child.stdout);
});

// GitHub push webhook → Discord announcements
const GH_WEBHOOK_SECRET   = process.env.GH_WEBHOOK_SECRET   || "";
const DISCORD_TOKEN        = process.env.DISCORD_TOKEN        || "";
const UPDATES_CHANNEL_ID   = process.env.UPDATES_CHANNEL_ID   || "";

fastify.post("/github-webhook", { config: { rawBody: true } }, async (req, reply) => {
  // Verify GitHub signature
  if (GH_WEBHOOK_SECRET) {
    const sig = req.headers["x-hub-signature-256"] || "";
    const expected = "sha256=" + createHmac("sha256", GH_WEBHOOK_SECRET)
      .update(req.rawBody ?? Buffer.alloc(0))
      .digest("hex");
    try {
      if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return reply.code(401).send("bad signature");
      }
    } catch {
      return reply.code(401).send("bad signature");
    }
  }

  const event = req.headers["x-github-event"];
  if (event !== "push") return reply.code(200).send("ok");

  const { commits = [], ref, repository, pusher } = req.body ?? {};
  if (!commits.length) return reply.code(200).send("ok");
  if (!DISCORD_TOKEN || !UPDATES_CHANNEL_ID) return reply.code(200).send("ok");

  const branch = ref?.replace("refs/heads/", "") ?? "unknown";
  const repoUrl = repository?.html_url ?? "";
  const repoName = repository?.name ?? "repo";

  const lines = commits.slice(0, 10).map((c) => {
    const msg = c.message.split("\n")[0].slice(0, 80);
    const sha = c.id.slice(0, 7);
    return `[\`${sha}\`](${c.url}) ${msg}`;
  });
  if (commits.length > 10) lines.push(`…and ${commits.length - 10} more`);

  const body = JSON.stringify({
    embeds: [{
      title: `${commits.length} new commit${commits.length !== 1 ? "s" : ""} to \`${branch}\``,
      url: repoUrl,
      color: 0x57F287,
      description: lines.join("\n"),
      footer: { text: `${repoName} • pushed by ${pusher?.name ?? "unknown"}` },
      timestamp: new Date().toISOString(),
    }],
  });

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${UPDATES_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bot ${DISCORD_TOKEN}`, "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) console.error(`[github-webhook] Discord API error: ${res.status}`);
  } catch (e) {
    console.error(`[github-webhook] Discord fetch failed: ${e.message}`);
  }

  return reply.code(200).send("ok");
});

// ── Remote Desktop ────────────────────────────────────────────────────────────
const remoteWss = new WebSocketServer({ noServer: true });
const remoteRooms = new Map(); // code -> { host, viewer, createdAt }

// Clean up stale rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of remoteRooms) {
    if (now - room.createdAt > 3600000) { // 1 hour
      try { room.host?.close(); } catch {}
      try { room.viewer?.close(); } catch {}
      remoteRooms.delete(code);
    }
  }
}, 600000);

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return code;
}

remoteWss.on("connection", (ws) => {
  let role = null;   // "host" | "viewer"
  let roomCode = null;

  ws.on("message", (data, isBinary) => {
    // Binary messages from host: forward frame to viewer
    if (isBinary && role === "host" && roomCode) {
      const room = remoteRooms.get(roomCode);
      if (room?.viewer?.readyState === 1) {
        room.viewer.send(data, { binary: true });
      }
      return;
    }

    // Text messages
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === "host_create") {
      // Host wants to create a room
      let code;
      do { code = genRoomCode(); } while (remoteRooms.has(code));
      roomCode = code;
      role = "host";
      remoteRooms.set(code, { host: ws, viewer: null, createdAt: Date.now() });
      ws.send(JSON.stringify({ type: "room_created", code }));

    } else if (msg.type === "viewer_join") {
      // Viewer wants to join a room
      const code = String(msg.code || "").toUpperCase();
      const room = remoteRooms.get(code);
      if (!room) return ws.send(JSON.stringify({ type: "error", message: "Room not found. Check the code and try again." }));
      if (room.viewer) return ws.send(JSON.stringify({ type: "error", message: "Room already has a viewer." }));
      roomCode = code;
      role = "viewer";
      room.viewer = ws;
      ws.send(JSON.stringify({ type: "joined" }));
      room.host.send(JSON.stringify({ type: "viewer_joined" }));

    } else if ((msg.type === "input" || msg.type === "settings") && role === "viewer" && roomCode) {
      // Forward input/settings from viewer to host
      const room = remoteRooms.get(roomCode);
      if (room?.host?.readyState === 1) {
        room.host.send(JSON.stringify(msg));
      }
    }
  });

  ws.on("close", () => {
    if (!roomCode) return;
    const room = remoteRooms.get(roomCode);
    if (!room) return;

    if (role === "host") {
      if (room.viewer?.readyState === 1) {
        room.viewer.send(JSON.stringify({ type: "host_left" }));
      }
      remoteRooms.delete(roomCode);
    } else if (role === "viewer") {
      room.viewer = null;
      if (room.host?.readyState === 1) {
        room.host.send(JSON.stringify({ type: "viewer_left" }));
      }
    }
  });
});

fastify.get("/remote", (_req, reply) => {
  return reply.type("text/html").sendFile("remote.html");
});

// Sandboxed game wrapper — prevents any game from redirecting the top frame
fastify.get("/games/play", (req, reply) => {
  const src = req.query.src || "";
  // Only allow paths that start with /games/ to prevent open redirect
  if (!src.startsWith("/games/")) return reply.code(400).send("Invalid game path");
  const escaped = src.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Game</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
iframe{width:100%;height:100%;border:none;display:block}
</style>
</head>
<body>
<iframe
  src="${escaped}"
  sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-orientation-lock allow-modals"
  allow="autoplay; fullscreen; gamepad"
  referrerpolicy="no-referrer"
></iframe>
</body>
</html>`;
  return reply.type("text/html").send(html);
});

fastify.get("/void", (_req, reply) => reply.type("text/html").sendFile("void.html"));

// Rate limit store for unlock endpoint — 1 attempt per IP per 10 minutes
const _sLim = new Map();
fastify.post("/api/s", (req, reply) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "x";
  const now = Date.now();
  const entry = _sLim.get(ip);
  if (entry && now < entry) return reply.code(429).send({ error: "rate limited" });
  _sLim.set(ip, now + 10 * 60 * 1000);
  if (_sLim.size > 5000) { for (const [k, v] of _sLim) { if (now > v) _sLim.delete(k); } }
  const sec = process.env.UNLOCK_SECRET || "fallback";
  const win = Math.floor(now / (5 * 60 * 1000));
  const tok = createHmac("sha256", sec).update(String(win)).digest("hex").slice(0, 20);
  return reply.send({ k: tok });
});

fastify.get("/claim", (req, reply) => {
  const sec = process.env.UNLOCK_SECRET || "fallback";
  const { k } = req.query;
  if (!k) return reply.code(404).type("text/html").sendFile("404.html");
  const now = Math.floor(Date.now() / (5 * 60 * 1000));
  const valid = [now, now - 1].map(w =>
    createHmac("sha256", sec).update(String(w)).digest("hex").slice(0, 20)
  );
  if (!valid.includes(k)) return reply.code(404).type("text/html").sendFile("404.html");
  const code = process.env.CLAIM_CODE || "???";
  const html = readFileSync(new URL("../public/claim.html", import.meta.url), "utf8")
    .replace("{{CLAIM_CODE}}", code);
  console.log(`[claim] valid claim at ${new Date().toISOString()} ip=${req.headers["x-forwarded-for"] || req.socket?.remoteAddress}`);
  return reply.type("text/html").send(html);
});

// Serve the agent script for easy download
const remotePath = fileURLToPath(new URL("../remote/", import.meta.url));
fastify.get("/api/remote/agent", (_req, reply) => {
  return reply.type("text/plain").sendFile("agent.py", remotePath);
});

// ── GET /ai — AI chat page ────────────────────────────────────────────────────
fastify.get("/ai", (_req, reply) => {
  return reply.type("text/html").sendFile("ai.html");
});

fastify.get("/ai/widget", (_req, reply) => {
  return reply.type("text/html").sendFile("ai-widget-install.html");
});
fastify.get("/ai/popup", (_req, reply) => {
  return reply.type("text/html").sendFile("ai-popup.html");
});

// Serve ai-widget-ext.js with permissive CORS so bookmarklet works cross-origin
fastify.get("/ai-widget-ext.js", (_req, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  return reply.type("application/javascript").sendFile("ai-widget-ext.js");
});

// ── POST /api/ai — Groq proxy (key stays server-side) ────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

fastify.post("/api/ai", async (req, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");

  // If no API key, proxy to main server
  if (!GROQ_API_KEY) {
    try {
      const upstream = await fetch("https://veilub.mooo.com/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      return reply.code(upstream.status).send(data);
    } catch (e) {
      return reply.code(503).send({ error: "AI proxy failed: " + e.message });
    }
  }

  const { messages, model = "llama-3.1-8b-instant" } = req.body ?? {};
  if (!Array.isArray(messages) || !messages.length)
    return reply.code(400).send({ error: "messages array required" });

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 1024 }),
  });

  const data = await res.json();
  if (!res.ok) return reply.code(res.status).send({ error: data.error?.message ?? "Groq error" });
  return reply.send({ content: data.choices?.[0]?.message?.content ?? "" });
});

fastify.options("/api/ai", (_req, reply) => {
  reply.header("Access-Control-Allow-Origin", "*")
       .header("Access-Control-Allow-Methods", "POST, OPTIONS")
       .header("Access-Control-Allow-Headers", "Content-Type")
       .code(204).send();
});

// ── GET /extension — install page ─────────────────────────────────────────────
fastify.get("/extension", (_req, reply) => {
  return reply.type("text/html").sendFile("extension.html");
});

// ── GET /extension.zip — stream the extension folder as a zip ─────────────────
fastify.get("/extension.zip", (_req, reply) => {
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  reply
    .header("Content-Type", "application/zip")
    .header("Content-Disposition", 'attachment; filename="freedns-extension.zip"');
  const zip = spawn("zip", ["-r", "-", "freedns-extension"], { cwd: projectRoot });
  zip.on("error", e => {
    console.error("[extension.zip] spawn error:", e.message);
    if (!reply.sent) reply.code(500).send("zip unavailable");
  });
  zip.stdout.pipe(reply.raw);
});

fastify.setNotFoundHandler((_req, reply) => {
  return reply.code(404).type("text/html").sendFile("404.html");
});

fastify.server.on("listening", () => {
  const address = fastify.server.address();
  console.log("Unblocker running at:");
  console.log(`  http://localhost:${address.port}`);
  console.log(`  http://${hostname()}:${address.port}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  bareServer.close();
  fastify.close();
  process.exit(0);
}

let port = parseInt(process.env.PORT || "");
if (isNaN(port)) port = 8080;

fastify.listen({ port, host: "0.0.0.0" });
