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

// Hostnames that must load directly (not rewritten through Scramjet).
const DIRECT_HOSTS = new Set([
  // Captcha providers
  "www.google.com",
  "www.gstatic.com",
  "recaptcha.net",
  "hcaptcha.com",
  "js.hcaptcha.com",
  "newassets.hcaptcha.com",
  "imgs.hcaptcha.com",
  "challenges.cloudflare.com",
  "static.cloudflareinsights.com",
  // SoundCloud — widget iframe + API must run under their own origin
  // so the SC Widget postMessage communication works correctly
  "w.soundcloud.com",
  "api-v2.soundcloud.com",
  "api.soundcloud.com",
  "cf-media.sndcdn.com",
  "cf-hls-media.sndcdn.com",
  "cf-preview-media.sndcdn.com",
  "a-v2.sndcdn.com",
]);

function isCaptchaRequest(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (DIRECT_HOSTS.has(hostname)) return true;
    // reCAPTCHA can also be loaded from the site's own domain via a path
    if (pathname.includes("/recaptcha/") || pathname.includes("/captcha/")) return true;
  } catch {}
  return false;
}

async function handleRequest(event) {
  await _scramjet.loadConfig();
  if (isCaptchaRequest(event.request.url)) return fetch(event.request);
  if (_scramjet.route(event)) return _scramjet.fetch(event);
  return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
  if (_scramjet) event.respondWith(handleRequest(event));
});
