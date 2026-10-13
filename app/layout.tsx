import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "tg-bot-on-vercel — bot deploy HQ",
  description: "Provision a sandboxed Telegram + opencode remote-control bot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
