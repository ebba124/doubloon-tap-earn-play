import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AdminRole = "superadmin" | "withdraw_reviewer" | "economy_editor";
export type AdminPermission =
  "withdrawals:review" | "economy:edit" | "roles:manage" | "overview:view";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  superadmin: ["withdrawals:review", "economy:edit", "roles:manage", "overview:view"],
  withdraw_reviewer: ["withdrawals:review", "overview:view"],
  economy_editor: ["economy:edit", "overview:view"],
};

const _envSuperadmins: number[] = (process.env.ADMIN_TELEGRAM_IDS ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter(Boolean);

function envSuperadmins(): number[] {
  return _envSuperadmins;
}

async function getRolesForUser(telegramId: number): Promise<AdminRole[]> {
  const roles = new Set<AdminRole>();
  if (envSuperadmins().includes(telegramId)) roles.add("superadmin");
  const { db } = await import("./game.server");
  const { data } = await db().from("admin_roles").select("role").eq("telegram_id", telegramId);
  for (const r of data ?? []) roles.add(r.role as AdminRole);
  return [...roles];
}

function permsFor(roles: AdminRole[]): AdminPermission[] {
  const set = new Set<AdminPermission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return [...set];
}

async function requirePermission(initData: string, perm: AdminPermission) {
  const { verifyInitData } = await import("./game.server");
  const v = await verifyInitData(initData);
  const roles = await getRolesForUser(v.user.id);
  const perms = permsFor(roles);
  if (!perms.includes(perm)) throw new Error(`Missing permission: ${perm}`);
  return { verified: v, roles, perms };
}

export const adminMe = createServerFn({ method: "POST" })
  .validator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { verifyInitData } = await import("./game.server");
    const v = await verifyInitData(data.initData);
    const roles = await getRolesForUser(v.user.id);
    return { telegramId: v.user.id, roles, permissions: permsFor(roles) };
  });

export const adminOverview = createServerFn({ method: "POST" })
  .validator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "overview:view");
    const { db } = await import("./game.server");
    const svc = db();
    const [{ count: users }, { count: pending }, { data: recent }] = await Promise.all([
      svc.from("users").select("*", { count: "exact", head: true }),
      svc.from("withdrawals").select("*", { count: "exact", head: true }).eq("status", "pending"),
      svc.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    return { userCount: users ?? 0, pendingCount: pending ?? 0, withdrawals: recent ?? [] };
  });

export const adminReviewWithdrawal = createServerFn({ method: "POST" })
  .validator(
    (d: { initData: string; id: number; action: "approve" | "reject" | "paid"; note?: string }) =>
      z
        .object({
          initData: z.string(),
          id: z.number(),
          action: z.enum(["approve", "reject", "paid"]),
          note: z.string().max(500).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "withdrawals:review");
    const { db } = await import("./game.server");
    const svc = db();
    const { data: w } = await svc.from("withdrawals").select("*").eq("id", data.id).single();
    if (!w) throw new Error("Not found");
    const status =
      data.action === "approve" ? "approved" : data.action === "paid" ? "paid" : "rejected";
    if (data.action === "reject" && w.status === "pending") {
      const { data: u } = await svc.from("users").select("balance").eq("id", w.user_id).single();
      if (u) {
        await svc
          .from("users")
          .update({ balance: Number(u.balance) + Number(w.amount_dbl) })
          .eq("id", w.user_id);
        await svc.from("audit_log").insert({
          user_id: w.user_id,
          action: "withdraw_refund",
          delta: Number(w.amount_dbl),
          meta: { withdrawal_id: w.id },
        });
      }
    }
    await svc
      .from("withdrawals")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewer_note: data.note ?? null,
      })
      .eq("id", data.id);
    return { ok: true };
  });

export const adminGetEconomy = createServerFn({ method: "POST" })
  .validator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "economy:edit");
    const { db } = await import("./game.server");
    const { data: rows } = await db().from("economy_settings").select("*").order("key");
    return { settings: rows ?? [] };
  });

export const adminSetEconomy = createServerFn({ method: "POST" })
  .validator((d: { initData: string; key: string; value: unknown }) =>
    z
      .object({
        initData: z.string(),
        key: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9_.]+$/i),
        value: z.unknown(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { verified } = await requirePermission(data.initData, "economy:edit");
    const { db } = await import("./game.server");
    const svc = db();
    await svc.from("economy_settings").upsert({
      key: data.key,
      value: data.value as never,
      updated_at: new Date().toISOString(),
      updated_by: verified.user.id,
    });
    await svc.from("audit_log").insert({
      user_id: verified.user.id,
      action: "economy_update",
      meta: { key: data.key, value: data.value } as never,
    });
    return { ok: true };
  });

