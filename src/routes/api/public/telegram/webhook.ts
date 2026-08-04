import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

function deriveSecret(token: string) {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}

function safeEq(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return new Response("bot token missing", { status: 500 });
        const expected = deriveSecret(token);
        const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!safeEq(provided, expected)) return new Response("unauthorized", { status: 401 });

        const update = await request.json().catch(() => null);
        const msg = update?.message ?? update?.edited_message;
        const text: string | undefined = msg?.text;
        const from = msg?.from;

        if (from?.id && typeof text === "string") {
          const isStart = text.trim().startsWith("/start");
          const parts = text.trim().split(/\s+/);
          const payload = isStart ? (parts[1] ?? "") : "";
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Register a pending referral if payload is ref_<id>
          if (payload.startsWith("ref_")) {
            const refId = Number(payload.slice(4));
            if (refId && refId !== from.id) {
              // Only insert if user doesn't yet exist
              const { data: exists } = await supabaseAdmin
                .from("users")
                .select("id")
                .eq("id", from.id)
                .maybeSingle();
              if (!exists) {
                await supabaseAdmin
                  .from("pending_referrals")
                  .upsert(
                    { referred_id: from.id, referrer_id: refId },
                    { onConflict: "referred_id" },
                  );
              }
            }
          }

          // Send welcome message via Bot API
          const chatId = msg.chat?.id ?? from.id;
          const webAppUrl =
            process.env.PUBLIC_APP_URL ?? "https://doubloon-tap-quest.lovable.app";
          const name = from.username ? `@${from.username}` : (from.first_name ?? "there");
          const welcome = [
            `👋 Hey, ${name}! Welcome to <b>DoubloonTap</b>!`,
            ``,
            `💰 Tap the coin, complete simple tasks, and watch your Doubloon balance grow.`,
            ``,
            `DoubloonTap is a fun rewards platform where you can earn DBL by tapping daily, completing quests, joining our community, and inviting friends. Stay active to maximise your rewards and climb the leaderboard.`,
            ``,
            `🎁 The more you participate, the more you earn!`,
            `Have friends, family, or teammates?`,
            `Invite them to join DoubloonTap and grow your rewards together.`,
            ``,
            `More friends. More rewards. More Doubloons. 🚀`,
          ].join("\n");
          const messagePayload: Record<string, unknown> = {
            chat_id: chatId,
            text: welcome,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🎮 Play DoubloonTap", web_app: { url: webAppUrl } }],
                [{ text: "💪🪙 Join community", url: "https://t.me/Doublooncommunity" }],
                [{ text: "📢 Announcements channel", url: "https://t.me/Doubloontap" }],
                [{ text: "🎁 Rewards channel", url: "https://t.me/Doubloonreward" }],
              ],
            },
          };

          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(messagePayload),
          }).catch(() => {});

        }


        return Response.json({ ok: true });
      },
    },
  },
});
