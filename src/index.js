import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { YouTube } from "youtube-sr";
import { execFile, spawn } from "node:child_process";
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
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
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
async function getSCClient() {
  if (scClient) return scClient;
  const key = await SoundCloud.keygen();
  scClient = new SoundCloud.Client(key);
  return scClient;
}

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
    const results = infos.filter(Boolean).map(s => ({
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
    scClient = null; // reset client on error so keygen retries
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

// SoundCloud audio stream via yt-dlp — proxied so school filters can't block it
fastify.get("/api/music/stream", async (req, reply) => {
  const id = String(req.query.id || "").trim();
  let scUrl;
  try { scUrl = Buffer.from(id, "base64url").toString(); }
  catch { return reply.status(400).send("Invalid ID"); }
  if (!scUrl.startsWith("https://soundcloud.com/")) return reply.status(400).send("Invalid URL");

  reply.header("Content-Type", "audio/mpeg");
  const child = spawn("yt-dlp", ["--no-playlist", "-f", "hls_mp3_1_0/bestaudio", "-o", "-", scUrl]);
  child.stderr.on("data", d => console.error("[music/stream]", d.toString().trim()));
  return reply.send(child.stdout);
});

// GitHub push webhook → Discord announcements
const GH_WEBHOOK_SECRET   = process.env.GH_WEBHOOK_SECRET   || "";
const DISCORD_TOKEN        = process.env.DISCORD_TOKEN        || "";
const ANNOUNCEMENTS_CHANNEL_ID = process.env.ANNOUNCEMENTS_CHANNEL_ID || "";

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
  if (!DISCORD_TOKEN || !ANNOUNCEMENTS_CHANNEL_ID) return reply.code(200).send("ok");

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

  await fetch(`https://discord.com/api/v10/channels/${ANNOUNCEMENTS_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bot ${DISCORD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body,
  });

  return reply.code(200).send("ok");
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
