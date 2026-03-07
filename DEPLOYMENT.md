# Veil — Alternative Entry Point Deployment

Each option below acts as a **full reverse proxy** — all traffic is forwarded transparently to the Veil backend. The user's browser never sees the origin server, and the service worker, games, settings, and proxy all work normally.

> **Two repos:**
> - **`Novaro1/veil-edge`** — Cloudflare Pages, Netlify Edge Functions (minimal, no Node.js files)
> - **`Novaro1/unblocker`** — Railway, Render, Koyeb, HuggingFace, Google Cloud Run, GitHub Codespaces, GitPod, Azure Container Apps, IBM Code Engine, Replit, Fly.io (full server)

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

6. Copy the Veil repo files into it (using `git archive` to skip the `.git` folder):
   ```bash
   git clone https://github.com/Novaro1/unblocker /tmp/unblocker
   git -C /tmp/unblocker archive HEAD | tar -x -C .
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
**Requires:** A Google account (free). No credit card needed for the free tier.

The `run.app` domain is owned by Google. No school running Google Workspace is going to block it. The random hash in the URL makes it impossible to pattern-block even if they wanted to.

### Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with any Google account
2. Click the project dropdown at the top → **New Project**
3. Name it anything (e.g. `veil`) and click **Create**
4. Copy your **Project ID** — it's shown under the project name and looks like `veil-123456`. You'll need it in a moment.

### Step 2 — Install the gcloud CLI

**Mac:**
```bash
brew install google-cloud-sdk
```
If you don't have Homebrew: go to [brew.sh](https://brew.sh) and run the one-liner at the top first, then run the command above.

**Windows:**
Download and run the installer from [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install) → Windows section. It's a normal `.exe` installer. After it finishes, open a new terminal (Command Prompt or PowerShell).

**Linux:**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### Step 3 — Log in and set your project

Run these one at a time:
```bash
gcloud auth login
```
A browser window will open — sign in with your Google account and click Allow.

```bash
gcloud config set project YOUR_PROJECT_ID
```
Replace `YOUR_PROJECT_ID` with the ID you copied in Step 1 (e.g. `veil-123456`).

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```
This enables Cloud Run and the build service. Takes about 30 seconds.

### Step 4 — Clone Veil and deploy

```bash
git clone https://github.com/Novaro1/unblocker
```
```bash
cd unblocker
```
```bash
gcloud run deploy veil --source . --platform managed --region us-central1 --allow-unauthenticated --port 8080
```

When it asks **"Do you want to enable the Artifact Registry API?"** — type `y` and press Enter.

When it asks **"Allow unauthenticated invocations?"** — type `y` and press Enter.

The deploy takes about 2–3 minutes. When it finishes the CLI prints your URL:
```
Service URL: https://veil-abc123xy-uc.a.run.app
```

That's your link. It works immediately.

### Spinning up more links

To get a second URL with a completely different hash, just change the service name:
```bash
gcloud run deploy veil2 --source . --platform managed --region us-central1 --allow-unauthenticated --port 8080
```

Each service name gets its own unique URL.

### Why this is the hardest to block

The hash in the URL is unique to your deployment and unpredictable. Even if a filter tried to block `*.run.app` it would break Google's own developer tools and internal services, which no school admin wants to do.

---

## GitHub Codespaces (port forwarding)

**Domain format:** `https://CODESPACE-8080.app.github.dev`
**WebSocket support:** Yes
**Free tier:** 60 core-hours/month (no credit card required)
**Requires:** GitHub account

`github.dev` is GitHub's own domain. Any school that uses GitHub for class projects cannot block it. The URL contains a random Codespace name making it impossible to pattern-block. This is the best no-card option after Cloudflare Workers.

### Setup

