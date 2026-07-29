import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const initDataSchema = z.object({ initData: z.string().min(1) });

// --- getSession -------------------------------------------------------------

export const getSession = createServerFn({ method: "POST" })
  .inputValidator((d: { initData: string }) => initDataSchema.parse(d))
  .handler(async ({ data }) => {
    const { verifyInitData, db, incBalance, regenEnergy } = await import("./game.server");
    const eco = await import("./economy.server");
    const v = await verifyInitData(data.initData);
    const svc = db();

    const { data: existing } = await svc.from("users").select("*").eq("id", v.user.id).maybeSingle();
    let user = existing;
    if (!user) {
      const insertRes = await svc
        .from("users")
        .insert({
          id: v.user.id,
          username: v.user.username ?? null,
          first_name: v.user.first_name ?? null,
          last_name: v.user.last_name ?? null,
          photo_url: v.user.photo_url ?? null,
          language_code: v.user.language_code ?? null,
        })
        .select("*")
        .single();
      user = insertRes.data!;

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
          await svc.from("users").update({ referred_by: referrerId }).eq("id", v.user.id);
          await svc.from("referrals").insert({
            referrer_id: referrerId,
            referred_id: v.user.id,
          });
          await svc.from("audit_log").insert([
            {
              user_id: referrerId,
              action: "referral_reward",
              delta: eco.REFERRAL_REWARD_PER_FRIEND,
              meta: { referred_id: v.user.id },
            },
            {
              user_id: v.user.id,
              action: "referral_welcome",
              delta: eco.REFERRAL_REWARD_FOR_INVITEE,
              meta: { referrer_id: referrerId },
            },
          ]);
          await incBalance(referrerId, eco.REFERRAL_REWARD_PER_FRIEND);
          await incBalance(v.user.id, eco.REFERRAL_REWARD_FOR_INVITEE);
          const { count } = await svc
            .from("referrals")
            .select("*", { count: "exact", head: true })
            .eq("referrer_id", referrerId);
          if ((count ?? 0) === eco.REFERRAL_MILESTONE_COUNT) {
            await svc
              .from("users")
              .update({ tap_multiplier_permanent: 2 })
              .eq("id", referrerId);
            await incBalance(referrerId, eco.REFERRAL_MILESTONE_BONUS);
            await svc.from("audit_log").insert({
              user_id: referrerId,
              action: "referral_milestone",
              delta: eco.REFERRAL_MILESTONE_BONUS,
              meta: { count },
            });
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
      ? (
          await svc
            .from("users")
            .select("id, username, first_name, photo_url, balance")
            .in("id", refIds)
        ).data ?? []
      : [];

    const { data: withdrawals } = await svc
      .from("withdrawals")
      .select("id, amount_dbl, amount_usdt, method, address, status, created_at")
      .eq("user_id", v.user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      user,
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
      },
    };
  });

// --- tap --------------------------------------------------------------------

export const tap = createServerFn({ method: "POST" })
  .inputValidator((d: { initData: string; taps: number; nonce: string }) =>
    z
      .object({
        initData: z.string().min(1),
        taps: z.number().int().min(1).max(50),
        nonce: z.string().min(8).max(64),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { verifyInitData, db, regenEnergy } = await import("./game.server");
    const eco = await import("./economy.server");
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

    const value =
      applyTaps * Number(u.tap_value) * Number(u.tap_multiplier_permanent || 1);

    await svc
      .from("users")
      .update({
        balance: Number(u.balance) + value,
        energy: u.energy - applyTaps,
        total_taps: Number(u.total_taps) + applyTaps,
        last_energy_update: new Date().toISOString(),
      })
      .eq("id", v.user.id);

    await svc.from("audit_log").insert({
      user_id: v.user.id,
      action: "tap",
      delta: applyTaps,
      meta: { value },
    });

    const fresh = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
    return { user: fresh, applied: applyTaps, duplicate: false };
  });

// --- claimDaily -------------------------------------------------------------

export const claimDaily = createServerFn({ method: "POST" })
  .inputValidator((d: { initData: string }) => initDataSchema.parse(d))
  .handler(async ({ data }) => {
    const { verifyInitData, db, regenEnergy } = await import("./game.server");
    const eco = await import("./economy.server");
    const v = await verifyInitData(data.initData);
    const svc = db();
    const u = await regenEnergy(v.user.id);

    const now = new Date();
    const last = u.last_daily_claim ? new Date(u.last_daily_claim) : null;
    if (last) {
      const hours = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
      if (hours < 20) return { user: u, claimed: 0, reason: "cooldown" as const, day: u.streak_day };
    }
    let day = Number(u.streak_day ?? 0);
    if (last && (now.getTime() - last.getTime()) / (1000 * 60 * 60) > 48) day = 0;
    day = Math.min(day + 1, eco.DAILY_STREAK_REWARDS.length);
    const reward = eco.DAILY_STREAK_REWARDS[day - 1];

    await svc
      .from("users")
      .update({
        balance: Number(u.balance) + reward,
        streak_day: day,
        last_daily_claim: now.toISOString(),
      })
      .eq("id", v.user.id);
    await svc.from("audit_log").insert({
      user_id: v.user.id,
      action: "daily_claim",
      delta: reward,
      meta: { day },
    });
    const fresh = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
    return { user: fresh, claimed: reward, reason: "ok" as const, day };
  });

// --- buyBoost ---------------------------------------------------------------

export const buyBoost = createServerFn({ method: "POST" })
  .inputValidator((d: { initData: string; boostId: string; nonce: string }) =>
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
      const u = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
      return { user: u, duplicate: true, cost: 0 };
    }

    const u = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
    const currentLevel =
      boost.id === "multitap" ? u.multitap_level : u.energy_limit_level;
    if (currentLevel >= boost.maxLevel) throw new Error("Boost at max level");
    const cost = eco.boostCost(boost, currentLevel);
    if (Number(u.balance) < cost) throw new Error("Not enough DBL");

    const patch = boost.apply(u);
    await svc
      .from("users")
      .update({ ...patch, balance: Number(u.balance) - cost })
      .eq("id", v.user.id);
    await svc.from("audit_log").insert({
      user_id: v.user.id,
      action: "boost_buy",
      delta: -cost,
      meta: { boost: boost.id, level: currentLevel + 1 },
    });
    const fresh = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
    return { user: fresh, duplicate: false, cost };
  });

