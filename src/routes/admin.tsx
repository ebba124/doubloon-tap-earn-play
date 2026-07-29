import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminOverview, adminReviewWithdrawal } from "@/lib/admin.functions";
import { getInitData, getWebApp } from "@/lib/telegram-webapp";
import { useEffect, useState } from "react";

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
  useEffect(() => {
    getWebApp()?.ready();
    setReady(true);
  }, []);
  if (!ready) return null;

  const overviewFn = useServerFn(adminOverview);
  const reviewFn = useServerFn(adminReviewWithdrawal);
  const q = useQuery({
    queryKey: ["admin"],
    queryFn: () => overviewFn({ data: { initData: getInitData() } }),
  });
  const mut = useMutation({
    mutationFn: (v: { id: number; action: "approve" | "reject" | "paid" }) =>
      reviewFn({ data: { initData: getInitData(), ...v } }),
    onSuccess: () => q.refetch(),
  });

  if (q.isLoading) return <div className="p-4">Loading…</div>;
  if (q.error)
    return (
      <div className="p-4">
        <h1 className="font-bold text-xl">Admin</h1>
        <p className="text-[var(--destructive)] mt-2">{(q.error as Error).message}</p>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">
          Open this page inside Telegram as an admin (your Telegram user id must be in
          ADMIN_TELEGRAM_IDS).
        </p>
      </div>
    );

  const d = q.data!;
  return (
    <div className="app-shell px-4">
      <h1 className="text-xl font-bold my-4">🛠 Admin</h1>
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
      {d.withdrawals.map((w: any) => (
        <div key={w.id} className="list-row mb-2 flex-col items-stretch">
          <div className="flex justify-between">
            <div>
              <div className="font-semibold">
                {w.amount_dbl} DBL → {Number(w.amount_usdt).toFixed(2)} USDT
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                user {w.user_id} · {w.method} · {w.address}
              </div>
            </div>
            <span className="badge">{w.status}</span>
          </div>
          {w.status === "pending" && (
            <div className="flex gap-2 mt-2">
              <button
                className="ghost-btn flex-1"
                onClick={() => mut.mutate({ id: w.id, action: "reject" })}
              >
                Reject & refund
              </button>
              <button
                className="primary-btn flex-1"
                onClick={() => mut.mutate({ id: w.id, action: "approve" })}
              >
                Approve
              </button>
            </div>
          )}
          {w.status === "approved" && (
            <button
              className="primary-btn mt-2"
              onClick={() => mut.mutate({ id: w.id, action: "paid" })}
            >
              Mark paid
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
