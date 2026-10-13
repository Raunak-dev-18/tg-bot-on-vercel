// Vercel Sandbox client for the bot HQ.
// Auth: Vercel OIDC (automatic when hosted on Vercel) with explicit-token
// fallback (V0_API_KEY) for Render/Netlify/self-hosted deployments.
import { Sandbox } from "@vercel/sandbox";
import type { DeployEnv } from "./env";

export interface SandboxAuth {
  teamId?: string;
  projectId?: string;
  token?: string;
}

export function sandboxAuth(env: DeployEnv): SandboxAuth | undefined {
  if (!env.sandboxToken) return undefined; // OIDC default
  const auth: SandboxAuth = { token: env.sandboxToken };
  if (env.teamId) auth.teamId = env.teamId;
  if (env.projectId) auth.projectId = env.projectId;
  return auth;
}

export function sandboxTimeoutMs(env: DeployEnv): number {
  return env.timeoutMin * 60 * 1000;
}

/** Get the named sandbox (auto-resumes a stopped one on next command). */
export async function getSandbox(env: DeployEnv): Promise<Sandbox> {
  const auth = sandboxAuth(env);
  return Sandbox.get({ name: env.sandboxName, ...(auth ?? {}) });
}

export interface ProvisionPlan {
  name: string;
  timeoutMs: number;
  runtime: "node24";
  source: { type: "git"; url: string };
}

/** Create a fresh sandbox session seeded from this repo (public clone). */
export async function createSandbox(env: DeployEnv, repoUrl: string) {
  const auth = sandboxAuth(env);
  return Sandbox.create({
    name: env.sandboxName,
    runtime: "node24",
    source: { type: "git", url: repoUrl },
    timeout: sandboxTimeoutMs(env),
    ...(auth ?? {}),
  });
}

export async function runIn(
  sandbox: Sandbox,
  cmd: string,
  args: string[],
  opts?: { cwd?: string; sudo?: boolean; timeoutMs?: number; env?: Record<string, string> },
): Promise<{ exitCode: number; out: string; err: string }> {
  const result = await sandbox.runCommand({
    cmd,
    args,
    ...(opts?.cwd ? { cwd: opts.cwd } : {}),
    ...(opts?.sudo !== undefined ? { sudo: opts.sudo } : {}),
    ...(opts?.env ? { env: opts.env } : {}),
    ...(opts?.timeoutMs ? { timeout: opts.timeoutMs } : {}),
  });
  const [out, err] = await Promise.all([result.stdout(), result.stderr()]);
  return { exitCode: result.exitCode, out: out.slice(-4000), err: err.slice(-2000) };
}

export async function readSandboxFile(sandbox: Sandbox, filePath: string): Promise<string | undefined> {
  try {
    const data = await sandbox.fs.readFile(filePath);
    return Buffer.from(data).toString("utf8").slice(-6000);
  } catch {
    return undefined;
  }
}
