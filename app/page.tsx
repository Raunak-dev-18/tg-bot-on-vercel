"use client";

import { useCallback, useEffect, useState } from "react";
import "./globals.css";

interface StatusResponse {
  ok: boolean;
  error?: string;
  note?: string;
  env?: {
    tgBotToken: boolean;
    sandboxAuth: boolean | string;
    allowedUsers: boolean;
    model: string;
    modelKeys: { label: string; ok: boolean }[];
    hasModelKey: boolean;
    sandboxName: string;
    timeoutMin: number;
    withBrowser: boolean;
  };
  sandbox?: { name?: string; exists?: boolean; expiresAt?: string | null; expiresInSec?: number | null };
  bot?: { alive: boolean };
  logs?: { setup: string; bot: string };
  telegram?: { ok: boolean; username?: string; id?: number; error?: string };
}

const card: React.CSSProperties = {
  background: "#11151f",
  border: "1px solid #232b3d",
  borderRadius: 12,
  padding: 16,
};
const btn: React.CSSProperties = {
  background: "#7aa2f7",
  color: "#0b0e14",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontWeight: 700,
  cursor: "pointer",
  marginRight: 8,
};
const btnGhost: React.CSSProperties = {
  ...btn,
  background: "transparent",
  color: "#e6e9f0",
  border: "1px solid #39415a",
};
const pill = (ok: boolean): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  background: ok ? "#12351f" : "#3d1a1a",
  color: ok ? "#7dffa8" : "#ff9b9b",
  marginLeft: 8,
});

function fmtCountdown(sec?: number | null): string {
  if (sec === undefined || sec === null) return "—";
  if (sec <= 0) return "expired";
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m ${sec % 60}s`;
}

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      setStatus(await res.json());
    } catch (e) {
      setMessage(`Status failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(path: string, label: string) {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const body = await res.json();
      setMessage(body.ok ? `${label}: OK — ${body.next ?? body.note ?? "done"}` : `${label} failed: ${body.error}`);
    } catch (e) {
      setMessage(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      setTimeout(refresh, 2000);
    }
  }

  const env = status?.env;

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px 64px" }}>
      <h1 style={{ marginBottom: 4 }}>🤖 tg-bot-on-vercel</h1>
      <p style={{ color: "#9aa3b2", marginTop: 0 }}>
        Deploy HQ: provisions a sandboxed Telegram bot with an opencode brain, then keeps it alive.
      </p>

      <div style={{ margin: "20px 0" }}>
        <button style={btn} disabled={!!busy} onClick={() => act("/api/provision", "Provision")}>
          {busy === "Provision" ? "Working…" : "🚀 Provision / Resume bot"}
        </button>
        <button style={btnGhost} disabled={!!busy} onClick={() => act("/api/stop", "Stop")}>
          {busy === "Stop" ? "Working…" : "⏹ Stop sandbox"}
        </button>
        <button style={btnGhost} disabled={!!busy} onClick={() => { setLoading(true); refresh(); }}>
          ↻ Refresh
        </button>
      </div>

      {message && (
        <div style={{ ...card, borderColor: "#7aa2f7", marginBottom: 16 }}>{message}</div>
      )}

      {loading && !status ? (
        <div style={card}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 8px" }}>Environment</h3>
            <div>TG_BOT_TOKEN <span style={pill(!!env?.tgBotToken)}>{env?.tgBotToken ? "set" : "missing"}</span></div>
            <div style={{ marginTop: 6 }}>
              Extra model keys (optional — free models need none):{" "}
              {env?.modelKeys?.map((k) => (
                <span key={k.label} style={{ ...pill(k.ok), marginRight: 4 }}>
                  {k.ok ? "✓" : "✗"} {k.label}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 6, color: "#9aa3b2", fontSize: 13 }}>
              Model: <code>{env?.model}</code> · Allowed users: {env?.allowedUsers ? "set" : "open ⚠️"} ·
              Sandbox auth: {typeof env?.sandboxAuth === "string" ? env.sandboxAuth : env?.sandboxAuth ? "token" : "missing"} ·
              Browser: {env?.withBrowser ? "on" : "off"}
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: "0 0 8px" }}>Sandbox</h3>
            <div>
              <code>{status?.sandbox?.name ?? "—"}</code>
              <span style={pill(status?.sandbox?.expiresInSec !== undefined && status?.sandbox?.expiresInSec !== null)}>expires in {fmtCountdown(status?.sandbox?.expiresInSec)}</span>
            </div>
            <div style={{ marginTop: 6 }}>
              Bot process <span style={pill(!!status?.bot?.alive)}>{status?.bot?.alive ? "ALIVE" : "not running"}</span>
              Telegram token <span style={pill(!!status?.telegram?.ok)}>{status?.telegram?.ok ? `@${status.telegram.username}` : "invalid"}</span>
            </div>
            {status?.note && <div style={{ marginTop: 6, color: "#9aa3b2", fontSize: 13 }}>{status.note}</div>}
          </div>

          <div style={card}>
            <h3 style={{ margin: "0 0 8px" }}>Setup log</h3>
            <pre>{status?.logs?.setup ?? "—"}</pre>
            <h3 style={{ margin: "12px 0 8px" }}>Bot log (tail)</h3>
            <pre>{status?.logs?.bot ?? "—"}</pre>
          </div>

          <div style={card}>
            <h3 style={{ margin: "0 0 8px" }}>How it works</h3>
            <ol style={{ color: "#9aa3b2", fontSize: 14, lineHeight: 1.7, paddingLeft: 20 }}>
              <li>Provision creates a persistent Vercel Sandbox (max {env?.timeoutMin ?? 40} min/session) seeded from this repo.</li>
              <li>Inside: installs opencode + the bot, injects <code>TG_BOT_TOKEN</code> + model keys, starts the supervisor.</li>
              <li>The bot polls Telegram; opencode uses the sandbox as its computer.</li>
              <li><code>/api/keepalive</code> (Vercel Cron, 10 min) resumes + extends + restarts the bot as needed.</li>
            </ol>
            <p style={{ color: "#9aa3b2", fontSize: 13 }}>
              Honest limits: Hobby sandboxes cap at 45 min/session (Pro: 5h). Filesystem persists
              across sessions, but processes restart — keepalive covers that. For true 24/7, use a VPS.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
