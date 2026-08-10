import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetEconomy,
  adminGrantRole,
  adminListRoles,
  adminMe,
  adminOverview,
  adminReviewWithdrawal,
  adminRevokeRole,
  adminSetEconomy,
} from "@/lib/admin.functions";
import { getInitData, getWebApp } from "@/lib/telegram-webapp";
import { useEffect, useMemo, useState } from "react";

type Role = "superadmin" | "withdraw_reviewer" | "economy_editor";
type Perm = "withdrawals:review" | "economy:edit" | "roles:manage" | "overview:view";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Doubloon Tap Admin" },
      { name: "description", content: "Doubloon Tap operator dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [ready, setReady] = useState(false);
  const meFn = useServerFn(adminMe);
  useEffect(() => {
    getWebApp()?.ready();
    setReady(true);
  }, []);

  const me = useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => meFn({ data: { initData: getInitData() } }),
    enabled: ready,
    retry: false,
  });

  if (!ready || me.isLoading) return <div className="p-4">Loading…</div>;
  if (me.error)
    return (
      <div className="p-4">
        <h1 className="font-bold text-xl">Admin</h1>
        <p className="text-[var(--destructive)] mt-2">{(me.error as Error).message}</p>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">
          Open inside Telegram as a staff member. Superadmins are configured via ADMIN_TELEGRAM_IDS;
          other roles are granted from this page.
        </p>
      </div>
    );

  const perms = (me.data?.permissions ?? []) as Perm[];
  const roles = (me.data?.roles ?? []) as Role[];
  if (perms.length === 0)
    return (
      <div className="p-4">
        <h1 className="font-bold text-xl">Admin</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          Signed in as {me.data?.telegramId} but no admin roles are assigned.
        </p>
      </div>
    );

  return (
    <div className="app-shell px-4 pb-8">
      <header className="my-4">
        <h1 className="text-xl font-bold">🛠 Admin</h1>
        <div className="text-xs text-[var(--muted-foreground)] mt-1">
          {me.data?.telegramId} · roles: {roles.join(", ") || "—"}
        </div>
      </header>

      {perms.includes("overview:view") && (
        <OverviewSection canReview={perms.includes("withdrawals:review")} />
      )}
      {perms.includes("economy:edit") && <EconomySection />}
      {perms.includes("roles:manage") && <RolesSection />}
    </div>
  );
}

