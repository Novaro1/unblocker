import "dotenv/config";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { createHmac, timingSafeEqual, randomBytes as cryptoRandomBytes } from "node:crypto";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { checkDomain, FILTERS } from "./filters/index.js";
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
// Admins are typically on Windows or Mac. Students use Chromebooks (CrOS UA).
// If the visitor is on Windows or Mac with no prior access cookie, redirect them
// to Google Classroom immediately — before any JS runs.
fastify.get("/", (req, reply) => {
  const ua = req.headers["user-agent"] || "";
  const cookies = req.headers.cookie || "";
  const hasCookie = cookies.includes("v_ok=1");
  const isPoisoned = cookies.includes("v_poison=1");
  const isDesktop = /Windows NT|Macintosh/.test(ua);
  const isChromebook = /CrOS/.test(ua);

  // Poisoned: student activated panic mode — clear everything and redirect to Google Classroom
  if (isPoisoned) {
    reply
      .header("Set-Cookie", [
        "v_poison=; Max-Age=0; Path=/; SameSite=Lax",
        "v_ok=; Max-Age=0; Path=/; SameSite=Lax",
      ])
      .code(302).header("Location", "https://classroom.google.com").send();
    return;
  }

  // Windows/Mac with no prior access cookie → serve decoy page
  if (isDesktop && !isChromebook && !hasCookie) {
    return reply.type("text/html").sendFile("decoy.html");
  }

  // Set the access cookie and serve Veil directly
  reply.header("Set-Cookie", "v_ok=1; Max-Age=31536000; Path=/; SameSite=Lax");
  return reply.type("text/html").sendFile("index.html");
});

// ── GET /go — proxy / unblocker ───────────────────────────────────────────────
fastify.get("/go", (_req, reply) => {
  return reply.type("text/html").sendFile("index.html");
});

// ── SEO ───────────────────────────────────────────────────────────────────────
fastify.get("/sitemap.xml", (_req, reply) =>
  reply.type("application/xml").sendFile("sitemap.xml")
);

