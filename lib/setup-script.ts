// Generates the fire-and-forget bootstrap script that runs INSIDE the sandbox.
// It installs opencode, builds the vendored bot, injects secrets into bot/.env,
// and launches the supervisor. Progress goes to <repo>/bot-setup.log
// (persistent via snapshots — the status endpoint tails it).
// Secrets are interpolated server-side and never echoed.

export interface SetupOpts {
  tgBotToken: string;
  allowedUsers?: string;
  model: string;
  opencodeApiKey?: string;
  anthropicKey?: string;
  openaiKey?: string;
  geminiKey?: string;
  withBrowser: boolean;
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildSetupScript(opts: SetupOpts): string {
  const envLines = [
    `TELEGRAM_BOT_TOKEN=${shQuote(opts.tgBotToken)}`,
    `TELEGRAM_ALLOWED_USERS=${shQuote(opts.allowedUsers ?? "")}`,
    `OPENCODE_MODEL=${shQuote(opts.model)}`,
    `OPENCODE_AUTO_APPROVE=true`,
    `OPENCODE_AUTO_SERVE=true`,
    `HEALTH_PORT=0`,
    ...(opts.opencodeApiKey ? [`OPENCODE_API_KEY=${shQuote(opts.opencodeApiKey)}`] : []),
    ...(opts.anthropicKey ? [`ANTHROPIC_API_KEY=${shQuote(opts.anthropicKey)}`] : []),
    ...(opts.openaiKey ? [`OPENAI_API_KEY=${shQuote(opts.openaiKey)}`] : []),
    ...(opts.geminiKey ? [`GEMINI_API_KEY=${shQuote(opts.geminiKey)}`] : []),
  ];

  return `#!/usr/bin/env bash
set -u
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$REPO_DIR/bot-setup.log"
: > "$LOG"
log() { echo "[setup $(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
log "repo: $REPO_DIR"

if command -v opencode >/dev/null 2>&1; then
  log "opencode already present: $(opencode --version 2>/dev/null || echo ok)"
else
  log "installing opencode…"
  if npm i -g opencode-ai >>"$LOG" 2>&1 && command -v opencode >/dev/null 2>&1; then
    log "opencode installed: $(opencode --version 2>/dev/null || echo ok)"
  else
    log "npm install failed, trying install script…"
    curl -fsSL https://opencode.ai/install | bash >>"$LOG" 2>&1 || true
    export PATH="$HOME/.opencode/bin:$PATH"
  fi
fi
command -v opencode >/dev/null 2>&1 || { log "FATAL: opencode missing"; exit 1; }

log "installing bot deps…"
(cd "$REPO_DIR/bot" && npm install --no-audit --no-fund >>"$LOG" 2>&1) || { log "FATAL: bot npm install failed"; exit 1; }
log "building bot…"
(cd "$REPO_DIR/bot" && node ./build.mjs >>"$LOG" 2>&1) || { log "FATAL: bot build failed"; exit 1; }

log "writing bot/.env…"
{
${envLines.map((l) => `  echo ${shQuote(l)};`).join("\n")}
} > "$REPO_DIR/bot/.env"
chmod 600 "$REPO_DIR/bot/.env"
log "wrote .env ($(wc -c < "$REPO_DIR/bot/.env") bytes, secrets redacted here)"

mkdir -p "$REPO_DIR/work" "$REPO_DIR/bot/data"
{
  echo "WORK_DIR=$REPO_DIR/work";
  echo "DATA_DIR=$REPO_DIR/bot/data";
} >> "$REPO_DIR/bot/.env"

if [ "${opts.withBrowser ? "1" : "0"}" = "1" ]; then
  log "installing chromium (WITH_BROWSER=1, slow first time)…"
  if (cd "$REPO_DIR/bot" && npx -y playwright@latest install chromium --with-deps >>"$LOG" 2>&1); then
    export CHROMIUM_PATH="$(cd "$REPO_DIR/bot" && node -e "console.log(require('playwright-core').chromium.executablePath())" 2>/dev/null || true)"
    [ -n "$CHROMIUM_PATH" ] && echo "CHROMIUM_PATH=$CHROMIUM_PATH" >> "$REPO_DIR/bot/.env" && log "chromium ready"
  else
    log "WARN: chromium install failed — bot runs without browser MCP"
  fi
fi

if command -v python3 >/dev/null 2>&1; then
  if [ ! -x "$REPO_DIR/bot/data/.agent-venv/bin/python" ]; then
    log "creating doc venv…"
    python3 -m venv "$REPO_DIR/bot/data/.agent-venv" >>"$LOG" 2>&1 && \\
      "$REPO_DIR/bot/data/.agent-venv/bin/pip" install -q python-pptx openpyxl pillow >>"$LOG" 2>&1 \\
      && log "doc venv ready" || log "WARN: doc venv failed — agent will retry later"
  fi
else
  log "WARN: no python3 — skipping doc venv"
fi

log "launching bot supervisor…"
(cd "$REPO_DIR/bot" && rm -f STOP && setsid ./run.sh >>"$REPO_DIR/bot.log" 2>&1 < /dev/null &)
sleep 8
if pgrep -f "tg-control-bot/dist/index.mjs" >/dev/null 2>&1 || pgrep -f "dist/index.mjs" >/dev/null 2>&1; then
  log "SUCCESS: bot process alive — message it on Telegram"
else
  log "WARN: bot process not seen yet — check bot/data/../bot.log; run.sh retries automatically"
fi
log "setup script done"
`;
}