function OverviewSection({ canReview }: { canReview: boolean }) {
  const overviewFn = useServerFn(adminOverview);
  const reviewFn = useServerFn(adminReviewWithdrawal);
  const q = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => overviewFn({ data: { initData: getInitData() } }),
  });
  const mut = useMutation({
    mutationFn: (v: { id: number; action: "approve" | "reject" | "paid" }) =>
      reviewFn({ data: { initData: getInitData(), ...v } }),
    onSuccess: () => q.refetch(),
  });

  if (q.isLoading || !q.data) return <div className="mb-4">Loading overview…</div>;
  const d = q.data;

  return (
    <section className="mb-6">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="stat-card">
          <div className="text-xs text-[var(--muted-foreground)]">Users</div>
          <div className="text-xl font-bold">{d.userCount}</div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-[var(--muted-foreground)]">Pending withdrawals</div>
          <div className="text-xl font-bold">{d.pendingCount}</div>
        </div>
      </div>
      <h2 className="font-bold mb-2">Withdrawals</h2>
      {d.withdrawals.map((w: Record<string, unknown>) => (
        <div key={w.id as string} className="list-row mb-2 flex-col items-stretch">
          <div className="flex justify-between">
            <div>
              <div className="font-semibold">
                {w.amount_dbl as number} DBL → {Number(w.amount_usdt).toFixed(2)} USDT
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                user {w.user_id as string} · {w.method as string} · {w.address as string}
              </div>
            </div>
            <span className="badge">{w.status as string}</span>
          </div>
          {canReview ? (
            <>
              {w.status === "pending" && (
                <div className="flex gap-2 mt-2">
                  <button
                    className="ghost-btn flex-1"
                    onClick={() => mut.mutate({ id: w.id as number, action: "reject" })}
                  >
                    Reject & refund
                  </button>
                  <button
                    className="primary-btn flex-1"
                    onClick={() => mut.mutate({ id: w.id as number, action: "approve" })}
                  >
                    Approve
                  </button>
                </div>
              )}
              {w.status === "approved" && (
                <button
                  className="primary-btn mt-2"
                  onClick={() => mut.mutate({ id: w.id as number, action: "paid" })}
                >
                  Mark paid
                </button>
              )}
            </>
          ) : (
            <div className="text-xs text-[var(--muted-foreground)] mt-2">
              Read-only (no withdrawals:review permission).
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function EconomySection() {
  const getFn = useServerFn(adminGetEconomy);
  const setFn = useServerFn(adminSetEconomy);
  const q = useQuery({
    queryKey: ["admin", "economy"],
    queryFn: () => getFn({ data: { initData: getInitData() } }),
  });
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const mut = useMutation({
    mutationFn: (v: { key: string; value: unknown }) =>
      setFn({ data: { initData: getInitData(), ...v } }),
    onSuccess: () => {
      setKey("");
      setValue("");
      q.refetch();
    },
  });

  const submit = () => {
    let parsed: unknown = value;
    try {
      parsed = JSON.parse(value);
    } catch {
      // keep raw string
    }
    mut.mutate({ key, value: parsed });
  };

  return (
    <section className="mb-6">
      <h2 className="font-bold mb-2">Economy settings</h2>
      <div className="list-row flex-col items-stretch mb-3">
        <input
          className="ghost-btn text-left"
          placeholder="key (e.g. tap.base_reward)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <input
          className="ghost-btn text-left mt-2"
          placeholder='value (JSON, e.g. 1.25 or "text")'
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className="primary-btn mt-2"
          disabled={!key || !value || mut.isPending}
          onClick={submit}
        >
          Save
        </button>
        {mut.error && (
          <div className="text-xs text-[var(--destructive)] mt-1">
            {(mut.error as Error).message}
          </div>
        )}
      </div>
      {(q.data?.settings ?? []).map((s: Record<string, unknown>) => (
        <div key={s.key as string} className="list-row mb-2">
          <div>
            <div className="font-semibold">{s.key as string}</div>
            <div className="text-xs text-[var(--muted-foreground)]">{JSON.stringify(s.value)}</div>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            by {(s.updated_by as string) ?? "—"}
          </div>
        </div>
      ))}
    </section>
  );
}

function RolesSection() {
  const listFn = useServerFn(adminListRoles);
  const grantFn = useServerFn(adminGrantRole);
  const revokeFn = useServerFn(adminRevokeRole);
  const q = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: () => listFn({ data: { initData: getInitData() } }),
  });
  const [tid, setTid] = useState("");
  const [role, setRole] = useState<Role>("withdraw_reviewer");
  const grant = useMutation({
    mutationFn: (v: { telegramId: number; role: Role }) =>
      grantFn({ data: { initData: getInitData(), ...v } }),
    onSuccess: () => {
      setTid("");
      q.refetch();
    },
  });
  const revoke = useMutation({
    mutationFn: (v: { telegramId: number; role: Role }) =>
      revokeFn({ data: { initData: getInitData(), ...v } }),
    onSuccess: () => q.refetch(),
  });

  const grouped = useMemo(() => {
    const m = new Map<number, Role[]>();
    for (const r of q.data?.roles ?? []) {
      const arr = m.get(r.telegram_id) ?? [];
      arr.push(r.role as Role);
      m.set(r.telegram_id, arr);
    }
    return [...m.entries()];
  }, [q.data]);

  return (
    <section className="mb-6">
      <h2 className="font-bold mb-2">Staff & roles</h2>
      <div className="list-row flex-col items-stretch mb-3">
        <input
          className="ghost-btn text-left"
          placeholder="Telegram user id"
          value={tid}
          onChange={(e) => setTid(e.target.value.replace(/[^0-9]/g, ""))}
        />
        <select
          className="ghost-btn text-left mt-2"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="withdraw_reviewer">withdraw_reviewer</option>
          <option value="economy_editor">economy_editor</option>
          <option value="superadmin">superadmin</option>
        </select>
        <button
          className="primary-btn mt-2"
          disabled={!tid || grant.isPending}
          onClick={() => grant.mutate({ telegramId: Number(tid), role })}
        >
          Grant role
        </button>
      </div>

      {(q.data?.envSuperadmins ?? []).length > 0 && (
        <div className="text-xs text-[var(--muted-foreground)] mb-2">
          Env superadmins: {(q.data!.envSuperadmins as number[]).join(", ")}
        </div>
      )}

      {grouped.map(([telegramId, rs]) => (
        <div key={telegramId} className="list-row mb-2 flex-col items-stretch">
          <div className="font-semibold">{telegramId}</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {rs.map((r) => (
              <button
                key={r}
                className="badge"
                onClick={() => revoke.mutate({ telegramId, role: r })}
                title="Click to revoke"
              >
                {r} ✕
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