fastify.get("/robots.txt", (req, reply) => {
  if (req.hostname === "secure.brightpathlearning.website")
    return reply.type("text/plain").send(
      "User-agent: *\nAllow: /\nSitemap: https://secure.brightpathlearning.website/sitemap.xml\n"
    );
  // All other domains: tell crawlers to stay out
  return reply.type("text/plain").send("User-agent: *\nDisallow: /\n");
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
// code -> { host: ws, viewers: Map<viewerId, ws>, mode: "webrtc"|"jpeg", createdAt }
const remoteRooms = new Map();
const MAX_VIEWERS_PER_ROOM = 20;

// Clean up stale rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of remoteRooms) {
    if (now - room.createdAt > 3600000) {
      try { room.host?.close(); } catch {}
      for (const v of room.viewers.values()) try { v.close(); } catch {}
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
  let viewerId = null;

  ws.on("message", (data, isBinary) => {
    // Binary: legacy JPEG relay (used when agent can't run WebRTC)
    if (isBinary && role === "host" && roomCode) {
      const room = remoteRooms.get(roomCode);
      if (!room) return;
      for (const viewer of room.viewers.values()) {
        if (viewer.readyState !== 1) continue;
        if (viewer.bufferedAmount > 600000) continue; // backpressure
        viewer.send(data, { binary: true });
      }
      return;
    }

    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === "host_create") {
      let code;
      do { code = genRoomCode(); } while (remoteRooms.has(code));
      roomCode = code;
      role = "host";
      const mode = msg.mode === "webrtc" ? "webrtc" : "jpeg";
      remoteRooms.set(code, { host: ws, viewers: new Map(), mode, createdAt: Date.now() });
      ws.send(JSON.stringify({ type: "room_created", code }));

    } else if (msg.type === "viewer_join") {
      const code = String(msg.code || "").toUpperCase();
      const room = remoteRooms.get(code);
      if (!room) return ws.send(JSON.stringify({ type: "error", message: "Room not found. Check the code and try again." }));
      if (room.viewers.size >= MAX_VIEWERS_PER_ROOM) return ws.send(JSON.stringify({ type: "error", message: "Room is full." }));
      roomCode = code;
      role = "viewer";
      viewerId = randomBytes(8).toString("hex");
      room.viewers.set(viewerId, ws);
      const count = room.viewers.size;
      ws.send(JSON.stringify({ type: "joined", viewerId, viewerCount: count, mode: room.mode }));
      if (room.host?.readyState === 1) {
        room.host.send(JSON.stringify({ type: "viewer_joined", viewerId, viewerCount: count }));
      }
      for (const [vid, v] of room.viewers) {
        if (vid !== viewerId && v.readyState === 1) v.send(JSON.stringify({ type: "viewer_count", count }));
      }

    // ── WebRTC signaling relay ─────────────────────────────────────────────
    } else if (msg.type === "offer" && role === "host" && roomCode) {
      // Host sends WebRTC offer to a specific viewer
      const room = remoteRooms.get(roomCode);
      const vws = room?.viewers.get(msg.viewerId);
      if (vws?.readyState === 1) vws.send(JSON.stringify(msg));

    } else if (msg.type === "answer" && role === "viewer" && roomCode) {
      // Viewer sends WebRTC answer back to host
      const room = remoteRooms.get(roomCode);
      if (room?.host?.readyState === 1) room.host.send(JSON.stringify({ ...msg, viewerId }));

    } else if (msg.type === "ice_candidate" && roomCode) {
      const room = remoteRooms.get(roomCode);
      if (!room) return;
      if (role === "host") {
        const vws = room.viewers.get(msg.viewerId);
        if (vws?.readyState === 1) vws.send(JSON.stringify(msg));
      } else if (role === "viewer" && room.host?.readyState === 1) {
        room.host.send(JSON.stringify({ ...msg, viewerId }));
      }

    // ── Settings and input (both modes) ───────────────────────────────────
    } else if (msg.type === "settings" && role === "viewer" && roomCode) {
      const MAX_DIM = 1920, MAX_FPS = 30, MAX_QUALITY = 85;
      if (msg.maxDim !== undefined) {
        const dim = parseInt(msg.maxDim) || 0;
        msg.maxDim = dim === 0 ? MAX_DIM : Math.min(dim, MAX_DIM);
      }
      if (msg.fps)     msg.fps     = Math.min(parseInt(msg.fps)     || MAX_FPS,     MAX_FPS);
      if (msg.quality) msg.quality = Math.min(parseInt(msg.quality) || MAX_QUALITY, MAX_QUALITY);
      const room = remoteRooms.get(roomCode);
      if (room?.host?.readyState === 1) room.host.send(JSON.stringify(msg));

    } else if (msg.type === "input" && role === "viewer" && roomCode) {
      const room = remoteRooms.get(roomCode);
      if (room?.host?.readyState === 1) room.host.send(JSON.stringify(msg));
    }
  });

  ws.on("close", () => {
    if (!roomCode) return;
    const room = remoteRooms.get(roomCode);
    if (!room) return;

    if (role === "host") {
      for (const v of room.viewers.values()) {
        if (v.readyState === 1) v.send(JSON.stringify({ type: "host_left" }));
      }
      remoteRooms.delete(roomCode);
    } else if (role === "viewer") {
      room.viewers.delete(viewerId);
      const count = room.viewers.size;
      if (room.host?.readyState === 1) {
        room.host.send(JSON.stringify({ type: "viewer_left", viewerId, viewerCount: count }));
      }
      for (const v of room.viewers.values()) {
        if (v.readyState === 1) v.send(JSON.stringify({ type: "viewer_count", count }));
      }
    }
  });
});

fastify.get("/remote", (_req, reply) => {
  return reply.type("text/html").sendFile("remote.html");
});

