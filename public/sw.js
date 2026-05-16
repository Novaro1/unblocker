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
  // SoundCloud — must load directly for stream access
  "w.soundcloud.com",
  "api-v2.soundcloud.com",
  "api.soundcloud.com",
  "cf-media.sndcdn.com",
  "cf-hls-media.sndcdn.com",
  "cf-preview-media.sndcdn.com",
  "a-v2.sndcdn.com",
  // YouTube — IFrame API and video player must load directly
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "s.ytimg.com",
  "i.ytimg.com",
  "yt3.ggpht.com",
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
  // Check bypass list BEFORE loadConfig — loadConfig can hang if bare-mux
  // SharedWorker fails to connect, which would block these requests forever.
  if (isCaptchaRequest(event.request.url)) return fetch(event.request);
  // If Scramjet wouldn't proxy this URL (same-origin API calls, static assets, etc.)
  // skip loadConfig entirely — it hangs when bare-mux SharedWorker is unavailable.
  if (!_scramjet.route(event)) return fetch(event.request);
  await _scramjet.loadConfig();
  return _scramjet.fetch(event);
}

self.addEventListener("fetch", (event) => {
  if (_scramjet) event.respondWith(handleRequest(event));
});
