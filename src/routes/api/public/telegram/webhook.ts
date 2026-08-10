import { createFileRoute } from "@tanstack/react-router";

// Single source of truth for the mini app URL used by every bot button.
const MINI_APP_URL = process.env.URL ?? "https://doubloon-tap-earn-play.vercel.app";

interface InlineKeyboardButton {
  text: string;
  url?: string;
  web_app?: { url: string };
  callback_data?: string;
}

interface ReplyMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

async function sendMessage(chatId: number | string, text: string, replyMarkup?: ReplyMarkup) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...(replyMarkup && { reply_markup: replyMarkup }),
      }),
    });
    if (!response.ok) console.error("[telegram] sendMessage failed:", await response.json());
  } catch (error) {
    console.error("[telegram] sendMessage error:", error);
  }
}

async function sendPhoto(
  chatId: number | string,
  photoUrl: string,
  caption: string,
  replyMarkup?: ReplyMarkup,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
        ...(replyMarkup && { reply_markup: replyMarkup }),
      }),
    });
    if (!response.ok) console.error("[telegram] sendPhoto failed:", await response.json());
  } catch (error) {
    console.error("[telegram] sendPhoto error:", error);
  }
}

// Sets the bot's built-in menu button (next to the message box) to open the mini app.
async function setChatMenuButton(chatId: number | string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        menu_button: {
          type: "web_app",
          text: "🎮 Play",
          web_app: { url: MINI_APP_URL },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("[telegram] setChatMenuButton failed:", error);
    }
  } catch (error) {
    console.error("[telegram] Error setting menu button:", error);
  }
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return new Response("bot token missing", { status: 500 });

        const update = await request.json().catch(() => null);
        const msg = update?.message ?? update?.edited_message;
        const text: string | undefined = msg?.text;
        const from = msg?.from;

        if (from?.id && typeof text === "string") {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const chatId = msg.chat?.id ?? from.id;
          const webAppUrl = MINI_APP_URL;
          const name = escapeHtml(from.first_name ?? from.username ?? "there");

          const command = text.trim().split(/\s+/)[0].toLowerCase();

          // Keep the built-in menu button pointed at the current mini app URL.
          if (command === "/start") {
            await setChatMenuButton(chatId);
          }

          // Handle /start with referral payload
          if (command === "/start") {
            const parts = text.trim().split(/\s+/);
            const payload = parts[1] ?? "";
            if (payload.startsWith("ref_")) {
              const refId = Number(payload.slice(4));
              if (refId && refId !== from.id) {
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

            const buttons: InlineKeyboardButton[][] = [
              [{ text: "🎮 Play DoubloonTap", web_app: { url: webAppUrl } }],
              [{ text: "💬 Doubloon Reward", url: "https://t.me/Doubloonreward" }],
              [{ text: "📢 Doubloon Tap Channel", url: "https://t.me/Doubloontap" }],
              [{ text: "👥 Doubloon Community", url: "https://t.me/Doublooncommunity" }],
            ];

            const photoUrl = `${webAppUrl}/photo_6039616495660240599_x.jpg`;
            await sendPhoto(chatId, photoUrl, welcome, { inline_keyboard: buttons });
          }

          // Handle /help
          if (command === "/help") {
            const help = [
              `<b>📖 DoubloonTap Commands</b>`,
              ``,
              `<b>Game Commands:</b>`,
              `/start - Start the game`,
              `/profile - View your stats`,
              `/tap - Tap to earn DBL`,
              `/tasks - View available tasks`,
              `/leaderboard - Top 10 players`,
              ``,
              `<b>App Commands:</b>`,
              `/help - Show this help message`,
              ``,
              `Tap the button below to play the full game!`,
            ].join("\n");

            await sendMessage(chatId, help, {
              inline_keyboard: [[{ text: "🎮 Play DoubloonTap", web_app: { url: webAppUrl } }]],
            });
          }

          // Handle /profile
          if (command === "/profile") {
            const { data: user } = await supabaseAdmin
              .from("users")
              .select("*")
              .eq("id", from.id)
              .maybeSingle();

            if (!user) {
              await sendMessage(
                chatId,
                `<b>👤 Profile</b>\n\nNo account yet. Send /start to create one!`,
              );
            } else {
              const { count: referralCount } = await supabaseAdmin
                .from("referrals")
                .select("*", { count: "exact", head: true })
                .eq("referrer_id", from.id);

              const profile = [
                `<b>👤 Your Profile</b>`,
                ``,
                `<b>Username:</b> ${name}`,
                `<b>Balance:</b> ${user.balance?.toLocaleString() || "0"} DBL`,
                `<b>Level:</b> ${user.level || 1}`,
                `<b>Total Taps:</b> ${user.total_taps?.toLocaleString() || "0"}`,
                `<b>Friends Invited:</b> ${referralCount ?? 0}`,
                ``,
                `Continue tapping to earn more DBL! 🚀`,
              ].join("\n");

              await sendMessage(chatId, profile, {
                inline_keyboard: [[{ text: "🎮 Play Now", web_app: { url: webAppUrl } }]],
              });
            }
          }

          // Handle /leaderboard
          if (command === "/leaderboard") {
            const { data: leaderboard } = await supabaseAdmin
              .from("users")
              .select("id, total_taps, balance, level")
              .order("total_taps", { ascending: false })
              .limit(10);

            if (!leaderboard || leaderboard.length === 0) {
              await sendMessage(chatId, `<b>🏆 Leaderboard</b>\n\nNo players yet!`);
            } else {
              const board = leaderboard
                .map(
                  (u, i) =>
                    `${i + 1}. <b>User ${u.id}</b> - ${u.total_taps?.toLocaleString() || "0"} taps, ${u.balance?.toLocaleString() || "0"} DBL`,
                )
                .join("\n");

              const message = `<b>🏆 Top Players</b>\n\n${board}\n\nCan you reach the top? 🚀`;
              await sendMessage(chatId, message, {
                inline_keyboard: [[{ text: "🎮 Join the Race", web_app: { url: webAppUrl } }]],
              });
            }
          }

          // Handle /tasks
          if (command === "/tasks") {
            const message = [
              `<b>✅ Daily Tasks</b>`,
              ``,
              `Complete tasks to earn bonus DBL!`,
              ``,
              `• Tap 100 times`,
              `• Invite a friend`,
              `• Visit our community`,
              `• Watch a video`,
              ``,
              `Tap the button below to view and complete tasks!`,
            ].join("\n");

            await sendMessage(chatId, message, {
              inline_keyboard: [[{ text: "📋 View Tasks", web_app: { url: webAppUrl } }]],
            });
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
