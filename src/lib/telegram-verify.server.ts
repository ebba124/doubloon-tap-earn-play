import { createHmac } from "node:crypto";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface VerifiedInitData {
  user: TelegramUser;
  start_param?: string;
  auth_date: number;
  raw: Record<string, string>;
}

/**
 * Verify Telegram Mini App initData string using HMAC-SHA256.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 60 * 60 * 24,
): VerifiedInitData {
  if (!initData) throw new Error("Missing initData");
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not configured");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("initData missing hash");
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .map(([k, v]) => [k, v] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computed !== hash) throw new Error("Invalid initData signature");

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) {
    throw new Error("initData expired");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("initData missing user");
  const user = JSON.parse(userRaw) as TelegramUser;
  if (!user?.id) throw new Error("initData user has no id");

  const raw: Record<string, string> = {};
  for (const [k, v] of params.entries()) raw[k] = v;

  return {
    user,
    start_param: params.get("start_param") ?? undefined,
    auth_date: authDate,
    raw,
  };
}

/** Dev-only bypass: allowed only outside production and when DEV_BYPASS=1. */
export function devBypassUser(initData: string): VerifiedInitData | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.DEV_BYPASS !== "1") return null;

  const params = new URLSearchParams(initData);
  const devId = Number(params.get("dev_user"));
  if (!devId) return null;
  return {
    user: { id: devId, first_name: "Dev", username: `dev${devId}` },
    start_param: params.get("start_param") ?? undefined,
    auth_date: Math.floor(Date.now() / 1000),
    raw: {},
  };
}
