# tg-bot-on-vercel 🤖☁️

One-click deploy HQ for a **Telegram remote-control bot with an opencode brain**.
Deploy this Next.js app to Vercel (or Render/Netlify/self-hosted), set a few env vars,
hit **Provision** — and the app creates a sandboxed Linux machine, installs opencode +
the bot inside it, injects your Telegram token, and lets the agent use the sandbox as
its computer.

## Deploy (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Raunak-dev-18/tg-bot-on-vercel)

1. Clone/fork this repo (keep it **public** — sandboxes git-clone it).
2. Deploy to Vercel, adding these env vars (or set them later in Project → Settings → Environment Variables):
   - `TG_BOT_TOKEN` — from **@BotFather** (required — the only truly required secret)
   - `V0_API_KEY` — a [Vercel API token](https://vercel.com/account/tokens). Optional when hosted on Vercel itself (OIDC auth is automatic); required on Render/Netlify/self-hosted. Aliases: `VERCEL_TOKEN`.
   - Model keys: **none required**. Free `opencode/*` models work keyless (verified in a
     clean environment). Set `OPENCODE_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
     `GEMINI_API_KEY` only for paid/non-free models.
   - `TELEGRAM_ALLOWED_USERS` — your numeric ID (@userinfobot) or `@username`. Empty = open to anyone (don't).
   - Optional: `OPENCODE_MODEL` (default `opencode/muse-spark-1.3-contributor-free`), `SANDBOX_TIMEOUT_MIN` (default 40), `WITH_BROWSER=1` (slower setup), `SANDBOX_NAME`.
   - Outside Vercel only: `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` for token auth.
3. Open the deployed app → **🚀 Provision / Resume bot**. Setup takes a few minutes
   (opencode + npm installs inside the sandbox). Watch progress in *Setup log*.
4. Message your bot on Telegram. Check liveness anytime via the dashboard or
   `GET /api/status`.

## How it works

- `POST /api/provision` — creates (or reuses) a persistent Vercel Sandbox seeded from
  this repo (`@vercel/sandbox`: `runtime: node24`, git source), writes the bootstrap
  script, and launches it **detached** (responds immediately; setup continues inside).
- Bootstrap (`lib/setup-script.ts` → `bot-setup/bootstrap.sh` in sandbox): installs
  opencode, `npm install` + builds `bot/`, writes `bot/.env` with your secrets,
  optional Chromium + doc venv, then launches the supervisor (`bot/run.sh`).
- `GET /api/status` — sandbox meta + expiry, bot process check, setup/bot log tails,
  Telegram token validation. Doubles as a manual wake-up (auto-resumes).
- `POST /api/stop` — stops the session (filesystem persists via snapshots).
- `GET /api/keepalive` — wired to Vercel Cron every 10 min (`vercel.json`): resumes,
  extends the session toward the plan max, restarts the bot if dead.

The vendored bot in `bot/` is [tg-bot-oc-machine](https://github.com/Raunak-dev-18/tg-bot-oc-machine):
sessions, memory, cron, skills, browser MCP, media in/out — full docs in
`bot/usage.md`, setup guide in `bot/AGENTS.md`.

## Honest limits

- **Sandbox sessions expire**: 45 min max on Hobby, 5 h on Pro/Enterprise (default 40 min
  here). The filesystem persists; processes don't — that's what keepalive is for.
- **Not 24/7-in-one-box.** For true always-on, run the bot on a small VPS (see
  `bot/usage.md` “Staying up 24/7”). This HQ is best for burst/on-demand machines and
  scheduled wake-ups.
- **Render/Netlify**: possible via token auth (`V0_API_KEY` + team/project IDs), but
  their function timeouts make provisioning awkward — Vercel is the happy path, and
  OIDC there means no token at all.
- Secrets live only in deployment env + inside your sandbox's `bot/.env`. The UI only
  ever shows configured/not-configured, never values.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in
npm run dev                  # http://localhost:3000
```

Provisioning from localhost works if the token env vars are set (token auth path).
