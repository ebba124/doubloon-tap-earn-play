import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getSession,
  tap,
  claimDaily,
  buyBoost,
  completeTask,
  requestWithdraw,
  getLeaderboard,
} from "@/lib/game.functions";
import { getInitData, getWebApp, haptic, makeNonce } from "@/lib/telegram-webapp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Doubloon Tap — Tap to Earn DBL" },
      {
        name: "description",
        content:
          "Tap the doubloon, complete quests, invite friends, and cash out to USDT. The Telegram tap-to-earn game.",
      },
      { property: "og:title", content: "Doubloon Tap — Tap to Earn DBL" },
      {
        property: "og:description",
        content:
          "Tap. Boost. Invite. Withdraw. Play Doubloon Tap on Telegram.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DoubloonTap,
});

function formatNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

type Tab = "earn" | "tasks" | "friends" | "boosts" | "wallet";

function SplashLoader() {
  return (
    <div className="app-shell items-center justify-center flex text-[var(--muted-foreground)]">
      <div className="coin-btn" style={{ width: 120, fontSize: "2.5rem", opacity: 0.6 }}>
        D
      </div>
    </div>
  );
}

function AuthError({ message }: { message: string }) {
  return (
    <div className="app-shell items-center justify-center flex flex-col gap-3 p-6 text-center">
      <div className="text-4xl">🪙</div>
      <h1 className="text-xl font-bold">Open inside Telegram</h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        Doubloon Tap is a Telegram Mini App. Launch it from{" "}
        <a
          href="https://t.me/DoubloonTapBot"
          className="text-[var(--gold)] underline"
        >
          @DoubloonTapBot
        </a>{" "}
        to play.
      </p>
      <p className="text-xs text-[var(--destructive)] mt-2">{message}</p>
    </div>
  );
}

function DoubloonTap() {
  const [tab, setTab] = useState<Tab>("earn");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const tg = getWebApp();
    tg?.ready();
    tg?.expand();
    setReady(true);
  }, []);

  if (!ready) return null;
  return <App tab={tab} setTab={setTab} />;
}

function App({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const initData = getInitData();
  const getSessionFn = useServerFn(getSession);
  const { data, isLoading, error } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSessionFn({ data: { initData } }),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    retry: false,
  });

  if (isLoading) return <SplashLoader />;
  if (error || !data) return <AuthError message={(error as Error)?.message ?? "Session failed"} />;

  return (
    <div className="app-shell">
      <Header user={data.user} />
      {tab === "earn" && <EarnTab session={data} />}
      {tab === "tasks" && <TasksTab session={data} />}
      {tab === "friends" && <FriendsTab session={data} />}
      {tab === "boosts" && <BoostsTab session={data} />}
      {tab === "wallet" && <WalletTab session={data} />}
      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}

