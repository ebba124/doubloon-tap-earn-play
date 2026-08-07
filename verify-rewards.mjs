import { createClient } from "@supabase/supabase-js";
const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const uid = 999000001;
await svc.from("audit_log").delete().eq("user_id", uid);
await svc.from("tasks_done").delete().eq("user_id", uid);
await svc.from("achievements").delete().eq("user_id", uid);
await svc.from("users").delete().eq("id", uid);
const ins = await svc.from("users").insert({ id: uid, username: "verify", first_name: "Verify" });
console.log("[v0] insert error:", ins.error);
const before = await svc.from("users").select("balance,xp,level,gems").eq("id", uid).single();
console.log("[v0] initial:", before.data, "err:", before.error?.message);

async function grant(delta, xp, action) {
  const u = (await svc.from("users").select("*").eq("id", uid).single()).data;
  const { data: fresh } = await svc
    .from("users")
    .update({ balance: Number(u.balance) + delta, xp: Number(u.xp) + xp })
    .eq("id", uid)
    .select("balance,xp")
    .single();
  await svc.from("audit_log").insert({ user_id: uid, action, delta });
  return fresh;
}
console.log("[v0] after daily (+500):", await grant(500, 40, "daily_claim"));
console.log("[v0] after task (+250):", await grant(250, 20, "task_complete"));
const afterSpin = await grant(1000, 10, "spin");
console.log("[v0] after spin (+1000):", afterSpin);
const finalBal = Number(afterSpin.balance);
console.log("[v0] expected 1750, got", finalBal, finalBal === 1750 ? "PASS" : "FAIL");
console.log(
  "[v0] audit trail:",
  (await svc.from("audit_log").select("action,delta").eq("user_id", uid).order("created_at")).data,
);
await svc.from("audit_log").delete().eq("user_id", uid);
await svc.from("users").delete().eq("id", uid);
console.log("[v0] cleaned up");