export const adminListRoles = createServerFn({ method: "POST" })
  .validator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "roles:manage");
    const { db } = await import("./game.server");
    const { data: rows } = await db().from("admin_roles").select("*").order("telegram_id");
    return { roles: rows ?? [], envSuperadmins: envSuperadmins() };
  });

export const adminGrantRole = createServerFn({ method: "POST" })
  .validator((d: { initData: string; telegramId: number; role: AdminRole }) =>
    z
      .object({
        initData: z.string(),
        telegramId: z.number().int().positive(),
        role: z.enum(["superadmin", "withdraw_reviewer", "economy_editor"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { verified } = await requirePermission(data.initData, "roles:manage");
    const { db } = await import("./game.server");
    await db()
      .from("admin_roles")
      .upsert({ telegram_id: data.telegramId, role: data.role, created_by: verified.user.id });
    return { ok: true };
  });

export const adminRevokeRole = createServerFn({ method: "POST" })
  .validator((d: { initData: string; telegramId: number; role: AdminRole }) =>
    z
      .object({
        initData: z.string(),
        telegramId: z.number().int().positive(),
        role: z.enum(["superadmin", "withdraw_reviewer", "economy_editor"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "roles:manage");
    const { db } = await import("./game.server");
    await db()
      .from("admin_roles")
      .delete()
      .eq("telegram_id", data.telegramId)
      .eq("role", data.role);
    return { ok: true };
  });

interface TaskRow {
  id: string;
  name: string;
  description: string;
  url: string;
  reward: number;
  kind: string;
  chat: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const adminListTasks = createServerFn({ method: "POST" })
  .validator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }): Promise<{ tasks: TaskRow[] }> => {
    await requirePermission(data.initData, "economy:edit");
    const { db } = await import("./game.server");
    const svcAny = db() as any;
    const { data: rows } = await svcAny.from("tasks").select("*").order("sort_order");
    const tasks = (rows ?? []) as unknown as TaskRow[];
    return { tasks };
  });

export const adminCreateTask = createServerFn({ method: "POST" })
  .validator(
    (d: {
      initData: string;
      id: string;
      name: string;
      description: string;
      url: string;
      reward: number;
      kind: "channel" | "external";
      chat?: string;
      sortOrder?: number;
    }) =>
      z
        .object({
          initData: z.string(),
          id: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[a-z0-9_]+$/i),
          name: z.string().min(1).max(200),
          description: z.string().max(500).default(""),
          url: z.string().max(500).default(""),
          reward: z.number().int().nonnegative(),
          kind: z.enum(["channel", "external"]),
          chat: z.string().max(100).optional(),
          sortOrder: z.number().int().default(0),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "economy:edit");
    const { db } = await import("./game.server");
    const svcAny = db() as any;
    const { error } = await svcAny.from("tasks").insert({
      id: data.id,
      name: data.name,
      description: data.description,
      url: data.url,
      reward: data.reward,
      kind: data.kind,
      chat: data.chat ?? null,
      sort_order: data.sortOrder ?? 0,
      active: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateTask = createServerFn({ method: "POST" })
  .validator(
    (d: {
      initData: string;
      id: string;
      name?: string;
      description?: string;
      url?: string;
      reward?: number;
      kind?: "channel" | "external";
      chat?: string | null;
      active?: boolean;
      sortOrder?: number;
    }) =>
      z
        .object({
          initData: z.string(),
          id: z.string().min(1),
          name: z.string().min(1).max(200).optional(),
          description: z.string().max(500).optional(),
          url: z.string().max(500).optional(),
          reward: z.number().int().nonnegative().optional(),
          kind: z.enum(["channel", "external"]).optional(),
          chat: z.string().max(100).nullable().optional(),
          active: z.boolean().optional(),
          sortOrder: z.number().int().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "economy:edit");
    const { db } = await import("./game.server");
    const svc = db();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.url !== undefined) patch.url = data.url;
    if (data.reward !== undefined) patch.reward = data.reward;
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.chat !== undefined) patch.chat = data.chat;
    if (data.active !== undefined) patch.active = data.active;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    const svcAny = svc as any;
    const { error } = await svcAny.from("tasks").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteTask = createServerFn({ method: "POST" })
  .validator((d: { initData: string; id: string }) =>
    z.object({ initData: z.string(), id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "economy:edit");
    const { db } = await import("./game.server");
    const svcAny = db() as any;
    const { error } = await svcAny.from("tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
