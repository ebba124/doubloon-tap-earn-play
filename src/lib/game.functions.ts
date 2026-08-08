import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const initDataSchema = z.object({ initData: z.string().min(1) });

// --- getSession -------------------------------------------------------------

export const getSession = createServerFn({ method: "POST" })
  .validator((d: { initData: string }) => initDataSchema.parse(d))
  .handler(async ({ data }) => {
    const { verifyInitData, db, incBalance, regenEnergy, checkRequiredChannels, grantProgress } =
      await import("./game.server");
    const eco = await import("./economy.server");
    const prog = await import("./progression");
    const v = await verifyInitData(data.initData);
    const svc = db();

    const profile = {
      id: v.user.id,
      username: v.user.username ?? null,
      first_name: v.user.first_name ?? null,
      last_name: v.user.last_name ?? null,
      photo_url: v.user.photo_url ?? null,
      language_code: v.user.language_code ?? null,
    };
    const { data: existing, error: existingError } = await svc
      .from("users")
      .select("*")
      .eq("id", v.user.id)
      .maybeSingle();
    if (existingError) {
      console.error("[v0] user lookup failed before reward", existingError.message);
      throw new Error("Could not load your game profile. Please try again.");
    }
    let user = existing;
    if (!user) {
      const { data: created, error: createError } = await svc
        .from("users")
        .upsert(profile, { onConflict: "id" })
        .select("*")
        .single();
      if (createError || !created) {
        console.error("[v0] user creation failed before reward", createError?.message);
        throw new Error("Could not create your game profile. Please try again.");
      }
      user = created;

      let referrerId: number | null = null;
      if (v.start_param?.startsWith("ref_")) {
        const rid = Number(v.start_param.slice(4));
        if (rid && rid !== v.user.id) referrerId = rid;
      }
      if (!referrerId) {
        const { data: pr } = await svc
          .from("pending_referrals")
          .select("referrer_id")
          .eq("referred_id", v.user.id)
          .maybeSingle();
        if (pr) referrerId = Number(pr.referrer_id);
      }
      if (referrerId) {
        const { data: refExists } = await svc
          .from("users")
          .select("id")
          .eq("id", referrerId)
          .maybeSingle();
        if (refExists) {
          try {
            await svc.from("users").update({ referred_by: referrerId }).eq("id", v.user.id);
            const { error: referralError } = await svc.from("referrals").insert({
              referrer_id: referrerId,
              referred_id: v.user.id,
            });
            if (referralError && referralError.code !== "23505") {
              throw referralError;
            }

            await grantProgress(referrerId, {
              dbl: eco.REFERRAL_REWARD_PER_FRIEND,
              xp: prog.XP_PER_REFERRAL,
              action: "referral_reward",
              meta: { referred_id: v.user.id },
            });
            await grantProgress(v.user.id, {
              dbl: eco.REFERRAL_REWARD_FOR_INVITEE,
              action: "referral_welcome",
              meta: { referrer_id: referrerId },
            });

            const { count } = await svc
              .from("referrals")
              .select("*", { count: "exact", head: true })
              .eq("referrer_id", referrerId);
            if ((count ?? 0) === eco.REFERRAL_MILESTONE_COUNT) {
              await svc.from("users").update({ tap_multiplier_permanent: 2 }).eq("id", referrerId);
              await incBalance(referrerId, eco.REFERRAL_MILESTONE_BONUS);
              await svc.from("audit_log").insert({
                user_id: referrerId,
                action: "referral_milestone",
                delta: eco.REFERRAL_MILESTONE_BONUS,
                meta: { count },
              });
            }
          } catch (error) {
            console.error("[v0] referral reward failed", error);
          }
        }
        await svc.from("pending_referrals").delete().eq("referred_id", v.user.id);
      }
      user = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
    } else {
      await svc
        .from("users")
        .update({
          username: v.user.username ?? user.username,
          first_name: v.user.first_name ?? user.first_name,
          last_name: v.user.last_name ?? user.last_name,
          photo_url: v.user.photo_url ?? user.photo_url,
          language_code: v.user.language_code ?? user.language_code,
        })
        .eq("id", v.user.id);
    }

    user = await regenEnergy(v.user.id);

    const { data: tasksDone } = await svc
      .from("tasks_done")
      .select("task_id")
      .eq("user_id", v.user.id);

    const { data: myRefs } = await svc
      .from("referrals")
      .select("referred_id, created_at")
      .eq("referrer_id", v.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    const refIds = (myRefs ?? []).map((r) => Number(r.referred_id));
    const refUsers = refIds.length
      ? ((
          await svc
            .from("users")
            .select("id, username, first_name, photo_url, balance")
            .in("id", refIds)
        ).data ?? [])
      : [];

    const { data: withdrawals } = await svc
      .from("withdrawals")
      .select("id, amount_dbl, amount_usdt, method, address, status, created_at")
      .eq("user_id", v.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const membership = await checkRequiredChannels(v.user.id);

    const { data: achRows } = await svc
      .from("achievements")
      .select("achievement_id, unlocked_at")
      .eq("user_id", v.user.id);

    const { data: lastSpinRow } = await svc
      .from("audit_log")
      .select("created_at")
      .eq("user_id", v.user.id)
      .eq("action", "spin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSpinAt = lastSpinRow
      ? new Date(
          new Date(lastSpinRow.created_at).getTime() + eco.SPIN_COOLDOWN_SEC * 1000,
        ).toISOString()
      : null;

    return {
      user,
      membership,
      nextSpinAt,
      tasks: eco.TASKS,
      tasksDone: (tasksDone ?? []).map((t) => t.task_id),
      boosts: eco.BOOSTS.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        maxLevel: b.maxLevel,
      })),
      referrals: (myRefs ?? []).map((r) => {
        const u = refUsers.find((x) => Number(x.id) === Number(r.referred_id));
        return {
          id: Number(r.referred_id),
          username: u?.username ?? null,
          first_name: u?.first_name ?? null,
          photo_url: u?.photo_url ?? null,
          balance: Number(u?.balance ?? 0),
          joined_at: r.created_at,
        };
      }),
      referralCount: (myRefs ?? []).length,
      milestone: {
        target: eco.REFERRAL_MILESTONE_COUNT,
        bonus: eco.REFERRAL_MILESTONE_BONUS,
        achieved: Number(user.tap_multiplier_permanent) >= 2,
      },
      withdrawals: withdrawals ?? [],
      achievements: prog.ACHIEVEMENTS,
      achievementsUnlocked: (achRows ?? []).map((a) => ({
        id: a.achievement_id,
        unlocked_at: a.unlocked_at,
      })),
      progression: {
        level: Number(user.level ?? 1),
        title: prog.levelTitle(Number(user.level ?? 1)),
        xp: Number(user.xp ?? 0),
        ...prog.levelProgress(Number(user.xp ?? 0)),
        nextLevelReward: prog.levelUpReward(Number(user.level ?? 1) + 1),
        maxLevel: prog.MAX_LEVEL,
      },
      streak: {
        day: Number(user.streak_day ?? 0),
        longest: Number(user.longest_streak ?? 0),
        freezes: Number(user.streak_freezes ?? 0),
        maxFreezes: prog.MAX_STREAK_FREEZES,
        multiplier: prog.streakMultiplier(Number(user.streak_day ?? 0)),
        nextMultiplier: prog.streakMultiplier(Number(user.streak_day ?? 0) + 1),
        tiers: prog.STREAK_TIERS,
      },
      config: {
        dblPerUsdt: eco.DBL_PER_USDT,
        minWithdrawDbl: eco.MIN_WITHDRAW_DBL,
        botUsername: eco.BOT_USERNAME,
        withdrawMethods: Object.entries(eco.WITHDRAW_METHODS).map(([id, m]) => ({
          id,
          label: m.label,
          network: m.network,
        })),
        dailyRewards: eco.DAILY_STREAK_REWARDS,
        spinCooldownSec: eco.SPIN_COOLDOWN_SEC,
        spinPrizes: eco.SPIN_PRIZES.map((p) => ({
          label: p.label,
          amount: p.amount,
          color: p.color,
        })),
      },
    };
  });

