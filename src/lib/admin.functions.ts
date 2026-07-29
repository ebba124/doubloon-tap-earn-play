import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AdminRole = "superadmin" | "withdraw_reviewer" | "economy_editor";
export type AdminPermission =
  | "withdrawals:review"
  | "economy:edit"
  | "roles:manage"
  | "overview:view";

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  superadmin: ["withdrawals:review", "economy:edit", "roles:manage", "overview:view"],
  withdraw_reviewer: ["withdrawals:review", "overview:view"],
  economy_editor: ["economy:edit", "overview:view"],
};

function envSuperadmins(): number[] {
  return (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean);
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
  .inputValidator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { verifyInitData } = await import("./game.server");
    const v = await verifyInitData(data.initData);
    const roles = await getRolesForUser(v.user.id);
    return { telegramId: v.user.id, roles, permissions: permsFor(roles) };
  });

export const adminOverview = createServerFn({ method: "POST" })
  .inputValidator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "overview:view");
    const { db } = await import("./game.server");
    const svc = db();
    const [{ count: users }, { count: pending }, { data: recent }] = await Promise.all([
      svc.from("users").select("*", { count: "exact", head: true }),
      svc
        .from("withdrawals")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      svc.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    return { userCount: users ?? 0, pendingCount: pending ?? 0, withdrawals: recent ?? [] };
  });

export const adminReviewWithdrawal = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      initData: string;
      id: number;
      action: "approve" | "reject" | "paid";
      note?: string;
    }) =>
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
  .inputValidator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "economy:edit");
    const { db } = await import("./game.server");
    const { data: rows } = await db().from("economy_settings").select("*").order("key");
    return { settings: rows ?? [] };
  });

export const adminSetEconomy = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { initData: string; key: string; value: unknown }) =>
      z
        .object({
          initData: z.string(),
          key: z.string().min(1).max(64).regex(/^[a-z0-9_.]+$/i),
          value: z.unknown(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const { verified } = await requirePermission(data.initData, "economy:edit");
    const { db } = await import("./game.server");
    const svc = db();
    await svc
      .from("economy_settings")
      .upsert({
        key: data.key,
        value: data.value as never,
        updated_at: new Date().toISOString(),
        updated_by: verified.user.id,
      });
    await svc.from("audit_log").insert({
      user_id: verified.user.id,
      action: "economy_update",
      meta: { key: data.key, value: data.value },
    });
    return { ok: true };
  });

export const adminListRoles = createServerFn({ method: "POST" })
  .inputValidator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.initData, "roles:manage");
    const { db } = await import("./game.server");
    const { data: rows } = await db()
      .from("admin_roles")
      .select("*")
      .order("telegram_id");
    return { roles: rows ?? [], envSuperadmins: envSuperadmins() };
  });

export const adminGrantRole = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { initData: string; telegramId: number; role: AdminRole }) =>
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
  .inputValidator(
    (d: { initData: string; telegramId: number; role: AdminRole }) =>
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
