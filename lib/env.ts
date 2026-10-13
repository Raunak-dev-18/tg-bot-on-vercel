// Environment for the deploy HQ. Secrets are read server-side only and are
// NEVER echoed to the client (the UI only learns booleans: configured or not).

export interface DeployEnv {
  sandboxToken?: string;
  teamId?: string;
  projectId?: string;
  tgBotToken?: string;
  allowedUsers?: string;
  opencodeApiKey?: string;
  anthropicKey?: string;
  openaiKey?: string;
  geminiKey?: string;
  model: string;
  sandboxName: string;
  timeoutMin: number;
  withBrowser: boolean;
}

export function loadDeployEnv(): DeployEnv {
  const timeoutMin = Math.max(
    5,
    Math.min(300, Number(process.env.SANDBOX_TIMEOUT_MIN ?? 40) || 40),
  );
  return {
    sandboxToken:
      process.env.V0_API_KEY || process.env.VERCEL_TOKEN || process.env.VERCEL_SANDBOX_TOKEN || undefined,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
    projectId: process.env.VERCEL_PROJECT_ID || undefined,
    tgBotToken: process.env.TG_BOT_TOKEN || undefined,
    allowedUsers: process.env.TELEGRAM_ALLOWED_USERS || undefined,
    opencodeApiKey: process.env.OPENCODE_API_KEY || undefined,
    anthropicKey: process.env.ANTHROPIC_API_KEY || undefined,
    openaiKey: process.env.OPENAI_API_KEY || undefined,
    geminiKey: process.env.GEMINI_API_KEY || undefined,
    model: process.env.OPENCODE_MODEL || "opencode/muse-spark-1.3-contributor-free",
    sandboxName: process.env.SANDBOX_NAME || "tg-bot-sandbox",
    timeoutMin,
    withBrowser: ["1", "true", "yes"].includes((process.env.WITH_BROWSER ?? "").toLowerCase()),
  };
}

/** Which optional (paid/non-free) model keys are present. Free opencode/* models need none. */
export function modelKeyStatus(env: DeployEnv): { label: string; ok: boolean }[] {
  return [
    { label: "OPENCODE_API_KEY (Zen gateway)", ok: !!env.opencodeApiKey },
    { label: "ANTHROPIC_API_KEY", ok: !!env.anthropicKey },
    { label: "OPENAI_API_KEY", ok: !!env.openaiKey },
    { label: "GEMINI_API_KEY", ok: !!env.geminiKey },
  ];
}

export function hasAnyModelKey(env: DeployEnv): boolean {
  return !!(env.opencodeApiKey || env.anthropicKey || env.openaiKey || env.geminiKey);
}
/** Public repo this HQ is deployed from — sandboxes git-clone it (must stay public). */
export function botRepoUrl(): string {
  return process.env.BOT_REPO_URL || "https://github.com/Raunak-dev-18/tg-bot-on-vercel.git";
}
