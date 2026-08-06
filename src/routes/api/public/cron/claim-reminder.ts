import { createFileRoute } from "@tanstack/react-router";

const WEB_APP_URL = process.env.URL || "https://doubloon-tap-earn-play-five.vercel.app";

async function sendClaimReminder(chatId: number | string, token: string) {
  const text = [
    "⏰ <b>Your Doubloons are waiting!</b>",
    "",
    "🎁 Your daily reward is ready to claim.",
    "Tap in now to grab it, keep your streak alive, and climb the leaderboard. 🚀",
  ].join("\n");

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "🎮 Claim now", web_app: { url: WEB_APP_URL } }]],
        },
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("[cron] claim reminder send failed:", error);
    return false;
  }
}

async function runClaimReminder() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return new Response("bot token missing", { status: 500 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Remind users whose daily reward is claimable again (never claimed or >20h ago).
  const cutoff = new Date(Date.now() - 20 * 3.6e6).toISOString();
  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("id, last_daily_claim")
    .or(`last_daily_claim.is.null,last_daily_claim.lt.${cutoff}`)
    .limit(1000);

  if (error) {
    console.error("[cron] failed to load users:", error);
    return new Response("query failed", { status: 500 });
  }

  let sent = 0;
  for (const user of users ?? []) {
    // Small delay to stay well under Telegram's rate limits.
    const ok = await sendClaimReminder(user.id, token);
    if (ok) sent += 1;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  return new Response(JSON.stringify({ ok: true, sent, candidates: users?.length ?? 0 }), {
    headers: { "content-type": "application/json" },
  });
}

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  // If no secret is configured, allow (Vercel Cron calls are internal).
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export const Route = createFileRoute("/api/public/cron/claim-reminder")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return new Response("unauthorized", { status: 401 });
        return runClaimReminder();
      },
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("unauthorized", { status: 401 });
        return runClaimReminder();
      },
    },
  },
});
