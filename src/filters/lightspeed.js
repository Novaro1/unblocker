import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { WebSocket } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const json = JSON.parse(readFileSync(join(__dirname, "json/lightspeed.json"), "utf8"));

function categorize(num) {
  const entry = json.find(e => e.CategoryNumber == num);
  if (!entry) return { category: String(num), blocked: true };
  return { category: entry.CategoryName, blocked: entry.Allow != 1 };
}

export async function lightspeed(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      "wss://production-gc.lsfilter.com?a=0ef9b862-b74f-4e8d-8aad-be549c5f452a&customer_id=74-1082-F000&agentType=chrome_extension&agentVersion=3.777.0&userGuid=00000000-0000-0000-0000-000000000000"
    );
    const timer = setTimeout(() => { ws.terminate(); reject(new Error("timeout")); }, 10000);
    ws.on("open", () => {
      ws.send(JSON.stringify({
        action: "dy_lookup",
        host: url.replace(/^https?:\/\//, "").split("/")[0],
        ip: "174.85.104.135",
        customerId: "74-1082-F000",
      }));
    });
    ws.on("message", msg => {
      clearTimeout(timer);
      ws.close();
      try {
        const json = JSON.parse(msg.toString());
        resolve(categorize(json.cat));
      } catch { resolve({ category: "Unknown", blocked: true }); }
    });
    ws.on("error", err => { clearTimeout(timer); reject(err); });
  });
}
