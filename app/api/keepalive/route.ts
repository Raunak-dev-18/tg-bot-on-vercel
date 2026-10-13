import { NextResponse } from "next/server";
import { loadDeployEnv } from "@/lib/env";
import { getSandbox, runIn, sandboxTimeoutMs } from "@/lib/sandbox";

// GET /api/keepalive — designed for Vercel Cron (see vercel.json, every 10 min).
// Resumes a stopped sandbox, extends its session toward the plan max, and
// restarts the bot inside if it died. Idempotent — safe to call any time.
export async function GET() {
  const env = loadDeployEnv();
  if (!env.tgBotToken) {
    return NextResponse.json({ ok: false, error: "TG_BOT_TOKEN not set." }, { status: 400 });
  }
  const actions: string[] = [];
  try {
    const sandbox = await getSandbox(env);

    // Touch the session (auto-resumes if stopped).
    await runIn(sandbox, "echo", ["awake"], { timeoutMs: 30000 });
    actions.push("session ensured");

    // Push the expiry deadline out (capped by plan max server-side).
    try {
      await sandbox.extendTimeout(sandboxTimeoutMs(env));
      actions.push(`timeout extended +${env.timeoutMin}m`);
    } catch (err) {
      actions.push(`extend skipped (${(err as Error).message.slice(0, 120)}) — stopping for a fresh session next tick`);
      try {
        await sandbox.stop();
      } catch { /* ignore */ }
      return NextResponse.json({ ok: true, actions, note: "At plan max — stopped; next tick resumes fresh." });
    }

    // Bot alive? If not, relaunch the supervisor (run.sh self-heals from there).
    const bot = await runIn(sandbox, "pgrep", ["-f", "tg-control-bot/dist/index.mjs"], { timeoutMs: 20000 });
    if (bot.exitCode !== 0) {
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          'ROOT=$(dirname "$(dirname "$(find / -maxdepth 6 -path "*/bot-setup/bootstrap.sh" 2>/dev/null | head -1)")"); cd "$ROOT/bot" && rm -f STOP && setsid ./run.sh >>../bot.log 2>&1 < /dev/null &',
        ],
        detached: true,
      });
      actions.push("bot was dead — relaunch issued");
    } else {
      actions.push("bot alive");
    }

    let expiresInSec: number | null = null;
    try {
      const exp = sandbox.expiresAt;
      expiresInSec = exp ? Math.max(0, Math.round((exp.getTime() - Date.now()) / 1000)) : null;
    } catch { /* ignore */ }
    return NextResponse.json({ ok: true, actions, expiresInSec });
  } catch (err) {
    return NextResponse.json(
      { ok: false, actions, error: `Keepalive failed: ${(err as Error).message.slice(0, 300)}` },
      { status: 500 },
    );
  }
}