// Block popups/redirects on all game HTML files at the HTTP header level
fastify.get("/games/:file", (req, reply) => {
  const file = req.params.file;
  if (!file.endsWith(".html")) return reply.callNotFound();
  reply
    .header("Content-Security-Policy",
      "default-src * data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; " +
      "navigate-to 'none'; form-action 'none'")
    .header("X-Frame-Options", "SAMEORIGIN")
    .type("text/html")
    .sendFile("games/" + file);
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

// ── POST /api/report-bug — submit a bug report, forwarded to Discord ─────────
const _bugLim = new Map(); // ip -> resetAt (5 reports per 10 min)
fastify.post("/api/report-bug", async (req, reply) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "x";
  const now = Date.now();
  const entry = _bugLim.get(ip);
  if (entry && now < entry.resetAt && entry.count >= 5) {
    return reply.code(429).send({ error: "Too many reports. Try again later." });
  }
  if (!entry || now > entry.resetAt) {
    _bugLim.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    entry.count++;
  }
  if (_bugLim.size > 5000) { for (const [k, v] of _bugLim) { if (now > v.resetAt) _bugLim.delete(k); } }

  const { type, description, page } = req.body || {};
  if (!description || typeof description !== "string" || description.trim().length < 5) {
    return reply.code(400).send({ error: "Description too short." });
  }
  const safeDesc = description.slice(0, 1000).replace(/`/g, "'");
  const safePage = (page && typeof page === "string") ? page.slice(0, 200) : "unknown";
  const safeType = ["bug", "suggestion", "broken-site"].includes(type) ? type : "bug";
  const typeLabel = { bug: "Bug", suggestion: "Suggestion", "broken-site": "Broken Site" }[safeType];
  const token = process.env.DISCORD_TOKEN;
  const channelId = process.env.MOD_LOG_CHANNEL_ID;
  if (!token || !channelId) return reply.send({ ok: true }); // silently succeed if not configured
  try {
    const body = JSON.stringify({
      embeds: [{
        title: `${typeLabel} Report`,
        description: `\`\`\`\n${safeDesc}\n\`\`\``,
        color: safeType === "bug" ? 0xef4444 : safeType === "suggestion" ? 0x6366f1 : 0xf59e0b,
        fields: [{ name: "Page", value: safePage, inline: true }],
        footer: { text: `via veil website` },
        timestamp: new Date().toISOString(),
      }]
    });
    const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
    const { default: https } = await import("node:https");
    await new Promise((resolve, reject) => {
      const req2 = https.request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bot ${token}`, "Content-Length": Buffer.byteLength(body) }
      }, (res) => { res.resume(); resolve(); });
      req2.on("error", reject);
      req2.setTimeout(5000, () => { req2.destroy(); reject(new Error("timeout")); });
      req2.write(body);
      req2.end();
    });
  } catch (e) {
    console.error("[report-bug] discord post failed:", e.message);
  }
  return reply.send({ ok: true });
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
      const upstream = await fetch("https://secure.brightpathlearning.website/api/ai", {
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

// ── Share system ───────────────────────────────────────────────────────────
const sharesPath = fileURLToPath(new URL("../shares.json", import.meta.url));
const _shareLim  = new Map(); // ip -> resetAt

let shares = {};
try { if (existsSync(sharesPath)) shares = JSON.parse(readFileSync(sharesPath, "utf8")); } catch {}

function saveShares() {
  try { writeFileSync(sharesPath, JSON.stringify(shares)); } catch {}
}

function shareId() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  const bytes = randomBytes(8);
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}

// Prune shares older than 30 days on startup
const SHARE_TTL = 30 * 24 * 60 * 60 * 1000;
const now0 = Date.now();
for (const [k, v] of Object.entries(shares)) {
  if (now0 - v.ts > SHARE_TTL) delete shares[k];
}
saveShares();

fastify.post("/api/share", async (req, reply) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket?.remoteAddress || "x";
  const now = Date.now();
  const lim = _shareLim.get(ip);
  if (lim && now < lim) return reply.code(429).send({ error: "Rate limited — wait before sharing again." });
  _shareLim.set(ip, now + 30_000); // 1 share per 30s per IP
  if (_shareLim.size > 5000) { for (const [k, v] of _shareLim) { if (now > v) _shareLim.delete(k); } }

  const { type, data } = req.body || {};
  const VALID = ["site", "ai", "music"];
  if (!VALID.includes(type) || !data) return reply.code(400).send({ error: "Invalid share payload." });

  const id = shareId();
  shares[id] = { type, data, ts: now };
  saveShares();

  const base = `${req.protocol}://${req.hostname}`;
  return reply.send({ id, url: `${base}/s/${id}` });
});

