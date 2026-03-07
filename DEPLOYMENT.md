# Veil — Alternative Entry Point Deployment

Each option below acts as a **full reverse proxy** — all traffic is forwarded transparently to the Veil backend. The user's browser never sees the origin server, and the service worker, games, settings, and proxy all work normally.

> **Two repos:**
> - **`Novaro1/veil-edge`** — Cloudflare Pages, Netlify Edge Functions (minimal, no Node.js files)
> - **`Novaro1/unblocker`** — Railway, Render, Koyeb, Glitch, HuggingFace, Google Cloud Run (full server)

---

## Cloudflare Workers

**Domain format:** `yourname.workers.dev`
**WebSocket support:** Yes
**Free tier:** 100,000 requests/day

### Setup

1. Go to [workers.cloudflare.com](https://workers.cloudflare.com) and create a free account
2. Click **Create Worker**
3. Replace all the default code with:

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = "veilub.mooo.com";
    url.protocol = "https:";
    url.port = "";

    return fetch(new Request(url, request));
  }
}
```

4. Click **Deploy**

Your Worker gets a URL like `veil.yourname.workers.dev`. Every request is forwarded to the backend — no redirect, no iframe.

### Spinning up more links

When a Worker URL gets flagged, create a new Worker in under a minute with a different name. The code is identical — just change the name.

---

## Deno Deploy

**Domain format:** `yourproject.deno.dev`
**WebSocket support:** Yes
**Free tier:** 1,000,000 requests/month

### Setup

1. Go to [dash.deno.com](https://dash.deno.com) and sign in with GitHub
2. Click **New Playground**
3. Replace all the default code with:

```ts
Deno.serve((req) => {
  const url = new URL(req.url);
  url.hostname = "veilub.mooo.com";
  url.protocol = "https:";
  url.port = "";
  return fetch(new Request(url, req));
});
```

4. Click **Save & Deploy**

Your project gets a URL like `yourproject.deno.dev`.

### Spinning up more links

Same as Workers — create a new Playground, paste the same code, deploy. New URL in under a minute.

---

## val.town

**Domain format:** `https://username-valname.val.run`
**WebSocket support:** Partial
**Free tier:** Generous

### Setup

