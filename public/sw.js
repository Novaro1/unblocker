const _swBC = new BroadcastChannel("_sw_init");
let _scramjet = null;

// Skip waiting phase and immediately claim all clients so the SW controls
// the page right away on first install — prevents 404 on first navigation.
self.addEventListener("install",  ()  => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

try {
  importScripts("/scramjet/scramjet.all.js");
  const { ScramjetServiceWorker } = $scramjetLoadWorker();
  _scramjet = new ScramjetServiceWorker();
  _swBC.postMessage({ ok: true });
  console.log("[sw] init OK");
} catch(e) {
  console.error("[sw] init failed:", e.message, e.stack);
  _swBC.postMessage({ ok: false, message: e.message, stack: String(e.stack || "") });
}

async function handleRequest(event) {
  await _scramjet.loadConfig();
  if (_scramjet.route(event)) return _scramjet.fetch(event);
  return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
  if (_scramjet) event.respondWith(handleRequest(event));
});