fastify.get("/api/share/:id", (req, reply) => {
  const share = shares[req.params.id];
  if (!share) return reply.code(404).send({ error: "Share not found or expired." });
  return reply.send(share);
});

fastify.get("/s/:id", (req, reply) => {
  const share = shares[req.params.id];
  if (!share) return reply.code(404).type("text/html").sendFile("404.html");
  const { type, data } = share;
  if (type === "site")  return reply.redirect("/games/play?src=" + encodeURIComponent(data.url));
  if (type === "ai")    return reply.redirect("/ai.html?share="   + req.params.id);
  if (type === "music") return reply.redirect("/music.html?share=" + req.params.id);
  return reply.redirect("/");
});

// ── Filter Check API ──────────────────────────────────────────────────────────
const filterKeysPath    = fileURLToPath(new URL("../filter-api-keys.json", import.meta.url));
const botInternalKeyPath = fileURLToPath(new URL("../bot-internal-key.txt", import.meta.url));

function loadFilterKeys() {
  if (!existsSync(filterKeysPath)) return {};
  try { return JSON.parse(readFileSync(filterKeysPath, "utf-8")); } catch { return {}; }
}
function saveFilterKeys(keys) {
  writeFileSync(filterKeysPath, JSON.stringify(keys, null, 2));
}

// Ensure a permanent internal key exists for the bot (created once, stored in bot-internal-key.txt)
function ensureBotInternalKey() {
  let key;
  // Reuse existing internal key if already written
  if (existsSync(botInternalKeyPath)) {
    key = readFileSync(botInternalKeyPath, "utf-8").trim();
  } else {
    key = "veil_internal_" + cryptoRandomBytes(16).toString("hex");
  }
  const keys = loadFilterKeys();
  if (!keys[key]) {
    keys[key] = { name: "Veil Bot Internal", tier: "internal", dailyLimit: 999999, createdAt: new Date().toISOString(), usage: {} };
    saveFilterKeys(keys);
    console.log("[filter-api] Created internal bot key");
  }
  writeFileSync(botInternalKeyPath, key);
  return key;
}
ensureBotInternalKey();

// Generate a new API key — called from bot /createapikey command
export function createFilterApiKey({ name, tier = "free", dailyLimit = 500 }) {
  const key = "veil_" + cryptoRandomBytes(20).toString("hex");
  const keys = loadFilterKeys();
  keys[key] = { name, tier, dailyLimit, createdAt: new Date().toISOString(), usage: {} };
  saveFilterKeys(keys);
  return key;
}

function checkFilterApiKey(key, reply) {
  if (!key) {
    reply.code(401).send({ error: "API key required. Pass ?key=YOUR_KEY or Authorization: Bearer YOUR_KEY" });
    return null;
  }
  const keys = loadFilterKeys();
  const entry = keys[key];
  if (!entry) {
    reply.code(401).send({ error: "Invalid API key." });
    return null;
  }
  // Daily rate limit
  const today = new Date().toISOString().slice(0, 10);
  if (!entry.usage[today]) {
    // Evict old dates
    entry.usage = { [today]: 0 };
  }
  entry.usage[today]++;
  if (entry.usage[today] > entry.dailyLimit) {
    saveFilterKeys(keys);
    reply.code(429).send({ error: `Daily limit of ${entry.dailyLimit} requests reached. Upgrade your plan.` });
    return null;
  }
  saveFilterKeys(keys);
  return entry;
}

