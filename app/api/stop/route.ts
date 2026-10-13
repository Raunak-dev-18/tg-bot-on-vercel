import { NextResponse } from "next/server";
import { loadDeployEnv } from "@/lib/env";
import { getSandbox } from "@/lib/sandbox";

// POST /api/stop — stop the sandbox session (filesystem persists via snapshots).
export async function POST() {
  const env = loadDeployEnv();
  try {
    const sandbox = await getSandbox(env);
    await sandbox.stop();
    return NextResponse.json({ ok: true, sandbox: { name: env.sandboxName }, note: "Filesystem persisted — status/provision will resume it." });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Stop failed: ${(err as Error).message.slice(0, 300)}` },
      { status: 500 },
    );
  }
}
