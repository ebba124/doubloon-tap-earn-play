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
  adminListTasks,
  adminCreateTask,
  adminUpdateTask,
  adminDeleteTask,
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
      {perms.includes("economy:edit") && <TasksSection />}
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

function TasksSection() {
  const listFn = useServerFn(adminListTasks);
  const createFn = useServerFn(adminCreateTask);
  const updateFn = useServerFn(adminUpdateTask);
  const deleteFn = useServerFn(adminDeleteTask);

  const q = useQuery({
    queryKey: ["admin", "tasks"],
    queryFn: () => listFn({ data: { initData: getInitData() } }),
  });

  const [form, setForm] = useState({
    id: "",
    name: "",
    description: "",
    url: "",
    reward: 1000,
    kind: "channel" as "channel" | "external" | "visit" | "video" | "referral_tier",
    chat: "",
    sortOrder: 0,
    visitSeconds: 15,
    thumbnailUrl: "",
    referralThreshold: 5,
    repeatable: false,
    cooldownHours: 24,
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          initData: getInitData(),
          id: form.id,
          name: form.name,
          description: form.description,
          url: form.url,
          reward: Number(form.reward),
          kind: form.kind,
          chat: form.chat || undefined,
          sortOrder: Number(form.sortOrder),
          visitSeconds: form.kind === "visit" || form.kind === "video" ? Number(form.visitSeconds) : undefined,
          thumbnailUrl: form.kind === "video" ? form.thumbnailUrl || undefined : undefined,
          referralThreshold: form.kind === "referral_tier" ? Number(form.referralThreshold) : undefined,
          repeatable: form.repeatable,
          cooldownHours: form.repeatable ? Number(form.cooldownHours) : undefined,
        },
      }),
    onSuccess: () => {
      setForm({
        id: "",
        name: "",
        description: "",
        url: "",
        reward: 1000,
        kind: "channel",
        chat: "",
        sortOrder: 0,
        visitSeconds: 15,
        thumbnailUrl: "",
        referralThreshold: 5,
        repeatable: false,
        cooldownHours: 24,
      });
      q.refetch();
    },
  });

  const toggleActive = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      updateFn({ data: { initData: getInitData(), id: v.id, active: v.active } }),
    onSuccess: () => q.refetch(),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { initData: getInitData(), id } }),
    onSuccess: () => q.refetch(),
  });

  return (
    <section className="mb-6">
      <h2 className="font-bold mb-2">Tasks</h2>

      <div className="list-row flex-col items-stretch mb-3 gap-2">
        <input
          className="ghost-btn text-left"
          placeholder="id (e.g. join_extra_channel)"
          value={form.id}
          onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.replace(/[^a-z0-9_]/gi, "") }))}
        />
        <input
          className="ghost-btn text-left"
          placeholder="Task name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          className="ghost-btn text-left"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <input
          className="ghost-btn text-left"
          placeholder="URL (channel link, or blank for external)"
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
        />
        <div className="flex gap-2">
          <input
            className="ghost-btn text-left flex-1"
            type="number"
            placeholder="Reward (DBL)"
            value={form.reward}
            onChange={(e) => setForm((f) => ({ ...f, reward: Number(e.target.value) }))}
          />
          <select
            className="ghost-btn text-left flex-1"
            value={form.kind}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                kind: e.target.value as "channel" | "external" | "visit" | "video" | "referral_tier",
              }))
            }
          >
            <option value="channel">channel</option>
            <option value="external">external</option>
            <option value="visit">visit (timed link)</option>
            <option value="video">video (thumbnail + timed link)</option>
            <option value="referral_tier">referral_tier</option>
          </select>
        </div>
        {form.kind === "channel" && (
          <input
            className="ghost-btn text-left"
            placeholder="Chat @username (for membership check)"
            value={form.chat}
            onChange={(e) => setForm((f) => ({ ...f, chat: e.target.value }))}
          />
        )}
        {(form.kind === "visit" || form.kind === "video") && (
          <input
            className="ghost-btn text-left"
            type="number"
            placeholder="Seconds to wait before claim"
            value={form.visitSeconds}
            onChange={(e) => setForm((f) => ({ ...f, visitSeconds: Number(e.target.value) }))}
          />
        )}
        {form.kind === "video" && (
          <input
            className="ghost-btn text-left"
            placeholder="Thumbnail image URL"
            value={form.thumbnailUrl}
            onChange={(e) => setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))}
          />
        )}
        {form.kind === "referral_tier" && (
          <input
            className="ghost-btn text-left"
            type="number"
            placeholder="Friends required"
            value={form.referralThreshold}
            onChange={(e) => setForm((f) => ({ ...f, referralThreshold: Number(e.target.value) }))}
          />
        )}
        <label className="flex items-center gap-2 text-sm px-1">
          <input
            type="checkbox"
            checked={form.repeatable}
            onChange={(e) => setForm((f) => ({ ...f, repeatable: e.target.checked }))}
          />
          Repeatable (resets after cooldown)
        </label>
        {form.repeatable && (
          <input
            className="ghost-btn text-left"
            type="number"
            placeholder="Cooldown hours (e.g. 24 for daily)"
            value={form.cooldownHours}
            onChange={(e) => setForm((f) => ({ ...f, cooldownHours: Number(e.target.value) }))}
          />
        )}
        <input
          className="ghost-btn text-left"
          type="number"
          placeholder="Sort order"
          value={form.sortOrder}
          onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
        />
        <button
          className="primary-btn mt-1"
          disabled={!form.id || !form.name || create.isPending}
          onClick={() => create.mutate()}
        >
          Add task
        </button>
        {create.error && (
          <div className="text-xs text-[var(--destructive)] mt-1">
            {(create.error as Error).message}
          </div>
        )}
      </div>

      {(q.data?.tasks ?? []).map((t: any) => (
        <div key={t.id as string} className="list-row mb-2 flex-col items-stretch">
          <div className="flex justify-between">
            <div>
              <div className="font-semibold">
                {t.name as string} <span className="text-xs text-[var(--muted-foreground)]">({t.id as string})</span>
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">{t.description as string}</div>
              <div className="text-sm text-[var(--gold)] font-bold mt-1">
                {t.reward as number} DBL · {t.kind as string}
                {t.chat ? ` · ${t.chat as string}` : ""}
              </div>
            </div>
            <span className="badge">{t.active ? "active" : "disabled"}</span>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              className="ghost-btn flex-1"
              onClick={() => toggleActive.mutate({ id: t.id as string, active: !t.active })}
            >
              {t.active ? "Disable" : "Enable"}
            </button>
            <button
              className="ghost-btn flex-1"
              style={{ color: "var(--destructive)" }}
              onClick={() => {
                if (confirm(`Delete task "${t.name}"? This cannot be undone.`)) {
                  del.mutate(t.id as string);
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
