import { NextResponse } from "next/server";
import { hasAnyModelKey, loadDeployEnv, modelKeyStatus } from "@/lib/env";
import { getSandbox, readSandboxFile, runIn } from "@/lib/sandbox";

// GET /api/status — sandbox meta, bot liveness, setup/bot log tails, token check.
// (Calling this auto-resumes a stopped sandbox — that is intentional: status doubles
// as a manual wake-up. The /api/keepalive cron does this on a schedule.)
export async function GET() {
  const env = loadDeployEnv();
  const base = {
    env: {
      tgBotToken: !!env.tgBotToken,
      sandboxAuth: !!env.sandboxToken || "oidc (Vercel hosting)",
      allowedUsers: !!env.allowedUsers,
      model: env.model,
      modelKeys: modelKeyStatus(env),
      hasModelKey: hasAnyModelKey(env),
      sandboxName: env.sandboxName,
      timeoutMin: env.timeoutMin,
      withBrowser: env.withBrowser,
    },
  };

  if (!env.tgBotToken) {
    return NextResponse.json({ ...base, ok: false, error: "TG_BOT_TOKEN not set." });
  }

  try {
    const sandbox = await getSandbox(env);
    const meta: Record<string, unknown> = { name: env.sandboxName };
    try {
      meta.timeoutMs = sandbox.timeout;
    } catch { /* ignore */ }
    try {
      const exp = sandbox.expiresAt;
      meta.expiresAt = exp ? exp.toISOString() : null;
      meta.expiresInSec = exp ? Math.max(0, Math.round((exp.getTime() - Date.now()) / 1000)) : null;
    } catch { /* ignore */ }

    const bot = await runIn(sandbox, "pgrep", ["-f", "tg-control-bot/dist/index.mjs"], { timeoutMs: 20000 });
    const botAlive = bot.exitCode === 0;

    const [setupLog, botLog] = await Promise.all([
      readSandboxFile(sandbox, "bot-setup.log"),
      readSandboxFile(sandbox, "bot.log"),
    ]);

    let telegram: Record<string, unknown> = { ok: false };
    try {
      const res = await fetch(`https://api.telegram.org/bot${env.tgBotToken}/getMe`, { signal: AbortSignal.timeout(15000) });
      const body = (await res.json()) as { ok: boolean; result?: { username?: string; id?: number } };
      telegram = body.ok
        ? { ok: true, username: body.result?.username, id: body.result?.id }
        : { ok: false, error: "getMe rejected the token" };
    } catch {
      telegram = { ok: false, error: "could not reach Telegram API" };
    }

    return NextResponse.json({
      ...base,
      ok: true,
      sandbox: meta,
      bot: { alive: botAlive },
      logs: { setup: setupLog ?? "(no setup log yet)", bot: (botLog ?? "(no bot log yet)").slice(-2000) },
      telegram,
    });
  } catch (err) {
    return NextResponse.json({
      ...base,
      ok: true,
      sandbox: { name: env.sandboxName, exists: false },
      bot: { alive: false },
      logs: { setup: "(sandbox not provisioned yet)", bot: "" },
      telegram: { ok: false, error: "unchecked" },
      note: `No sandbox yet (${(err as Error).message.slice(0, 200)}). POST /api/provision to create one.`,
    });
  }
}
