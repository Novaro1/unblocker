import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";

const DOMAIN = "hamiltoncstn.aristotleinsight.com";
const AUTH_KEY = "aristotle-chrome-agent";
const AUTH_SECRET = "bc49421b5659aa068f58f37986e8485bfb9d0de3c8b7bc52bdbcae18903a443c0b039339039440f943fb8bc42019ffa8a2658fc1a149ee686f18bf830b47ee85";

export async function aristotle(url) {
  return new Promise((resolve, reject) => {
    const ssId = randomUUID();
    const ws = new WebSocket(`wss://${DOMAIN}/wss/wf?ssId=${ssId}`);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error("timeout")); }, 10000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        cmd: 0, auth: true, key: AUTH_KEY, secret: AUTH_SECRET,
        guid: randomUUID(), os: "win", user_id: "testuser",
        connect_time: new Date().toUTCString(), version: "1.0.0",
      }));
    });

    ws.on("message", event => {
      const data = JSON.parse(event.toString());
      if (data.authenticated !== undefined) {
        if (!data.authenticated) { ws.close(); clearTimeout(timer); reject(new Error("Auth failed")); return; }
        ws.send(JSON.stringify({ cmd: 2, msgId: randomUUID(), url, type: "main_frame" }));
      }
      if (data.msgId) {
        clearTimeout(timer);
        ws.close();
        resolve({ category: data.category ?? data.block_type ?? "Unknown", blocked: !!data.block });
      }
    });

    ws.on("error", err => { clearTimeout(timer); reject(err); });
  });
}