// --- tap --------------------------------------------------------------------

export const tap = createServerFn({ method: "POST" })
  .validator((d: { initData: string; taps: number; nonce: string }) =>
    z
      .object({
        initData: z.string().min(1),
        taps: z.number().int().min(1).max(50),
        nonce: z.string().min(8).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { verifyInitData, db, regenEnergy, grantProgress, checkAchievements } =
      await import("./game.server");
    const eco = await import("./economy.server");
    const prog = await import("./progression");
    const v = await verifyInitData(data.initData);
    const svc = db();

    const idKey = `tap:${v.user.id}:${data.nonce}`;
    const { error: idErr } = await svc
      .from("idempotency")
      .insert({ key: idKey, user_id: v.user.id });
    if (idErr) {
      const u = await regenEnergy(v.user.id);
      return { user: u, applied: 0, duplicate: true };
    }

    const u = await regenEnergy(v.user.id);
    const { data: recent } = await svc
      .from("audit_log")
      .select("delta, created_at")
      .eq("user_id", v.user.id)
      .eq("action", "tap")
      .gte("created_at", new Date(Date.now() - 1000).toISOString());
    const recentTaps = (recent ?? []).reduce((s, r) => s + Number(r.delta ?? 0), 0);
    const allowedTaps = Math.max(0, eco.MAX_TAPS_PER_SECOND - recentTaps);
    const applyTaps = Math.min(data.taps, u.energy, allowedTaps);
    if (applyTaps <= 0) return { user: u, applied: 0, duplicate: false };

    const value = applyTaps * Number(u.tap_value) * Number(u.tap_multiplier_permanent || 1);

    const prevTaps = Number(u.total_taps);
    const newTaps = prevTaps + applyTaps;

    const granted = await grantProgress(v.user.id, {
      dbl: value,
      xp: applyTaps * prog.XP_PER_TAP,
      patch: {
        energy: u.energy - applyTaps,
        total_taps: newTaps,
        last_energy_update: new Date().toISOString(),
      },
      action: "tap",
      meta: { taps: applyTaps, value },
    });

    // Only walk the achievement table when a tap milestone could have been hit.
    const crossedTapMilestone = prog.TAP_ACHIEVEMENT_THRESHOLDS.some(
      (t) => prevTaps < t && newTaps >= t,
    );
    let unlocked: unknown[] = [];
    let levelUps = granted.levelUps;
    let fresh = granted.user;
    if (crossedTapMilestone || granted.levelUps.length > 0) {
      try {
        const ach = await checkAchievements(v.user.id);
        unlocked = ach.unlocked;
        levelUps = [...levelUps, ...ach.levelUps];
        fresh = ach.user;
      } catch (error) {
        console.error("[v0] tap achievement check failed after payout", error);
      }
    }

    return {
      user: fresh,
      applied: applyTaps,
      duplicate: false,
      progress: { levelUps, unlocked },
    };
  });

// --- claimDaily -------------------------------------------------------------

export const claimDaily = createServerFn({ method: "POST" })
  .validator((d: { initData: string }) => initDataSchema.parse(d))
  .handler(async ({ data }) => {
    const { verifyInitData, grantProgress, checkAchievements } = await import("./game.server");
    const eco = await import("./economy.server");
    const prog = await import("./progression");
    const v = await verifyInitData(data.initData);
    const { regenEnergy } = await import("./game.server");
    const svc = db();
    const u = await regenEnergy(v.user.id);
    const now = new Date();
    const last = u.last_daily_claim ? new Date(u.last_daily_claim) : null;
    const gapHours = last ? (now.getTime() - last.getTime()) / 3.6e6 : Number.POSITIVE_INFINITY;
    if (last && gapHours < 20) {
      return {
        user: u,
        claimed: 0,
        reason: "cooldown" as const,
        day: u.streak_day,
        multiplier: prog.streakMultiplier(Number(u.streak_day ?? 0)),
        gems: 0,
        freezeUsed: false,
        comebackBonus: 0,
        progress: { levelUps: [], unlocked: [] as unknown[] },
      };
    }
    let day = Number(u.streak_day ?? 0);
    let freezes = Number(u.streak_freezes ?? 0);
    let freezeUsed = false;
    let comebackBonus = 0;
    if (last && gapHours > 48) {
      if (gapHours <= prog.STREAK_FREEZE_WINDOW_HOURS && freezes > 0) {
        freezes -= 1;
        freezeUsed = true;
      } else {
        if (day >= 3) comebackBonus = prog.COMEBACK_BONUS_DBL;
        day = 0;
      }
    }
    day = Math.min(day + 1, eco.DAILY_STREAK_REWARDS.length);
    const base = eco.DAILY_STREAK_REWARDS[day - 1];
    const multiplier = prog.streakMultiplier(day);
    const reward = Math.floor(base * multiplier) + comebackBonus;
    if (day % 7 === 0) freezes = Math.min(prog.MAX_STREAK_FREEZES, freezes + 1);
    const granted = await grantProgress(v.user.id, {
      dbl: reward,
      patch: {
        streak_day: day,
        longest_streak: Math.max(Number(u.longest_streak ?? 0), day),
        streak_freezes: freezes,
        last_daily_claim: now.toISOString(),
      },
      action: "daily_claim",
      meta: { day, base, multiplier, freezeUsed, comebackBonus },
    });
    let ach: Awaited<ReturnType<typeof checkAchievements>> = {
      user: granted.user,
      levelUps: [],
      unlocked: [],
    };
    try {
      ach = await checkAchievements(v.user.id);
    } catch (error) {
      console.error("[v0] daily achievement check failed after payout", error);
    }
    return {
      user: ach.user,
      claimed: reward,
      reason: "ok" as const,
      day,
      multiplier,
      gems: 0,
      freezeUsed,
      comebackBonus,
      progress: {
        levelUps: [...granted.levelUps, ...ach.levelUps],
        unlocked: ach.unlocked as unknown[],
      },
    };
  });

// --- completeTask -----------------------------------------------------------

export const completeTask = createServerFn({ method: "POST" })
  .validator((d: { initData: string; taskId: string }) =>
    z.object({ initData: z.string().min(1), taskId: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { verifyInitData, db, checkRequiredChannels, grantProgress, checkAchievements } =
      await import("./game.server");
    const eco = await import("./economy.server");
    const prog = await import("./progression");
    const v = await verifyInitData(data.initData);
    const svc = db();
    const task = eco.TASKS.find((t) => t.id === data.taskId);
    if (!task) throw new Error("Unknown task");
    const gate = await checkRequiredChannels(v.user.id);
    if (!gate.ok)
      throw new Error(`Join our channels first: ${gate.missing.map((c) => c.label).join(", ")}`);
    if (task.id === "invite_1") {
      const { count } = await svc
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_id", v.user.id);
      if ((count ?? 0) < 1) throw new Error("Invite a friend first");
    }
    if (task.kind === "channel" && task.chat) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) throw new Error("Verification unavailable, try again later");
      const res = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: task.chat, user_id: v.user.id }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        result?: { status?: string };
      } | null;
      if (!json?.ok) throw new Error("Could not verify your subscription. Try again in a moment.");
      if (
        !["creator", "administrator", "member", "restricted"].includes(
          json.result?.status ?? "left",
        )
      )
        throw new Error("Join the channel first, then claim.");
    }
    const { data: completed, error: dupErr } = await svc
      .from("tasks_done")
      .insert({ user_id: v.user.id, task_id: task.id })
      .select("task_id")
      .single();
    if (dupErr || !completed)
      throw new Error(
        dupErr?.code === "23505"
          ? "Task already claimed"
          : "Could not reserve this task. Please try again.",
      );
    try {
      const granted = await grantProgress(v.user.id, {
        dbl: task.reward,
        xp: prog.XP_PER_TASK,
        action: "task_complete",
        meta: { task: task.id },
      });
      let ach: Awaited<ReturnType<typeof checkAchievements>> = {
        user: granted.user,
        levelUps: [],
        unlocked: [],
      };
      try {
        ach = await checkAchievements(v.user.id);
      } catch (error) {
        console.error("[v0] task achievement check failed after payout", error);
      }
      return {
        user: ach.user,
        taskId: task.id,
        reward: task.reward,
        progress: {
          levelUps: [...granted.levelUps, ...ach.levelUps],
          unlocked: ach.unlocked as unknown[],
        },
      };
    } catch (error) {
      await svc.from("tasks_done").delete().eq("user_id", v.user.id).eq("task_id", task.id);
      throw error;
    }
  });