1. Go to [val.town](https://val.town) and create a free account
2. Click **New Val** (top right)
3. In the editor that opens, click the **type selector** — it's the small icon or label to the left of the val name at the top. Change it to **HTTP**
4. Name it something like `veil`
5. Replace all the code with:

```ts
export default async function(req: Request): Promise<Response> {
  const url = new URL(req.url);
  url.hostname = "veilub.mooo.com";
  url.protocol = "https:";
  url.port = "";
  return fetch(new Request(url, req));
}
```

6. Click **Run** (or Save)
7. Your URL is shown in the **Endpoints** tab at the bottom of the editor, or at the top of the val page. It will look like `https://yourusername-veil.val.run`

---

## Cloudflare Pages (with edge function)

**Domain format:** `yourproject.pages.dev`
**WebSocket support:** Yes
**Free tier:** Unlimited requests
**Requires:** A GitHub repo

This is different from Cloudflare Workers. Pages is normally for static sites, but adding a `_worker.js` file makes it run as an edge function on every request — full proxy, no redirect. The `pages.dev` domain is a different pattern from `workers.dev` and less commonly blocked.

### Setup

1. Go to [pages.cloudflare.com](https://pages.cloudflare.com) → **Create a project → Connect to Git**
2. Connect your GitHub account and select **`Novaro1/veil-edge`**
3. Click **Begin setup**
4. Leave the build command and output directory blank
5. Click **Save and Deploy**

Your URL: `yourproject.pages.dev`

### Spinning up more links

Fork or duplicate the repo, give it a new name, connect it as a new Pages project. Different subdomain every time.

---

## Netlify Edge Functions

**Domain format:** `yoursite.netlify.app`
**WebSocket support:** Partial
**Free tier:** 3,000,000 edge function invocations/month
**Requires:** A GitHub repo

This is different from the simple Netlify redirect. Edge Functions run actual Deno code at the network edge and fully proxy the request — the response comes from Netlify's infrastructure with your `netlify.app` domain on it.

### Setup

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import from Git**
2. Connect GitHub and select **`Novaro1/veil-edge`**
3. Leave all build settings blank — just click **Deploy site**

Your URL: `yoursite.netlify.app`

---

## Railway (full server — own hosting)

**Domain format:** `yourproject.railway.app`
**WebSocket support:** Yes (full)
**Free tier:** $5/month credit (covers a small server 24/7)
**Requires:** Cloning the Veil GitHub repo

This deploys the actual Veil Node.js server on Railway's infrastructure. Completely independent of your EC2 instance — its own server, its own IP, its own domain. Great backup if the main server goes down.

### Setup

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project → Deploy from GitHub repo**
3. Select **`Novaro1/unblocker`**
4. Railway detects Node.js automatically. Under **Settings**, confirm the start command is:
   ```
   node src/index.js
   ```
5. Under **Settings → Networking**, click **Generate Domain**

Your URL: `yourproject.railway.app`

### Why this is powerful

This is a completely separate instance of Veil on Railway's infrastructure with its own IP and domain. If your EC2 gets blocked or goes down, this still works independently.

---

## Render (full server — own hosting)

**Domain format:** `yourservice.onrender.com`
**WebSocket support:** Yes (full)
**Free tier:** Free with spin-down after 15 min inactivity
**Requires:** Cloning the Veil GitHub repo

Same concept as Railway — deploys the real Veil server on Render's infrastructure. `onrender.com` is a trusted developer domain with no proxy association.

### Setup

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **New → Web Service**
3. Select **`Novaro1/unblocker`**
4. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
5. Click **Create Web Service**

Your URL: `yourservice.onrender.com`

> Note: The free tier spins down after 15 minutes of no traffic and takes ~30 seconds to wake back up. Upgrade to the $7/month plan to keep it always on.

---

## Koyeb (full server — own hosting)

**Domain format:** `yourapp-yourorg.koyeb.app`
**WebSocket support:** Yes (full)
**Free tier:** 1 nano instance always on, no spin-down
**Requires:** Cloning the Veil GitHub repo

Koyeb's free tier stays running 24/7 unlike Render. The `koyeb.app` domain is uncommon enough that most filters have no idea what it is.

### Setup

1. Go to [koyeb.com](https://www.koyeb.com) and create a free account
2. Click **Create App → GitHub**
3. Select **`Novaro1/unblocker`**
4. Configure:
   - **Run command:** `node src/index.js`
   - **Port:** `8080`
5. Click **Deploy**

Your URL: `yourapp-yourorg.koyeb.app`

---

## HuggingFace Spaces (Docker)

**Domain format:** `https://username-spacename.hf.space`
**WebSocket support:** Yes
**Free tier:** Free CPU instances
**Requires:** A HuggingFace account and git

HuggingFace is an AI/ML research platform. Nobody blocks `hf.space` because doing so would break AI tools used in education. You can run any Docker container there including Veil.

### Setup

1. Go to [huggingface.co](https://huggingface.co) → **New Space**
2. Set **Space SDK** to **Docker**
3. Give it a name (e.g. `veil`) and click **Create Space** — do NOT link GitHub here

4. Generate an access token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) with **write** permissions

5. Clone the empty Space locally:
   ```bash
   git clone https://huggingface.co/spaces/YOURUSERNAME/veil
   cd veil
   # When prompted for a password, paste your access token
   ```

6. Copy the Veil repo files into it:
   ```bash
   git clone https://github.com/Novaro1/unblocker /tmp/unblocker
   cp -r /tmp/unblocker/. .
   ```

7. Push to HuggingFace:
   ```bash
   git add .
   git commit -m "Deploy Veil"
   git push
   # Use your access token as the password again
   ```

HuggingFace detects the `Dockerfile` and builds automatically. Your URL is ready in ~2 minutes.

Your URL: `https://yourusername-veil.hf.space`

The URL reads like an AI demo (`https://john-veil.hf.space`) which raises zero suspicion.

---

## Google Cloud Run

**Domain format:** `https://veil-RANDOMHASH-uc.a.run.app`
**WebSocket support:** Yes
**Free tier:** 2,000,000 requests/month + compute free tier
**Requires:** Docker, Google Cloud account, gcloud CLI

The `run.app` domain is owned by Google. No school running Google Workspace is going to block it. The random hash in the URL makes it impossible to pattern-block even if they wanted to.

### Setup

1. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install) and log in:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. Clone the repo locally:
   ```bash
   git clone https://github.com/Novaro1/unblocker
   cd unblocker
   ```

3. Deploy from the repo directory:
   ```bash
   gcloud run deploy veil \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 8080
   ```

4. The CLI prints your URL when done — something like `https://veil-abc123xy-uc.a.run.app`

### Why this is the hardest to block

The hash in the URL is unique to your deployment and unpredictable. Even if a filter tried to block `*.run.app` it would break Google's own developer tools and internal services, which no school admin wants to do.

---

## Notes

- **Independent deployments** (Railway, Render, Koyeb, HuggingFace, Cloud Run) are the most resilient — they're entirely separate Veil instances with their own servers and IPs, not just proxies in front of your EC2.
- **Edge proxies** (Cloudflare Workers, Cloudflare Pages, Deno Deploy, Netlify Edge Functions, val.town) are the fastest to spin up — new URL in under a minute.
- **HuggingFace Spaces and Google Cloud Run** are the most filter-resistant domains. Blocking them would break legitimate AI tools and Google developer services respectively.
- Do **not** use the raw server IP (`16.59.60.231`) in edge proxy options — it's in a Cloudflare-owned range. Use `veilub.mooo.com` as the upstream hostname instead.

---

## Quick Reference

| Platform | Domain | Type | WebSocket | Free |
|---|---|---|---|---|
| Cloudflare Workers | `*.workers.dev` | Edge proxy | ✅ | 100k req/day |
| Cloudflare Pages | `*.pages.dev` | Edge proxy | ✅ | Unlimited |
| Deno Deploy | `*.deno.dev` | Edge proxy | ✅ | 1M req/month |
| val.town | `username-name.val.run` | Edge proxy | ⚠️ | Yes |
| Netlify Edge | `*.netlify.app` | Edge proxy | ⚠️ | 3M req/month |
| Railway | `*.railway.app` | Full server | ✅ | $5 credit |
| Render | `*.onrender.com` | Full server | ✅ | Free (sleeps) |
| Koyeb | `*.koyeb.app` | Full server | ✅ | Always on |
| HuggingFace | `*.hf.space` | Full server | ✅ | Free |
| Google Cloud Run | `*-hash-*.run.app` | Full server | ✅ | 2M req/month |

- **Cloudflare Workers** is the most reliable option. The `workers.dev` domain is extremely unlikely to be blocked by school filters, and you can generate new Worker names instantly.
- **Deno Deploy** is a strong backup with a higher free request limit.
- **val.town** is a lesser-known domain which makes it harder to block by pattern, but WebSocket support is limited so the proxy transport may be unreliable.
- Do **not** use the raw server IP (`16.59.60.231`) in any of these — that IP is in a Cloudflare-owned range and will be rejected by Cloudflare Workers. Use `veilub.mooo.com` as the hostname in all cases.
