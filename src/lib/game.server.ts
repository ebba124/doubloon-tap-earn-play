// Server-only helpers used by game.functions.ts handlers.
// Kept out of .functions.ts because sibling declarations in a server-fn file
// break the TanStack server-fn split (ReferenceError at runtime).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyTelegramInitData, devBypassUser } from "./telegram-verify.server";

export async function verifyInitData(initData: string) {
  const bypass = devBypassUser(initData);
  if (bypass) return bypass;
  return verifyTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN ?? "");
}

export function db() {
  return supabaseAdmin;
}

export async function incBalance(userId: number, delta: number) {
  const svc = db();
  const { data } = await svc.from("users").select("balance").eq("id", userId).single();
  if (!data) return;
  await svc
    .from("users")
    .update({ balance: Number(data.balance) + delta })
    .eq("id", userId);
}

export async function regenEnergy(userId: number) {
  const svc = db();
  const { data: u } = await svc.from("users").select("*").eq("id", userId).single();
  if (!u) throw new Error("User not found");
  const now = new Date();
  const last = new Date(u.last_energy_update);
  const elapsedSec = Math.max(0, (now.getTime() - last.getTime()) / 1000);
  const regen = elapsedSec * Number(u.energy_regen_per_sec);
  const newEnergy = Math.min(u.energy_max, u.energy + regen);
  if (Math.floor(newEnergy) !== u.energy) {
    await svc
      .from("users")
      .update({
        energy: Math.floor(newEnergy),
        last_energy_update: now.toISOString(),
      })
      .eq("id", userId);
    u.energy = Math.floor(newEnergy);
    u.last_energy_update = now.toISOString();
  }
  return u;
}

const JOINED = ["creator", "administrator", "member", "restricted"];

export async function isChannelMember(chat: string, userId: number): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, user_id: userId }),
  }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as
    | { ok?: boolean; result?: { status?: string }; description?: string }
    | null;
  if (!json?.ok) {
    console.error("getChatMember failed", chat, json?.description);
    return false;
  }
  return JOINED.includes(json.result?.status ?? "left");
}

/** Checks all mandatory channels. Returns per-channel status plus missing ones. */
export async function checkRequiredChannels(userId: number) {
  const { REQUIRED_CHANNELS } = await import("./economy.server");
  const results = await Promise.all(
    REQUIRED_CHANNELS.map(async (c) => ({ c, ok: await isChannelMember(c.chat, userId) })),
  );
  const missing = results.filter((r) => !r.ok).map((r) => r.c);
  return {
    ok: missing.length === 0,
    missing,
    channels: results.map((r) => ({ ...r.c, joined: r.ok })),
  };
}