// --- completeTask -----------------------------------------------------------

export const completeTask = createServerFn({ method: "POST" })
  .inputValidator((d: { initData: string; taskId: string }) =>
    z.object({ initData: z.string().min(1), taskId: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { verifyInitData, db, incBalance } = await import("./game.server");
    const eco = await import("./economy.server");
    const v = await verifyInitData(data.initData);
    const svc = db();
    const task = eco.TASKS.find((t) => t.id === data.taskId);
    if (!task) throw new Error("Unknown task");

    if (task.id === "invite_1") {
      const { count } = await svc
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_id", v.user.id);
      if ((count ?? 0) < 1) throw new Error("Invite a friend first");
    }

    const { error: dupErr } = await svc.from("tasks_done").insert({
      user_id: v.user.id,
      task_id: task.id,
    });
    if (dupErr) throw new Error("Task already claimed");

    await incBalance(v.user.id, task.reward);
    await svc.from("audit_log").insert({
      user_id: v.user.id,
      action: "task_complete",
      delta: task.reward,
      meta: { task: task.id },
    });
    const fresh = (await svc.from("users").select("*").eq("id", v.user.id).single()).data!;
    return { user: fresh, reward: task.reward };
  });

// --- requestWithdraw --------------------------------------------------------

export const requestWithdraw = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { initData: string; amount_dbl: number; method: string; address: string }) =>
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