function Header({ user }: { user: any }) {
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    `Player #${user.id}`;
  return (
    <div className="flex items-center gap-3 p-4">
      {user.photo_url ? (
        <img
          src={user.photo_url}
          alt=""
          className="w-10 h-10 rounded-full border-2 border-[var(--gold)]"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[var(--accent)] grid place-items-center font-bold text-[var(--gold)]">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{name}</div>
        <div className="text-xs text-[var(--muted-foreground)]">
          {user.username ? `@${user.username}` : `id ${user.id}`}
        </div>
      </div>
    </div>
  );
}

function EarnTab({ session }: { session: any }) {
  const qc = useQueryClient();
  const tapFn = useServerFn(tap);
  const claimFn = useServerFn(claimDaily);
  const [localBalance, setLocalBalance] = useState<number>(Number(session.user.balance));
  const [localEnergy, setLocalEnergy] = useState<number>(session.user.energy);
  const [floats, setFloats] = useState<{ id: number; x: number; y: number; v: number }[]>([]);
  const pending = useRef<number>(0);
  const nonce = useRef<string>(makeNonce());
  const flushT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalBalance(Number(session.user.balance));
    setLocalEnergy(session.user.energy);
  }, [session.user.balance, session.user.energy]);

  // Client-side energy regen animation
  useEffect(() => {
    const i = setInterval(() => {
      setLocalEnergy((e) =>
        Math.min(session.user.energy_max, e + Number(session.user.energy_regen_per_sec)),
      );
    }, 1000);
    return () => clearInterval(i);
  }, [session.user.energy_max, session.user.energy_regen_per_sec]);

  const flush = async () => {
    if (pending.current <= 0) return;
    const taps = pending.current;
    pending.current = 0;
    const currentNonce = nonce.current;
    nonce.current = makeNonce();
    try {
      const res = await tapFn({ data: { initData: getInitData(), taps, nonce: currentNonce } });
      setLocalBalance(Number(res.user.balance));
      setLocalEnergy(res.user.energy);
      qc.setQueryData(["session"], (prev: any) => (prev ? { ...prev, user: res.user } : prev));
    } catch (e) {
      console.error(e);
    }
  };

  const handleTap = (e: React.PointerEvent) => {
    if (localEnergy < session.user.tap_value) return;
    haptic("light");
    const perTap =
      Number(session.user.tap_value) * Number(session.user.tap_multiplier_permanent || 1);
    setLocalBalance((b) => b + perTap);
    setLocalEnergy((en) => Math.max(0, en - session.user.tap_value));
    pending.current += 1;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const id = Date.now() + Math.random();
    setFloats((f) => [
      ...f.slice(-8),
      {
        id,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        v: perTap,
      },
    ]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
    if (flushT.current) clearTimeout(flushT.current);
    flushT.current = setTimeout(flush, 400);
  };

  const dailyMut = useMutation({
    mutationFn: () => claimFn({ data: { initData: getInitData() } }),
    onSuccess: (r) => {
      if (r.reason === "ok") {
        haptic("medium");
        qc.setQueryData(["session"], (prev: any) => (prev ? { ...prev, user: r.user } : prev));
        getWebApp()?.showAlert?.(`+${formatNum(r.claimed)} DBL — Day ${r.day}`);
      } else {
        getWebApp()?.showAlert?.("Come back in 20+ hours for your next daily.");
      }
    },
  });

  const canDaily = useMemo(() => {
    if (!session.user.last_daily_claim) return true;
    const hrs = (Date.now() - new Date(session.user.last_daily_claim).getTime()) / 3.6e6;
    return hrs >= 20;
  }, [session.user.last_daily_claim]);

  return (
    <div className="flex flex-col items-center px-4 gap-4">
      <div className="balance-hero">
        <span>🪙</span>
        <span>{formatNum(localBalance)}</span>
        <span className="text-sm text-[var(--muted-foreground)] font-semibold">DBL</span>
      </div>

      <button
        className="primary-btn"
        style={{ maxWidth: 320 }}
        disabled={!canDaily || dailyMut.isPending}
        onClick={() => dailyMut.mutate()}
      >
        {canDaily ? "🎁 Claim daily reward" : "Daily claimed ✓"}
      </button>

      <div
        className="relative"
        onPointerDown={handleTap}
        style={{ touchAction: "manipulation" }}
      >
        <div className="coin-btn">D</div>
        {floats.map((f) => (
          <div
            key={f.id}
            className="tap-float"
            style={{ left: f.x, top: f.y }}
          >
            +{f.v}
          </div>
        ))}
      </div>

      <div className="w-full">
        <div className="flex justify-between text-sm mb-1">
          <span>⚡ Energy</span>
          <span className="font-semibold">
            {Math.floor(localEnergy)} / {session.user.energy_max}
          </span>
        </div>
        <div className="h-3 rounded-full bg-[var(--muted)] overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${(localEnergy / session.user.energy_max) * 100}%`,
              background:
                "linear-gradient(90deg, var(--gold-dark), var(--gold))",
              transition: "width 300ms ease",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full mt-2">
        <div className="stat-card">
          <div className="text-xs text-[var(--muted-foreground)]">Per tap</div>
          <div className="font-bold text-lg">
            +
            {Number(session.user.tap_value) *
              Number(session.user.tap_multiplier_permanent || 1)}{" "}
            DBL
          </div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-[var(--muted-foreground)]">Streak</div>
          <div className="font-bold text-lg">Day {session.user.streak_day || 0}</div>
        </div>
      </div>
    </div>
  );
}

function TasksTab({ session }: { session: any }) {
  const qc = useQueryClient();
  const completeFn = useServerFn(completeTask);
  const mut = useMutation({
    mutationFn: (taskId: string) =>
      completeFn({ data: { initData: getInitData(), taskId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
    onError: (e: any) => getWebApp()?.showAlert?.(e.message ?? "Failed"),
  });

  return (
    <div className="px-4 flex flex-col gap-3">
      <h2 className="text-xl font-bold">Tasks</h2>
      {session.tasks.map((t: any) => {
        const done = session.tasksDone.includes(t.id);
        return (
          <div key={t.id} className="list-row">
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs text-[var(--muted-foreground)]">{t.description}</div>
              <div className="text-sm text-[var(--gold)] font-bold mt-1">
                +{formatNum(t.reward)} DBL
              </div>
            </div>
            {done ? (
              <span className="badge">✓ Done</span>
            ) : t.kind === "channel" ? (
              <div className="flex flex-col gap-2">
                <button
                  className="ghost-btn"
                  onClick={() => getWebApp()?.openTelegramLink?.(t.url)}
                >
                  Join
                </button>
                <button
                  className="primary-btn"
                  style={{ padding: "6px 12px" }}
                  onClick={() => mut.mutate(t.id)}
                  disabled={mut.isPending}
                >
                  Claim
                </button>
              </div>
            ) : (
              <button
                className="primary-btn"
                style={{ width: "auto" }}
                onClick={() => mut.mutate(t.id)}
                disabled={mut.isPending}
              >
                Claim
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FriendsTab({ session }: { session: any }) {
  const link = `https://t.me/${session.config.botUsername}?start=ref_${session.user.id}`;
  const shareText = encodeURIComponent(
    `🪙 Join me on Doubloon Tap and earn DBL! ${link}`,
  );
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${shareText}`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="px-4 flex flex-col gap-3">
      <h2 className="text-xl font-bold">Invite friends</h2>
      <div className="stat-card">
        <div className="text-sm text-[var(--muted-foreground)]">Your referral link</div>
        <div className="mt-1 break-all text-sm font-mono">{link}</div>
        <div className="flex gap-2 mt-3">
          <button
            className="ghost-btn flex-1"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch {}
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button
            className="primary-btn flex-1"
            onClick={() => getWebApp()?.openTelegramLink?.(shareUrl)}
          >
            Share
          </button>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--muted-foreground)]">50-friend milestone</div>
            <div className="font-bold">
              +{formatNum(session.milestone.bonus)} DBL & permanent 2× tap
            </div>
          </div>
          <span className="badge">
            {session.referralCount}/{session.milestone.target}
          </span>
        </div>
        <div className="h-2 rounded-full bg-[var(--muted)] mt-2 overflow-hidden">
          <div
            className="h-full bg-[var(--gold)]"
            style={{
              width: `${Math.min(100, (session.referralCount / session.milestone.target) * 100)}%`,
            }}
          />
        </div>
      </div>

      <h3 className="font-bold mt-2">Your friends ({session.referrals.length})</h3>
      {session.referrals.length === 0 ? (
        <div className="text-sm text-[var(--muted-foreground)]">
          No friends yet — share your link to start earning.
        </div>
      ) : (
        session.referrals.map((r: any) => (
          <div key={r.id} className="list-row">
            <div className="flex items-center gap-3">
              {r.photo_url ? (
                <img src={r.photo_url} className="w-8 h-8 rounded-full" alt="" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--accent)] grid place-items-center text-xs font-bold">
                  {(r.first_name ?? "?").slice(0, 1)}
                </div>
              )}
              <div>
                <div className="font-semibold text-sm">
                  {r.first_name ?? r.username ?? `#${r.id}`}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {formatNum(r.balance)} DBL
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function BoostsTab({ session }: { session: any }) {
  const qc = useQueryClient();
  const buyFn = useServerFn(buyBoost);
  const mut = useMutation({
    mutationFn: (id: string) =>
      buyFn({ data: { initData: getInitData(), boostId: id, nonce: makeNonce() } }),
    onSuccess: (r) => {
      haptic("medium");
      qc.setQueryData(["session"], (prev: any) => (prev ? { ...prev, user: r.user } : prev));
    },
    onError: (e: any) => getWebApp()?.showAlert?.(e.message ?? "Failed"),
  });

  const level = (id: string) =>
    id === "multitap" ? session.user.multitap_level : session.user.energy_limit_level;
  const cost = (id: string, base = 1000, mult = 2) => {
    const lvl = level(id);
    return Math.floor(base * Math.pow(mult, lvl - 1));
  };

  return (
    <div className="px-4 flex flex-col gap-3">
      <h2 className="text-xl font-bold">Boosts</h2>
      <div className="text-sm text-[var(--muted-foreground)]">
        Balance: <span className="text-[var(--gold)] font-bold">{formatNum(Number(session.user.balance))} DBL</span>
      </div>
      {session.boosts.map((b: any) => {
        const lvl = level(b.id);
        const c = cost(b.id);
        const maxed = lvl >= b.maxLevel;
        return (
          <div key={b.id} className="list-row">
            <div className="flex-1">
              <div className="font-semibold">
                {b.name} <span className="text-xs text-[var(--muted-foreground)]">Lv {lvl}</span>
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">{b.description}</div>
              {!maxed && (
                <div className="text-sm text-[var(--gold)] font-bold mt-1">
                  Cost: {formatNum(c)} DBL
                </div>
              )}
            </div>
            <button
              className="primary-btn"
              style={{ width: "auto" }}
              disabled={maxed || Number(session.user.balance) < c || mut.isPending}
              onClick={() => mut.mutate(b.id)}
            >
              {maxed ? "MAX" : "Buy"}
            </button>
          </div>
        );
      })}

      <div className="stat-card mt-3">
        <div className="font-bold text-[var(--gold)]">🏆 50-friend milestone</div>
        <div className="text-xs text-[var(--muted-foreground)]">
          {session.milestone.achieved
            ? "Unlocked — permanent 2× tap value applied."
            : `Invite ${session.milestone.target - session.referralCount} more friends to unlock permanent 2× tap and +${formatNum(session.milestone.bonus)} DBL.`}
        </div>
      </div>
    </div>
  );
}

function WalletTab({ session }: { session: any }) {
  const qc = useQueryClient();
  const withdrawFn = useServerFn(requestWithdraw);
  const [method, setMethod] = useState(session.config.withdrawMethods[0]?.id);
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState<number>(session.config.minWithdrawDbl);
  const mut = useMutation({
    mutationFn: () =>
      withdrawFn({
        data: {
          initData: getInitData(),
          amount_dbl: Number(amount),
          method,
          address,
        },
      }),
    onSuccess: () => {
      haptic("medium");
      setAddress("");
      qc.invalidateQueries({ queryKey: ["session"] });
      getWebApp()?.showAlert?.("Withdrawal request submitted.");
    },
    onError: (e: any) => getWebApp()?.showAlert?.(e.message ?? "Failed"),
  });

  const usdt = (Number(amount) || 0) / session.config.dblPerUsdt;

  return (
    <div className="px-4 flex flex-col gap-3">
      <h2 className="text-xl font-bold">Wallet</h2>
      <div className="stat-card">
        <div className="text-xs text-[var(--muted-foreground)]">Balance</div>
        <div className="balance-hero" style={{ fontSize: "1.75rem" }}>
          🪙 {formatNum(Number(session.user.balance))} <span className="text-sm">DBL</span>
        </div>
        <div className="text-sm text-[var(--muted-foreground)] mt-1">
          ≈ {(Number(session.user.balance) / session.config.dblPerUsdt).toFixed(2)} USDT
        </div>
      </div>

      <div className="stat-card flex flex-col gap-3">
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">Amount (DBL)</label>
          <input
            type="number"
            min={session.config.minWithdrawDbl}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="text-xs text-[var(--muted-foreground)] mt-1">
            ≈ {usdt.toFixed(2)} USDT · min {formatNum(session.config.minWithdrawDbl)} DBL
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">Payout method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {session.config.withdrawMethods.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">Address / ID</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter payout address"
          />
        </div>
        <button
          className="primary-btn"
          disabled={
            mut.isPending ||
            !address ||
            Number(amount) < session.config.minWithdrawDbl ||
            Number(amount) > Number(session.user.balance)
          }
          onClick={() => mut.mutate()}
        >
          Request withdrawal
        </button>
      </div>

      <h3 className="font-bold mt-2">History</h3>
      {session.withdrawals.length === 0 ? (
        <div className="text-sm text-[var(--muted-foreground)]">
          No withdrawals yet.
        </div>
      ) : (
        session.withdrawals.map((w: any) => (
          <div key={w.id} className="list-row">
            <div>
              <div className="font-semibold">
                {formatNum(Number(w.amount_dbl))} DBL · {Number(w.amount_usdt).toFixed(2)} USDT
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {w.method} · {new Date(w.created_at).toLocaleDateString()}
              </div>
            </div>
            <span className="badge">{w.status}</span>
          </div>
        ))
      )}

      <Leaderboard />
    </div>
  );
}

function Leaderboard() {
  const getLb = useServerFn(getLeaderboard);
  const { data } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => getLb(),
    staleTime: 60_000,
  });
  return (
    <div className="mt-4">
      <h3 className="font-bold mb-2">🏆 Top 10</h3>
      {(data ?? []).slice(0, 10).map((u) => (
        <div key={u.id} className="list-row mb-2">
          <div className="flex items-center gap-3">
            <span className="w-6 text-center font-bold text-[var(--gold)]">{u.rank}</span>
            {u.photo_url ? (
              <img src={u.photo_url} className="w-7 h-7 rounded-full" alt="" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--accent)]" />
            )}
            <div className="text-sm font-semibold truncate">
              {u.first_name ?? u.username ?? `#${u.id}`}
            </div>
          </div>
          <div className="text-sm font-bold text-[var(--gold)]">
            {formatNum(u.balance)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "earn", label: "Earn", icon: "🪙" },
    { id: "tasks", label: "Tasks", icon: "✅" },
    { id: "friends", label: "Friends", icon: "😺" },
    { id: "boosts", label: "Boosts", icon: "🤖" },
    { id: "wallet", label: "Cashier", icon: "🪙" },
  ];
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <button
          key={t.id}
          className="tab-btn"
          data-active={tab === t.id}
          onClick={() => {
            haptic("light");
            setTab(t.id);
          }}
        >
          {t.id === "tasks" && <span className="tab-dot" />}
          <span className="tab-icon">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

