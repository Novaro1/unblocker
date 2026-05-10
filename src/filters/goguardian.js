import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { TextEncoder, TextDecoder } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cats = JSON.parse(readFileSync(join(__dirname, "json/goguardian.json"), "utf8"));

function concatUint8(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function md5(data) {
  return Uint8Array.from(createHash("md5").update(Buffer.from(data)).digest());
}

function evpBytesToKey(password, salt) {
  let derived = new Uint8Array(0);
  let prev = new Uint8Array(0);
  while (derived.length < 48) {
    const input = concatUint8(prev, password, salt);
    prev = md5(input);
    derived = concatUint8(derived, prev);
  }
  return { key: derived.slice(0, 32), iv: derived.slice(32, 48) };
}

async function decryptOpenSSL(encryptedB64, password) {
  const raw = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  if (new TextDecoder().decode(raw.slice(0, 8)) !== "Salted__")
    throw new Error("Invalid OpenSSL salt header");
  const salt = raw.slice(8, 16);
  const { key, iv } = evpBytesToKey(password, salt);
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", key, { name: "AES-CBC" }, false, ["decrypt"]);
  const decrypted = await globalThis.crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, raw.slice(16));
  return new TextDecoder().decode(decrypted);
}

export async function goguardian(url) {
  const PUBLIC_KEY = "82fdbf93-6361-454a-9460-e03bc2baaeff";
  const PASSWORD_PREFIX = "59afe4da-9a47-4cff-b024-c9e8fab53eb1";
  const password = new TextEncoder().encode(PASSWORD_PREFIX + PUBLIC_KEY);

  const lolText = await fetch(
    "https://raw.githubusercontent.com/supercoolgenizy/superman/refs/heads/main/lol?" + Date.now()
  ).then(r => r.text());
  const token = await decryptOpenSSL(lolText, password);

  const body = JSON.stringify({
    cleanUrl: url.replace(/^https?:\/\//, ""),
    rawUrl: url,
  });
  const res = await fetch("https://panther.goguardian.com/api/v2/categories", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "extension-version": "4.1.210",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      "content-type": "text/plain;charset=UTF-8",
      accept: "*/*",
      origin: "chrome-extension://haldlgldplgnggkjaafhelgiaglafanh",
    },
    body,
  });

  const apiResponse = await res.json();
  const catIds = Array.isArray(apiResponse.cats) ? apiResponse.cats : [];
  const pairs = catIds.filter(c => cats[c]).map(c => ({ name: cats[c][0], blocked: cats[c][1] }));
  const category = pairs.map(p => p.name).join(", ") || "Uncategorized";
  const blocked = pairs.length > 0 ? pairs.some(p => p.blocked) : true;
  return { category, blocked };
}
