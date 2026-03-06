import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath        = fileURLToPath(new URL("../public/", import.meta.url));
const tokensPath        = fileURLToPath(new URL("../tokens.json", import.meta.url));
const betaFeaturesPath  = fileURLToPath(new URL("../beta-features.json", import.meta.url));
const bareAsModule3Path = fileURLToPath(
  new URL("../node_modules/@mercuryworkshop/bare-as-module3/dist/", import.meta.url)
);

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  allow_udp_streams: false,
  dns_servers: ["1.1.1.3", "1.0.0.3"],
});

// Bare server handles HTTPS fetching server-side using Node.js CA bundle.
// Raise the keep-alive connection limit — default of 10/min is hit immediately
// by pages like YouTube that make dozens of parallel requests.
const bareServer = createBareServer("/bare/", {
  connectionLimiter: {
    maxConnectionsPerIP: 10000,
    windowDuration: 60,
    blockDuration: 1,
  },
});

const fastify = Fastify({
  serverFactory: (handler) => {
    return createServer()
      .on("request", (req, res) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
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

// Caddy on-demand TLS ask endpoint — always approve
fastify.get('/caddy-ask', (_req, reply) => {
  reply.code(200).send('ok');
});

// Ambassador token verification
fastify.get('/api/verify-token', (req, reply) => {
  const { token } = req.query;
  if (!token) return reply.code(400).send({ valid: false });
  try {
    const tokens = existsSync(tokensPath)
      ? JSON.parse(readFileSync(tokensPath, "utf-8"))
      : [];
    const entry = tokens.find((t) => t.token === token);
    if (entry) return reply.send({ valid: true, username: entry.username });
    return reply.send({ valid: false });
  } catch {
    return reply.code(500).send({ valid: false });
  }
});

// Ambassador leaderboard — returns top ambassadors sorted by points (no tokens exposed)
fastify.get('/api/leaderboard', (_req, reply) => {
  try {
    const tokens = existsSync(tokensPath)
      ? JSON.parse(readFileSync(tokensPath, "utf-8"))
      : [];
    const board = tokens
      .map((t) => ({ username: t.username, points: t.points ?? 0 }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 20)
      .map((t, i) => ({ rank: i + 1, username: t.username, points: t.points }));
    return reply.send(board);
  } catch {
    return reply.code(500).send([]);
  }
});

// Beta feature status — computes whether each feature is still in its ambassador-only window
fastify.get('/api/beta-features', (_req, reply) => {
  try {
    const raw = existsSync(betaFeaturesPath)
      ? JSON.parse(readFileSync(betaFeaturesPath, "utf-8"))
      : [];
    const now = Date.now();
    const result = raw.map((f) => {
      const betaMs  = (f.betaDays ?? 14) * 86400000;
      const elapsed = now - new Date(f.releasedAt).getTime();
      const isBeta  = elapsed < betaMs;
      return {
        id:       f.id,
        type:     f.type,
        key:      f.key,
        label:    f.label,
        isBeta,
        daysLeft: isBeta ? Math.ceil((betaMs - elapsed) / 86400000) : 0,
      };
    });
    return reply.send(result);
  } catch {
    return reply.code(500).send([]);
  }
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