// --- buyBoost ---------------------------------------------------------------

export const buyBoost = createServerFn({ method: "POST" })
  .validator((d: { initData: string; boostId: string; nonce: string }) =>
    z
      .object({
        initData: z.string().min(1),
        boostId: z.string(),
        nonce: z.string().min(8).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { verifyInitData, db } = await import("./game.server");
    const eco = await import("./economy.server");
    const v = await verifyInitData(data.initData);
    const svc = db();
    const boost = eco.BOOSTS.find((b) => b.id === data.boostId);
    if (!boost) throw new Error("Unknown boost");
    const idKey = `boost:${v.user.id}:${data.nonce}`;
    const { error: idErr } = await svc
      .from("idempotency")
      .insert({ key: idKey, user_id: v.user.id });
    if (idErr) {
      const { data: duplicateUser } = await svc
        .from("users")
        .select("*")
        .eq("id", v.user.id)
        .single();
      return { user: duplicateUser, duplicate: true, cost: 0 };
    }
    const { data: u, error: userError } = await svc
      .from("users")
      .select("*")
      .eq("id", v.user.id)
      .single();
    if (userError || !u) throw new Error("Could not load your balance. Please try again.");
    const currentLevel =
      boost.id === "multitap" ? Number(u.multitap_level) : Number(u.energy_limit_level);
    if (currentLevel >= boost.maxLevel) throw new Error("Boost at max level");
    const cost = eco.boostCost(boost, currentLevel);
    if (Number(u.balance) < cost) throw new Error("Not enough DBL");
    const patch = boost.apply(u);
    const { error: updateError } = await svc
      .from("users")
      .update({ ...patch, balance: Number(u.balance) - cost })
      .eq("id", v.user.id);
    if (updateError) {
      await svc.from("idempotency").delete().eq("key", idKey).eq("user_id", v.user.id);
      throw new Error("Could not apply boost. Please try again.");
    }
    await svc.from("audit_log").insert({
      user_id: v.user.id,
      action: "boost_buy",
      delta: -cost,
      meta: { boost: boost.id, level: currentLevel + 1 },
    });
    const { data: fresh } = await svc.from("users").select("*").eq("id", v.user.id).single();
    return { user: fresh, duplicate: false, cost };
  });

// --- requestWithdraw --------------------------------------------------------

export const requestWithdraw = createServerFn({ method: "POST" })
  .validator((d: { initData: string; amount_dbl: number; method: string; address: string }) =>
    z
      .object({
        initData: z.string().min(1),
        amount_dbl: z.number().int().positive(),
        method: z.string(),
        address: z.string().min(3).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { verifyInitData, db } = await import("./game.server");
    const eco = await import("./economy.server");
    const v = await verifyInitData(data.initData);
    const svc = db();
    const method = eco.WITHDRAW_METHODS[data.method];
    if (!method) throw new Error("Unknown payout method");
    if (!method.addressRegex.test(data.address.trim()))
      throw new Error(`Invalid address for ${method.label}`);
    if (data.amount_dbl < eco.MIN_WITHDRAW_DBL)
      throw new Error(`Minimum withdrawal is ${eco.MIN_WITHDRAW_DBL} DBL`);

    const u = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
    if (Number(u.balance) < data.amount_dbl) throw new Error("Insufficient balance");

    const amount_usdt = data.amount_dbl / eco.DBL_PER_USDT;
    await svc
      .from("users")
      .update({ balance: Number(u.balance) - data.amount_dbl })
      .eq("id", v.user.id);
    const { data: wd, error } = await svc
      .from("withdrawals")
      .insert({
        user_id: v.user.id,
        amount_dbl: data.amount_dbl,
        amount_usdt,
        method: data.method,
        address: data.address.trim(),
      })
      .select("*")
      .single();
    if (error) throw error;
    await svc.from("audit_log").insert({
      user_id: v.user.id,
      action: "withdraw_request",
      delta: -data.amount_dbl,
      meta: { withdrawal_id: wd.id, method: data.method },
    });
    return { ok: true, withdrawal: wd };
  });

// --- spin (Lucky Spin Wheel) ------------------------------------------------

export const spin = createServerFn({ method: "POST" })
  .validator((d: { initData: string; nonce: string }) =>
    z
      .object({
        initData: z.string().min(1),
        nonce: z.string().min(8).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { verifyInitData, db, checkRequiredChannels, grantProgress, checkAchievements } =
      await import("./game.server");
    const eco = await import("./economy.server");
    const prog = await import("./progression");
    const v = await verifyInitData(data.initData);
    const svc = db();

    const gate = await checkRequiredChannels(v.user.id);
    if (!gate.ok)
      throw new Error(`Join our channels first: ${gate.missing.map((c) => c.label).join(", ")}`);

    // Server-side cooldown enforcement using the audit log.
    const { data: lastSpinRow } = await svc
      .from("audit_log")
      .select("created_at")
      .eq("user_id", v.user.id)
      .eq("action", "spin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastSpinRow) {
      const elapsedSec = (Date.now() - new Date(lastSpinRow.created_at).getTime()) / 1000;
      if (elapsedSec < eco.SPIN_COOLDOWN_SEC) {
        const u = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
        const nextSpinAt = new Date(
          new Date(lastSpinRow.created_at).getTime() + eco.SPIN_COOLDOWN_SEC * 1000,
        ).toISOString();
        return { user: u, prizeIndex: -1, amount: 0, cooldown: true, duplicate: false, nextSpinAt };
      }
    }

    // Idempotency guard so a retried request cannot double-award a spin.
    const idKey = `spin:${v.user.id}:${data.nonce}`;
    const { error: idErr } = await svc
      .from("idempotency")
      .insert({ key: idKey, user_id: v.user.id });
    if (idErr) {
      const u = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
      return {
        user: u,
        prizeIndex: -1,
        amount: 0,
        cooldown: false,
        duplicate: true,
        nextSpinAt: null,
      };
    }

    const prizeIndex = eco.pickSpinPrize();
    const prize = eco.SPIN_PRIZES[prizeIndex];

    try {
      const granted = await grantProgress(v.user.id, {
        dbl: prize.amount,
        action: "spin",
        meta: { prizeIndex, label: prize.label },
      });
      let ach: Awaited<ReturnType<typeof checkAchievements>> = {
        user: granted.user,
        levelUps: [],
        unlocked: [],
      };
      try {
        ach = await checkAchievements(v.user.id);
      } catch (error) {
        console.error("[v0] spin achievement check failed after payout", error);
      }

      const nextSpinAt = new Date(Date.now() + eco.SPIN_COOLDOWN_SEC * 1000).toISOString();
      return {
        user: ach.user,
        prizeIndex,
        amount: prize.amount,
        cooldown: false,
        duplicate: false,
        nextSpinAt,
        progress: {
          levelUps: [...granted.levelUps, ...ach.levelUps],
          unlocked: ach.unlocked as unknown[],
        },
      };
    } catch (error) {
      await svc.from("idempotency").delete().eq("key", idKey).eq("user_id", v.user.id);
      throw error;
    }
  });

// --- leaderboard ------------------------------------------------------------

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const { db } = await import("./game.server");
  const svc = db();
  const { data } = await svc
    .from("users")
    .select("id, username, first_name, photo_url, balance, total_taps")
    .order("balance", { ascending: false })
    .limit(100);
  return (data ?? []).map((u, i) => ({
    rank: i + 1,
    id: Number(u.id),
    username: u.username,
    first_name: u.first_name,
    photo_url: u.photo_url,
    balance: Number(u.balance),
    total_taps: Number(u.total_taps),
  }));
});