1. Go to [github.com/Novaro1/unblocker](https://github.com/Novaro1/unblocker)
2. Click the green **Code** button → **Codespaces** tab → **Create codespace on main**
3. Wait ~1 minute for the Codespace to load (it opens in a browser VS Code editor)
4. In the terminal at the bottom, run:
   ```bash
   npm install
   node src/index.js
   ```
5. A notification will pop up saying "Your application running on port 8080 is available". Click **Make Public**
6. Go to the **Ports** tab (next to Terminal) — right-click port 8080 → **Port Visibility → Public**
7. Copy the **Forwarded Address** — it looks like `https://fuzzy-rotary-phone-8080.app.github.dev`

That's your link. It works as long as the Codespace is running.

### Keeping it alive

The Codespace sleeps after 30 minutes of no browser activity. To wake it back up, just go to [github.com/codespaces](https://github.com/codespaces) and click **Resume**. The URL stays the same after resuming.

### Why this is hard to block

Blocking `*.app.github.dev` would break GitHub Codespaces for every developer and student using GitHub. No school IT department is going to do that.

---

## Azure Container Apps

**Domain format:** `https://veil.RANDOMHASH.eastus.azurecontainerapps.io`
**WebSocket support:** Yes
**Free tier:** 180,000 vCPU-seconds/month (enough for ~2 requests/second 24/7)
**Requires:** Azure account + credit card (not charged under free tier)

`azurecontainerapps.io` is a Microsoft domain. Any school running Microsoft 365, Teams, or Azure AD — which is the majority of US schools — will **never** block a Microsoft domain. The random hash in the URL makes it unblockable by pattern even if they tried.

### Step 1 — Create an Azure account

Go to [azure.microsoft.com](https://azure.microsoft.com) → **Start free**. Sign in with any Microsoft account. They require a credit card but give $200 in free credits for 30 days plus always-free services after that.

### Step 2 — Install the Azure CLI

**Mac:**
```bash
brew install azure-cli
```

**Windows:** Download the installer from [aka.ms/installazurecliwindows](https://aka.ms/installazurecliwindows)

### Step 3 — Log in and deploy

Run these one at a time in Terminal:

```bash
az login
```
A browser window opens — sign in with your Microsoft account.

```bash
az group create --name veil-rg --location eastus
```

```bash
az containerapp up \
  --name veil \
  --resource-group veil-rg \
  --location eastus \
  --source https://github.com/Novaro1/unblocker \
  --ingress external \
  --target-port 8080
```

This pulls the repo, builds it, and deploys it. Takes 3–5 minutes. When done it prints:

```
Your container app veil is available at: https://veil.RANDOMHASH.eastus.azurecontainerapps.io
```

### Spinning up more links

Change `--name veil` to `--name veil2`, `--name veil3`, etc. Each gets a new random hash in the URL.

### Why this is nearly impossible to block

Microsoft's `azurecontainerapps.io` is the same domain used by Microsoft's own enterprise services. Blocking it would break Azure DevOps, Microsoft's developer tools, and potentially Teams integrations at schools that use Microsoft 365.

---

## IBM Code Engine

**Domain format:** `https://veil.RANDOMHASH.us-south.codeengine.appdomain.cloud`
**WebSocket support:** Yes
**Free tier:** 50 vCPU-seconds + 100 GB-seconds per month
**Requires:** IBM Cloud account (credit card required but has a free tier)

`codeengine.appdomain.cloud` is IBM's serverless container domain. It's extremely obscure — no school filter has ever thought to block it. IBM is known as an enterprise company so their domains are universally trusted.

### Setup

1. Go to [cloud.ibm.com](https://cloud.ibm.com) → create a free account
2. Search for **Code Engine** in the catalog and open it
3. Click **Create project** → name it `veil` → **Create**
4. Inside the project, click **Applications → Create**
5. Under **Code**, select **Source code** and enter:
   ```
   https://github.com/Novaro1/unblocker
   ```
6. Set **Listen port** to `8080`
7. Click **Create** — IBM builds and deploys automatically (~3 minutes)

Your URL is shown on the application page once it deploys. It looks like:
```
https://veil.abc123def.us-south.codeengine.appdomain.cloud
```

### Note on free tier limits

The free tier is low (50 vCPU-seconds/month) but Code Engine scales to zero when not in use and only consumes credits when actively handling requests. Light usage (a few dozen users) should stay within free limits.

---

## Replit

**Domain format:** `https://veil.yourusername.repl.co` or `https://veilname.replit.app`
**WebSocket support:** Yes
**Free tier:** Free with limits (reserved VM keeps it always on)
**Requires:** Replit account (no credit card)

Replit is a browser-based coding platform used in thousands of classrooms. Many school network filters explicitly whitelist `replit.com` and `replit.app` because teachers assign coding projects there. A proxy running on `replit.app` looks indistinguishable from a student's coding assignment.

### Setup

1. Go to [replit.com](https://replit.com) and create a free account
2. Click **+ Create Repl**
3. In the template search, type **Node.js** and select it
4. Name it anything (e.g. `veil`)
5. In the Shell tab at the bottom, run:
   ```bash
   git clone https://github.com/Novaro1/unblocker .
   npm install
   ```
6. Open the `.replit` file (create it if it doesn't exist) and set:
   ```
   run = "node src/index.js"
   ```
   Or just click the **Run** button and when prompted for a run command enter `node src/index.js`
7. Click **Run** — Replit starts the server and shows a preview URL at the top

Your URL looks like `https://veil.yourusername.repl.co`. Click **Open in new tab** to get the full link.

### Keeping it alive

Free Repls sleep after inactivity. To keep it always on, enable **Reserved VM** in the Repl's settings (requires Replit Core subscription ~$7/month), or use a free uptime monitor like UptimeRobot to ping it every 5 minutes.

### Why this works at schools

Teachers assign Replit projects. School filters have `replit.app` and `repl.co` on their allowlist in many districts. A URL like `https://veil.yourusername.repl.co` is completely indistinguishable from a student's coding homework.

---

## Fly.io

**Domain format:** `https://veil.fly.dev`
**WebSocket support:** Yes (full)
**Free tier:** 3 shared-CPU VMs + 160GB outbound/month (credit card required)
**Requires:** Fly.io account + flyctl CLI

`fly.dev` is Fly.io's domain — an infrastructure platform used by developers and startups. Fly deploys Docker containers to edge locations around the world. The `fly.dev` domain sounds like a developer resource and has no association with proxies in any blocklist.

### Step 1 — Install flyctl

**Mac:**
```bash
brew install flyctl
```

**Windows (PowerShell):**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

### Step 2 — Sign up and log in

```bash
fly auth signup
```
This opens a browser to create an account. A credit card is required but you won't be charged on the free tier.

### Step 3 — Deploy Veil

```bash
git clone https://github.com/Novaro1/unblocker
cd unblocker
fly launch
```

`fly launch` detects the `Dockerfile` automatically. When it asks:
- **App name:** type `veil` (or anything)
- **Region:** pick the closest one to you
- **Would you like to set up a PostgreSQL database?** → `N`
- **Would you like to deploy now?** → `Y`

After ~2 minutes it prints:
```
Visit your newly deployed app at https://veil.fly.dev
```

### Spinning up more links

```bash
fly launch --name veil2
```
Each app name gets its own `*.fly.dev` subdomain.

### Why this is hard to block

`fly.dev` is a developer tool domain. Blocking it would break access to developer documentation and tools hosted on Fly. The subdomain is your chosen app name — you can pick anything innocuous.

---

## GitPod

**Domain format:** `https://8080-USERNAME-REPO-HASH.ws-us00.gitpod.io`
**WebSocket support:** Yes
**Free tier:** 50 hours/month (no credit card required)
**Requires:** GitHub account

GitPod is an online development environment used in open source projects and coding education. The `gitpod.io` domain is trusted in any developer-friendly environment. Like GitHub Codespaces, you run Veil inside a workspace and forward the port publicly.

### Setup

1. Go to [gitpod.io](https://gitpod.io) and sign in with GitHub
2. Click **New Workspace**
3. Paste this URL and press Enter:
   ```
   https://github.com/Novaro1/unblocker
   ```
4. Wait ~1 minute for the workspace to load
5. In the terminal that opens, run:
   ```bash
   npm install
   node src/index.js
   ```
6. GitPod detects port 8080 and shows a notification — click **Make Public**
7. Click the **Open Browser** button or go to the **Ports** panel → copy the URL next to port 8080

Your URL looks like `https://8080-yourusername-unblocker-abc123.ws-us00.gitpod.io`.

### Keeping it alive

GitPod workspaces stop after 30 minutes of inactivity. Go to [gitpod.io/workspaces](https://gitpod.io/workspaces) and click your workspace to resume it — the port URL stays the same.

---

## Notes

- **Independent deployments** (Railway, Render, Koyeb, HuggingFace, Cloud Run, Azure Container Apps, IBM Code Engine, Fly.io, Replit) are the most resilient — they're entirely separate Veil instances with their own servers and IPs, not just proxies in front of your EC2.
- **Edge proxies** (Cloudflare Workers, Cloudflare Pages, Deno Deploy, Netlify Edge Functions, val.town) are the fastest to spin up — new URL in under a minute.
- **GitHub Codespaces and GitPod** are the best no-credit-card options — `github.dev` and `gitpod.io` are both trusted in any school that uses GitHub.
- **Replit** is uniquely powerful because many school filters explicitly allow it for coding class.
- **Azure Container Apps and Google Cloud Run** have the most filter-resistant enterprise domains.
- Do **not** use the raw server IP (`16.59.60.231`) in edge proxy options — it's in a Cloudflare-owned range. Use `veilub.mooo.com` as the upstream hostname instead.

- **Independent deployments** (Railway, Render, Koyeb, HuggingFace, Cloud Run, Azure Container Apps, IBM Code Engine) are the most resilient — they're entirely separate Veil instances with their own servers and IPs, not just proxies in front of your EC2.
- **Edge proxies** (Cloudflare Workers, Cloudflare Pages, Deno Deploy, Netlify Edge Functions, val.town) are the fastest to spin up — new URL in under a minute.
- **GitHub Codespaces** is the best no-credit-card option for a real server URL — `github.dev` cannot be blocked at any school that uses GitHub.
- **Azure Container Apps and Google Cloud Run** have the most filter-resistant domains. Blocking Microsoft or Google domains at a school would break core services.
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
| GitHub Codespaces | `*-8080.app.github.dev` | Full server | ✅ | 60 core-hr/mo |
| GitPod | `8080-*-*.gitpod.io` | Full server | ✅ | 50 hr/month |
| Azure Container Apps | `*.azurecontainerapps.io` | Full server | ✅ | Free allowance |
| IBM Code Engine | `*.codeengine.appdomain.cloud` | Full server | ✅ | Free allowance |
| Replit | `*.replit.app` | Full server | ✅ | Free (sleeps) |
| Fly.io | `*.fly.dev` | Full server | ✅ | Free allowance |

- **Cloudflare Workers** is the fastest to spin up. New URL in under a minute, no card needed.
- **Replit** is uniquely powerful — many school filters explicitly whitelist it for coding class.
- **GitHub Codespaces / GitPod** are the best no-card options. Both domains are trusted at schools that use GitHub.
- **Azure Container Apps** has the best enterprise domain — Microsoft's domain is trusted everywhere.
- **val.town** WebSocket support is limited so the proxy transport may be unreliable.
- Do **not** use the raw server IP (`16.59.60.231`) in any edge proxy — use `veilub.mooo.com` instead.
