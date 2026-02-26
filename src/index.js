import { createServer } from "node:http";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath  = fileURLToPath(new URL("../public/", import.meta.url));
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
  prefix: "/scram/",
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
