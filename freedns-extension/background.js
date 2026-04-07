// Background service worker — proxies cross-origin fetches for content scripts
// Content scripts in MV3 can't make cross-origin requests even with host_permissions.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "fetch-proxy") {
    const opts = { method: msg.method || "GET" };
    if (msg.headers) opts.headers = msg.headers;
    if (msg.body)    opts.body    = msg.body;

    fetch(msg.url, opts)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // keep channel open for async response
  }
});
