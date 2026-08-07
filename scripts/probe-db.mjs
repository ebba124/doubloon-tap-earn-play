import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const svc = createClient(url, key, { auth: { persistSession: false } });

const { data: users, error } = await svc
  .from("users")
  .select("*")
  .order("balance", { ascending: false })
  .limit(3);
console.log("[v0] users error:", error?.message ?? null);
console.log("[v0] user columns:", users?.[0] ? Object.keys(users[0]).join(",") : "none");
console.log(
  "[v0] top:",
  (users ?? []).map((u) => ({ id: u.id, bal: u.balance, lvl: u.level, xp: u.xp, gems: u.gems })),
);

const { count } = await svc.from("users").select("*", { count: "exact", head: true });
console.log("[v0] total users:", count);

for (const t of [
  "achievements",
  "idempotency",
  "tasks_done",
  "referrals",
  "audit_log",
  "withdrawals",
  "pending_referrals",
]) {
  const { error: e, count: c } = await svc.from(t).select("*", { count: "exact", head: true });
  console.log(`[v0] table ${t}:`, e ? `ERROR ${e.message}` : `${c} rows`);
}
