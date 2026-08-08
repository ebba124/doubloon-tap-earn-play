// Server-only helpers used by game.functions.ts handlers.
// Kept out of .functions.ts because sibling declarations in a server-fn file
// break the TanStack server-fn split (ReferenceError at runtime).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyTelegramInitData, devBypassUser } from "./telegram-verify.server";
import type { AchievementStat } from "./progression";

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
  const { data, error: readError } = await svc
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();
  if (readError || !data) throw new Error("Could not load your balance. Please try again.");

  const nextBalance = Number(data.balance) + delta;
  let updateError: { message: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await svc.from("users").update({ balance: nextBalance }).eq("id", userId);
    updateError = result.error;
    if (!updateError) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (updateError) {
    const { data: verified } = await svc.from("users").select("balance").eq("id", userId).single();
    if (!verified || Number(verified.balance) !== nextBalance) {
      console.error("[v0] balance increment failed", userId, updateError.message);
      throw new Error("Could not apply your reward. Please try again.");
    }
  }
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

// --- Progression (XP / levels / gems / achievements) ------------------------

export interface LevelUp {
  level: number;
  title: string;
  dbl: number;
  gems: number;
}

/**
 * Single writer for every reward payout. Adds DBL/gems/XP, resolves any level
 * ups (including their rewards), applies an optional extra column patch and
 * writes one audit row. Returns the fresh user plus the level ups that fired.
 */
export async function grantProgress(
  userId: number,
  opts: {
    dbl?: number;
    gems?: number;
    xp?: number;
    patch?: Record<string, unknown>;
    action: string;
    meta?: Record<string, unknown>;
  },
) {
  const prog = await import("./progression");
  const svc = db();
  const { data: u, error: userError } = await svc
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (userError) {
    console.error("[v0] grantProgress user lookup failed", userId, userError.message);
    throw new Error("Could not load your balance. Please try again.");
  }
  if (!u) throw new Error("User not found");

  const shouldUpdateProgression = opts.xp !== undefined || opts.gems !== undefined;
  const xp = Number(u.xp ?? 0) + (opts.xp ?? 0);
  const prevLevel = Number(u.level ?? 1);
  const level = Math.max(prevLevel, prog.levelForXp(xp));

  let dbl = opts.dbl ?? 0;
  let gems = opts.gems ?? 0;
  const levelUps: LevelUp[] = [];
  if (shouldUpdateProgression) {
    for (let l = prevLevel + 1; l <= level; l++) {
      const reward = prog.levelUpReward(l);
      dbl += reward.dbl;
      gems += reward.gems;
      levelUps.push({ level: l, title: prog.levelTitle(l), ...reward });
    }
  }

  const updatePayload = {
    ...(opts.patch ?? {}),
    balance: Number(u.balance) + dbl,
    ...(shouldUpdateProgression
      ? { gems: Number(u.gems ?? 0) + gems, xp, level }
      : {}),
  };

  let updateError: { message: string } | null = null;
  let applied = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await svc
      .from("users")
      .update(updatePayload)
      .eq("id", userId)
      .select("*")
      .maybeSingle();
    updateError = result.error;
    if (!updateError && result.data) {
      applied =
        Number(result.data.balance) === updatePayload.balance &&
        (!shouldUpdateProgression ||
          (Number(result.data.gems) === updatePayload.gems &&
            Number(result.data.xp) === updatePayload.xp));
      if (applied) break;
    }

    // Telegram Mini Apps can briefly lose their connection. Re-read the row
    // before retrying so a committed first request is never reported as failed.
    const { data: verified } = await svc
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    applied =
      !!verified &&
      Number(verified.balance) === updatePayload.balance &&
      (!shouldUpdateProgression ||
        (Number(verified.gems) === updatePayload.gems &&
          Number(verified.xp) === updatePayload.xp));
    if (applied) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (!applied) {
    console.error("[v0] grantProgress balance update failed", {
      userId,
      message: updateError?.message ?? "no row was updated",
    });
    throw new Error("Could not apply your reward. Please try again.");
  }

  const { data: fresh, error: freshError } = await svc
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  const returnedUser =
    fresh ??
    ({
      ...u,
      ...(opts.patch ?? {}),
      balance: Number(u.balance) + dbl,
      gems: Number(u.gems ?? 0) + gems,
      xp,
      level,
    } as typeof u);
  if (freshError || !fresh) {
    console.error(
      "[v0] grantProgress fresh user lookup failed after payout",
      userId,
      freshError?.message,
    );
  }

  // The balance update is the source of truth. Audit logging is best-effort so
  // a non-critical logging/RLS issue can never make a successful payout appear
  // to the player as a failed reward.
  const { error: auditError } = await svc.from("audit_log").insert({
    user_id: userId,
    action: opts.action,
    delta: dbl,
    meta: { ...(opts.meta ?? {}), gems, xp: opts.xp ?? 0, levelUps: levelUps.map((l) => l.level) },
  });
  if (auditError) {
    console.error("[v0] grantProgress audit write failed after payout", userId, auditError.message);
  }

  return { user: returnedUser, levelUps, dbl, gems };
}

/**
 * Evaluates every not-yet-unlocked achievement against the player's stats and
 * pays out the ones that just completed. Stat queries are lazy so a plain tap
 * flush never touches the referral/task tables.
 */
export async function checkAchievements(userId: number) {
  const prog = await import("./progression");
  const svc = db();

  const [{ data: u }, { data: doneRows }] = await Promise.all([
    svc.from("users").select("*").eq("id", userId).single(),
    svc.from("achievements").select("achievement_id").eq("user_id", userId),
  ]);
  if (!u) throw new Error("User not found");

  const done = new Set((doneRows ?? []).map((r) => r.achievement_id));
  const pending = prog.ACHIEVEMENTS.filter((a) => !done.has(a.id));
  if (pending.length === 0) return { unlocked: [], levelUps: [] as LevelUp[], user: u };

  const needs = new Set(pending.map((a) => a.stat));
  const stats: Record<AchievementStat, number> = {
    total_taps: Number(u.total_taps ?? 0),
    level: Number(u.level ?? 1),
    longest_streak: Number(u.longest_streak ?? 0),
    balance: Number(u.balance ?? 0),
    referrals: 0,
    tasks: 0,
    spins: 0,
  };
  if (needs.has("referrals")) {
    const { count } = await svc
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", userId);
    stats.referrals = count ?? 0;
  }
  if (needs.has("tasks")) {
    const { count } = await svc
      .from("tasks_done")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    stats.tasks = count ?? 0;
  }
  if (needs.has("spins")) {
    const { count } = await svc
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "spin");
    stats.spins = count ?? 0;
  }

  const earned = pending.filter((a) => stats[a.stat] >= a.threshold);
  if (earned.length === 0) return { unlocked: [], levelUps: [] as LevelUp[], user: u };

  // ignoreDuplicates + select() means a racing request only awards rows it won.
  const { data: inserted } = await svc
    .from("achievements")
    .upsert(
      earned.map((a) => ({ user_id: userId, achievement_id: a.id })),
      { onConflict: "user_id,achievement_id", ignoreDuplicates: true },
    )
    .select("achievement_id");
  const wonIds = new Set((inserted ?? []).map((r) => r.achievement_id));
  const won = earned.filter((a) => wonIds.has(a.id));
  if (won.length === 0) return { unlocked: [], levelUps: [] as LevelUp[], user: u };

  const res = await grantProgress(userId, {
    dbl: won.reduce((s, a) => s + a.dbl, 0),
    gems: won.reduce((s, a) => s + a.gems, 0),
    xp: won.reduce((s, a) => s + a.xp, 0),
    action: "achievement_unlock",
    meta: { ids: won.map((a) => a.id) },
  });

  return {
    unlocked: won.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      dbl: a.dbl,
      gems: a.gems,
    })),
    levelUps: res.levelUps,
    user: res.user,
  };
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
  const json = (await res?.json().catch(() => null)) as {
    ok?: boolean;
    result?: { status?: string };
    description?: string;
  } | null;
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
