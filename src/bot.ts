import { createAPIFileRoute } from "@tanstack/react-start/api";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WEBAPP_URL = process.env.PUBLIC_APP_URL!;

async function sendMessage(chatId: number, text: string, extra = {}) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
}

export const APIRoute = createAPIFileRoute("/api/bot")({
  POST: async ({ request }) => {
    const body = await request.json();
    const { message, callback_query } = body;

    // /start handler
    if (message?.text?.startsWith("/start")) {
      const from = message.from;
      const name = from.first_name ?? "there";

      await sendMessage(from.id,
        `Hey, *${name}*\\! Welcome to *Doubloon Tap* 🪙\n\n` +
        `Tap the coin and watch your balance rise\\.\n\n` +
        `*Doubloon Tap* is a tap\\-to\\-earn game where you collect Doubloons, ` +
        `complete tasks, and unlock boosts the more you play\\.\n\n` +
        `Got friends or co\\-workers?\n` +
        `Bring them all into the game\\.\n` +
        `More friends, more Doubloons\\. 💰`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [
              [{ text: "👋 Start now!", web_app: { url: WEBAPP_URL } }],
              [{ text: "💬 Join community", url: "https://t.me/Doublooncommunity" }],
              [{ text: "📣 Join channel", url: "https://t.me/Doubloontap" }],
              [{ text: "📄 Help", callback_data: "help" }],
            ],
          },
        }
      );
    }

    // Help button handler
    if (callback_query?.data === "help") {
      await sendMessage(callback_query.from.id,
        `*How Doubloon Tap works* 🪙\n\n` +
        `⚡ Tap the coin to earn Doubloons\n` +
        `📅 Claim your daily streak bonus\n` +
        `🎡 Spin every 3 hours for free rewards\n` +
        `✅ Complete tasks for one\\-time bonuses\n` +
        `🚀 Buy boosts to earn faster\n` +
        `🤝 Invite friends for referral rewards\n` +
        `💵 Cash out to USDT at the minimum threshold`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: {
            inline_keyboard: [[
              { text: "👋 Open Doubloon Tap", web_app: { url: WEBAPP_URL } }
            ]],
          },
        }
      );

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callback_query.id }),
      });
    }

    return new Response("ok", { status: 200 });
  },

  GET: async () => new Response("ok", { status: 200 }),
});