// GET /api/v1/check?domain=DOMAIN&key=KEY  (key also accepted as Authorization: Bearer KEY)
fastify.get("/api/v1/check", async (req, reply) => {
  const key = req.query.key || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const keyEntry = checkFilterApiKey(key, reply);
  if (!keyEntry) return;

  const domain = req.query.domain;
  if (!domain) return reply.code(400).send({ error: "Missing ?domain= parameter." });

  const only = req.query.filters ? req.query.filters.split(",").map(s => s.trim()) : undefined;

  try {
    const result = await checkDomain(domain, only);
    reply.header("X-RateLimit-Limit", keyEntry.dailyLimit);
    reply.header("X-RateLimit-Remaining", Math.max(0, keyEntry.dailyLimit - (Object.values(keyEntry.usage)[0] ?? 0)));
    return reply.send({ success: true, ...result });
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

// GET /api/v1/filters — list all available filter IDs and names (no key needed)
fastify.get("/api/v1/filters", (_req, reply) =>
  reply.send({ filters: FILTERS.map(({ id, name }) => ({ id, name })) })
);

// GET /api/v1/status — health check (no key needed)
fastify.get("/api/v1/status", (_req, reply) =>
  reply.send({ ok: true, version: "1.0.0", filters: FILTERS.length })
);

// POST /api/admin/createkey — create a new API key (requires ADMIN_TOKEN or localhost)
fastify.post("/api/admin/createkey", async (req, reply) => {
  const adminToken = process.env.ADMIN_TOKEN;
  const authHeader = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const ip = req.ip;
  const isLocalhost = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (!isLocalhost && (!adminToken || authHeader !== adminToken)) {
    return reply.code(403).send({ error: "Forbidden. Requires ADMIN_TOKEN or localhost." });
  }
  const { name, tier = "free", dailyLimit = 500 } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return reply.code(400).send({ error: "name is required." });
  }
  const key = createFilterApiKey({ name: name.trim(), tier, dailyLimit: Number(dailyLimit) || 500 });
  return reply.send({ key, name: name.trim(), tier, dailyLimit });
});

// GET /api/admin/botkey — return the internal bot key (localhost only, no auth needed)
fastify.get("/api/admin/botkey", (req, reply) => {
  const ip = req.ip;
  const isLocalhost = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (!isLocalhost) return reply.code(403).send({ error: "Forbidden." });
  if (!existsSync(botInternalKeyPath)) return reply.code(503).send({ error: "Bot key not initialized." });
  return reply.send({ key: readFileSync(botInternalKeyPath, "utf-8").trim() });
});

// ── Premium page & API ────────────────────────────────────────────────────────
const PREMIUM_PRICE      = process.env.PREMIUM_PRICE      || "3.00";
const PREMIUM_CRYPTO     = process.env.PREMIUM_CRYPTO     || "";
const TICKETS_CHANNEL_ID = process.env.TICKETS_CHANNEL_ID || "";

fastify.get("/premium", (_req, reply) =>
  reply.type("text/html").sendFile("premium.html")
);

fastify.get("/api/premium-info", (_req, reply) =>
  reply.send({ price: PREMIUM_PRICE, crypto: PREMIUM_CRYPTO })
);

fastify.post("/api/premium-claim", async (req, reply) => {
  if (rateLimit(req, reply, { max: 5, windowMs: 60_000 })) return;

  const { discord, txn, note } = req.body ?? {};
  if (!discord || typeof discord !== "string" || discord.trim().length === 0)
    return reply.code(400).send({ error: "Discord username is required." });
  if (!txn || typeof txn !== "string" || txn.trim().length === 0)
    return reply.code(400).send({ error: "Transaction ID is required." });

  if (!DISCORD_TOKEN || !TICKETS_CHANNEL_ID) {
    // Still succeeds for the user — staff will be contacted another way
    return reply.send({ ok: true });
  }

  const fields = [
    { name: "Discord username", value: discord.trim().slice(0, 200), inline: true },
    { name: "Transaction ID",   value: txn.trim().slice(0, 200),     inline: true },
  ];
  if (note && typeof note === "string" && note.trim().length > 0)
    fields.push({ name: "Note", value: note.trim().slice(0, 500), inline: false });

  const body = JSON.stringify({
    content: `<@&${process.env.STAFF_ROLE_ID || ""}>`,
    embeds: [{
      title: "💳 Premium Claim — Website",
      color: 0xfbbf24,
      fields,
      footer: { text: "Submitted via secure.brightpathlearning.website/premium" },
      timestamp: new Date().toISOString(),
    }],
  });

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${TICKETS_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bot ${DISCORD_TOKEN}`, "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) console.error(`[premium-claim] Discord API error: ${res.status}`);
  } catch (e) {
    console.error(`[premium-claim] Discord fetch failed: ${e.message}`);
  }

  return reply.send({ ok: true });
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
