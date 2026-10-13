import { NextResponse } from "next/server";
import { botRepoUrl, hasAnyModelKey, loadDeployEnv, modelKeyStatus } from "@/lib/env";
import { createSandbox, getSandbox, sandboxTimeoutMs } from "@/lib/sandbox";
import { buildSetupScript } from "@/lib/setup-script";

// POST /api/provision — create (or reuse) the sandbox and fire the bootstrap.
// Responds fast: the heavy setup runs detached inside the sandbox.
// Poll GET /api/status for progress.
export async function POST() {
  const env = loadDeployEnv();
  if (!env.tgBotToken) {
    return NextResponse.json(
      { ok: false, error: "TG_BOT_TOKEN is not set where this app is deployed." },
      { status: 400 },
    );
  }

  const warnings: string[] = [];
  if (!hasAnyModelKey(env)) {
    warnings.push(
      "No model key set (OPENCODE_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY). " +
        "Setup continues — anonymous free models sometimes work — but set one if the brain stays silent.",
    );
  }
  if (!env.sandboxToken) {
    warnings.push(
      "No V0_API_KEY/VERCEL_TOKEN — relying on Vercel OIDC auth. " +
        "If this app is NOT hosted on Vercel, set a Vercel API token or provisioning will fail.",
    );
  }

  const repoUrl = botRepoUrl();
  try {
    // Reuse an existing sandbox if present (resume happens on next command).
    try {
      const existing = await getSandbox(env);
      return NextResponse.json({
        ok: true,
        reused: true,
        sandbox: { name: env.sandboxName },
        warnings,
        next: "Poll GET /api/status for setup progress.",
      });
    } catch {
      // No existing sandbox — create one below.
    }

    const sandbox = await createSandbox(env, repoUrl);

    const script = buildSetupScript({
      tgBotToken: env.tgBotToken,
      allowedUsers: env.allowedUsers,
      model: env.model,
      opencodeApiKey: env.opencodeApiKey,
      anthropicKey: env.anthropicKey,
      openaiKey: env.openaiKey,
      geminiKey: env.geminiKey,
      withBrowser: env.withBrowser,
    });
    await sandbox.writeFiles([{ path: "bot-setup/bootstrap.sh", content: Buffer.from(script) }]);
    await sandbox.runCommand({ cmd: "bash", args: ["bot-setup/bootstrap.sh"], detached: true });

    return NextResponse.json({
      ok: true,
      reused: false,
      sandbox: { name: env.sandboxName },
      timeoutMin: env.timeoutMin,
      timeoutMs: sandboxTimeoutMs(env),
      warnings,
      modelKeys: modelKeyStatus(env).filter((k) => k.ok).map((k) => k.label),
      next: "Poll GET /api/status — setup takes a few minutes (npm installs).",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Provision failed: ${(err as Error).message.slice(0, 500)}` },
      { status: 500 },
    );
  }
}
