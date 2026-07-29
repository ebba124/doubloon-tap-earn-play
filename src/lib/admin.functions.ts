import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function verifyAdmin(initData: string) {
  const { verifyTelegramInitData, devBypassUser } = await import("./telegram-verify.server");
  const v =
    devBypassUser(initData) ??
    verifyTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN ?? "");
  const admins = (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean);
  if (!admins.includes(v.user.id)) throw new Error("Not an admin");
  return v;
}
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const adminOverview = createServerFn({ method: "POST" })
  .inputValidator((d: { initData: string }) => z.object({ initData: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await verifyAdmin(data.initData);
    const svc = await db();
    const [{ count: users }, { count: pending }, { data: recent }] = await Promise.all([
      svc.from("users").select("*", { count: "exact", head: true }),
      svc.from("withdrawals").select("*", { count: "exact", head: true }).eq("status", "pending"),
      svc
        .from("withdrawals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return { userCount: users ?? 0, pendingCount: pending ?? 0, withdrawals: recent ?? [] };
  });

export const adminReviewWithdrawal = createServerFn({ method: "POST" })
  .inputValidator(
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
    await verifyAdmin(data.initData);
    const svc = await db();
    const { data: w } = await svc.from("withdrawals").select("*").eq("id", data.id).single();
    if (!w) throw new Error("Not found");
    const status =
      data.action === "approve" ? "approved" : data.action === "paid" ? "paid" : "rejected";
    if (data.action === "reject" && w.status === "pending") {
      // Refund
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
      .update({ status, reviewed_at: new Date().toISOString(), reviewer_note: data.note ?? null })
      .eq("id", data.id);
    return { ok: true };
  });
