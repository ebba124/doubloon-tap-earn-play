/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { formatNum } from "@/lib/utils";
import { getInitData, getWebApp, haptic, makeNonce, openTelegramUrl } from "@/lib/telegram-webapp";
import { SpinWheel } from "@/components/spin-wheel";
import { SettingsSheet } from "@/components/settings-sheet";
import { WinOverlay } from "@/components/win-overlay";
import { playTap, playClaim, primeAudio } from "@/lib/sound";
import { Settings } from "lucide-react";
import { StreakCard } from "@/components/streak-card";
import { AchievementsPanel } from "@/components/achievements-panel";
import { ProgressPopups } from "@/components/progress-popups";
import { pushProgress } from "@/lib/progress-bus";

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
        content: "Tap. Boost. Invite. Withdraw. Play Doubloon Tap on Telegram.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DoubloonTap,
});

type Tab = "earn" | "spin" | "tasks" | "friends" | "boosts" | "wallet";

function randomUsdAmount() {
  return Number((Math.random() * 90 + 10).toFixed(2));
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;
    const duration = 420;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{formatNum(Math.round(display))}</>;
}

function SplashLoader() {
  return (
    <div className="app-shell items-center justify-center flex text-[var(--muted-foreground)]">
      <div className="coin-btn" style={{ width: 120, fontSize: "2.5rem", opacity: 0.6 }}>
        D
      </div>
    </div>
  );
}

function AuthError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="app-shell items-center justify-center flex flex-col gap-3 p-6 text-center">
      <div className="text-4xl">🪙</div>
      <h1 className="text-xl font-bold">Open inside Telegram</h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        Doubloon Tap is a Telegram Mini App. Launch it from{" "}
        <a href="https://t.me/DoubloonTapBot" className="text-[var(--gold)] underline">
          @DoubloonTapBot
        </a>{" "}
        to play.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          className="primary-btn"
          onClick={() => openTelegramUrl("https://t.me/DoubloonTapBot?start=app")}
        >
          Open bot
        </button>
        {onRetry && (
          <button className="ghost-btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
      <p className="text-xs text-[var(--muted-foreground)] mt-2 opacity-60">{message}</p>
    </div>
  );
}

function DoubloonTap() {
  const [tab, setTab] = useState<Tab>("earn");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let tries = 0;
    const boot = () => {
      const tg = getWebApp();
      tg?.ready();
      tg?.expand();
      if (!getInitData() && tries < 20 && !tg?.initData) {
        tries += 1;
        setTimeout(boot, 150);
        return;
      }
      if (mounted) setReady(true);
    };
    boot();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) return null;
  return <App tab={tab} setTab={setTab} />;
}

function App({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const initData = getInitData();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const getSessionFn = useServerFn(getSession);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSessionFn({ data: { initData } }),
    enabled: Boolean(initData) && hydrated,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    staleTime: 30_000,
    retry: 1,
  });

  if (!hydrated) return <SplashLoader />;
  if (!initData) return <AuthError message="No Telegram session detected." />;
  if (isLoading) return <SplashLoader />;
  if (error || !data)
    return (
      <AuthError
        message={(error as Error)?.message ?? "Session failed"}
        onRetry={() => refetch()}
      />
    );

  return (
    <div className="app-shell">
      <Header
        user={data.user}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={() => refetch()}
      />
      <ProgressPopups />
      {tab === "earn" && <EarnTab session={data} />}
      {tab === "spin" && <SpinWheel session={data} />}
      {tab === "tasks" && <TasksTab session={data} />}
      {tab === "friends" && <FriendsTab session={data} />}
      {tab === "boosts" && <BoostsTab session={data} />}
      {tab === "wallet" && <WalletTab session={data} />}
      <TabBar tab={tab} setTab={setTab} />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        dblPerUsdt={data.config.dblPerUsdt}
      />
    </div>
  );
}

function Header({
  user,
  onOpenSettings,
  onRefresh,
}: {
  user: any;
  onOpenSettings: () => void;
  onRefresh: () => void;
}) {
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    `Player #${user.id}`;
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt=""
              className="w-11 h-11 rounded-full border-2 border-[var(--gold)]"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[var(--accent)] grid place-items-center font-bold text-[var(--gold)]">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="level-chip absolute -bottom-1 -right-1 !w-6 !h-6">
            <span className="level-chip-num !text-[10px]">{user.level ?? 1}</span>
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{name}</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {user.username ? `@${user.username}` : `id ${user.id}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="ghost-btn"
            style={{ padding: 10 }}
            aria-label="Refresh session"
            onClick={onRefresh}
          >
            ↺
          </button>
          <button
            className="ghost-btn"
            style={{ padding: 10 }}
            aria-label="Open settings"
            onClick={onOpenSettings}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="badge">🪙 {formatNum(Number(user.balance ?? 0))} DBL</span>
        {user.longest_streak ? (
          <span className="badge">🔥 {user.longest_streak} day streak</span>
        ) : null}
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
  const [dailyWin, setDailyWin] = useState<{ open: boolean; amount: number }>({
    open: false,
    amount: 0,
  });

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
      const serverUser = (res as any).user;
      const serverBalance = Number(serverUser?.balance ?? 0);
      const perTap =
        Number(session.user.tap_value ?? 1) * Number(session.user.tap_multiplier_permanent ?? 1);
      // Server balance is authoritative. Re-add only the taps that queued up
      // while this request was in flight so the counter never drifts.
      const queuedTaps = pending.current;
      const queuedValue = queuedTaps * perTap;
      setLocalBalance(serverBalance + queuedValue);
      setLocalEnergy(Number(serverUser?.energy ?? localEnergy));
      qc.setQueryData(["session"], (prev: any) =>
        prev
          ? {
              ...prev,
              user: {
                ...(res as any).user,
                balance: serverBalance + queuedValue,
                energy: Number(serverUser?.energy ?? localEnergy),
              },
            }
          : prev,
      );
      pushProgress((res as any).progress);
      // Level ups and achievements change the progression/achievement payload.
      if ((res as any).progress?.levelUps?.length || (res as any).progress?.unlocked?.length) {
        qc.invalidateQueries({ queryKey: ["session"] });
      }
    } catch (e) {
      console.error("[v0] tap request failed", e);
      pending.current += taps;
      qc.invalidateQueries({ queryKey: ["session"] });
    }
  };

  const handleTap = (e: React.PointerEvent) => {
    if (localEnergy < 1) return;
    primeAudio();
    haptic("light");
    playTap();
    const perTap =
      Number(session.user.tap_value ?? 1) * Number(session.user.tap_multiplier_permanent ?? 1);
    setLocalBalance((b) => b + perTap);
    setLocalEnergy((en) => Math.max(0, en - 1));
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
    onSuccess: (r: any) => {
      if (r.reason === "ok") {
        haptic("medium");
        playClaim();
        // Update the visible counter immediately from the authoritative payout.
        // This keeps the claimed DBL visible even before the session refetch completes.
        setLocalBalance(Number(r.user?.balance ?? session.user.balance));
        qc.setQueryData(["session"], (prev: any) => (prev ? { ...prev, user: r.user } : prev));
        setDailyWin({ open: true, amount: r.claimed });
        // Show the streak popups only after the daily reward card is dismissed.
        setTimeout(() => pushProgress(r.progress), 2500);
        qc.invalidateQueries({ queryKey: ["session"] });
        if (r.freezeUsed) {
          getWebApp()?.showAlert?.(
            "❄️ A streak freeze saved your streak! Check in daily to keep it alive.",
          );
        }
      } else {
        getWebApp()?.showAlert?.("Come back in 20+ hours for your next daily.");
      }
    },
    onError: (e: any) => {
      haptic("medium");
      getWebApp()?.showAlert?.(
        e?.message ?? "Daily reward could not be claimed. Please try again.",
      );
      qc.invalidateQueries({ queryKey: ["session"] });
    },
  });

  const canDaily = useMemo(() => {
    if (!session.user.last_daily_claim) return true;
    const claimedAt = new Date(session.user.last_daily_claim).getTime();
    if (Number.isNaN(claimedAt)) return true;
    const hrs = (Date.now() - claimedAt) / 3.6e6;
    return hrs >= 20;
  }, [session.user.last_daily_claim]);

  return (
    <div className="flex flex-col items-center px-4 gap-4">
      <WinOverlay
        open={dailyWin.open}
        amount={dailyWin.amount}
        title="Daily reward!"
        onClose={() => setDailyWin({ open: false, amount: 0 })}
      />
      <div className="balance-hero">
        <span>🪙</span>
        <span><AnimatedNumber value={localBalance} /></span>
        <span className="text-sm text-[var(--muted-foreground)] font-semibold">DBL</span>
      </div>

      <button
        className="primary-btn"
        style={{ maxWidth: 320 }}
        disabled={!canDaily || dailyMut.isPending}
        onClick={() => dailyMut.mutate()}
      >
        {canDaily
          ? `🎁 Claim daily reward${
              Number(session.streak?.nextMultiplier ?? 1) > 1
                ? ` (${session.streak.nextMultiplier}×)`
                : ""
            }`
          : "Daily claimed ✓"}
      </button>

      <StreakCard session={session} />

      <div className="relative" onPointerDown={handleTap} style={{ touchAction: "manipulation" }}>
        <div className="coin-btn">D</div>
        {floats.map((f) => (
          <div key={f.id} className="tap-float" style={{ left: f.x, top: f.y }}>
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
              background: "linear-gradient(90deg, var(--gold-dark), var(--gold))",
              transition: "width 300ms ease",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full mt-2">
        <div className="stat-card">
          <div className="text-xs text-[var(--muted-foreground)]">Per tap</div>
          <div className="font-bold text-lg">
            +{Number(session.user.tap_value) * Number(session.user.tap_multiplier_permanent || 1)}{" "}
            DBL
          </div>
        </div>
        <div className="stat-card">
          <div className="text-xs text-[var(--muted-foreground)]">Total XP</div>
          <div className="font-bold text-lg">✨ {formatNum(Number(session.user.xp ?? 0))}</div>
        </div>
      </div>
    </div>
  );
}

function ChannelGate({ session }: { session: any }) {
  const qc = useQueryClient();
  if (session.membership?.ok !== false) return null;
  return (
    <div className="w-full">
      <div className="list-row flex-col items-stretch gap-2">
        <div className="font-bold">🔒 Join our channels to unlock rewards</div>
        <div className="text-xs text-[var(--muted-foreground)]">
          Subscription is required for every user before claiming any reward.
        </div>
        {session.membership.missing.map((c: any) => (
          <button key={c.chat} className="ghost-btn" onClick={() => openTelegramUrl(c.url)}>
            Join {c.label}
          </button>
        ))}
        <button
          className="primary-btn"
          onClick={() => qc.invalidateQueries({ queryKey: ["session"] })}
        >
          I&apos;ve joined — check again
        </button>
      </div>
    </div>
  );
}

function TasksTab({ session }: { session: any }) {
  const qc = useQueryClient();
  const completeFn = useServerFn(completeTask);
  const [startedAt, setStartedAt] = useState<Record<string, number>>({});
  const [, forceTick] = useState(0);

  useEffect(() => {
    const i = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const mut = useMutation({
    mutationFn: (taskId: string) =>
      completeFn({ data: { initData: getInitData(), taskId, startedAt: startedAt[taskId] } }),
    onSuccess: (r: any) => {
      haptic("medium");
      playClaim();
      qc.setQueryData(["session"], (prev: any) =>
        prev
          ? {
              ...prev,
              user: r.user,
              tasksDone: prev.tasksDone.includes(r.taskId ?? "")
                ? prev.tasksDone
                : [...prev.tasksDone, r.taskId].filter(Boolean),
              tasksDoneAt: { ...prev.tasksDoneAt, [r.taskId]: new Date().toISOString() },
            }
          : prev,
      );
      pushProgress(r.progress);
      qc.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (e: any) => {
      getWebApp()?.showAlert?.(
        e?.message ?? "You haven't joined yet — join the channel to claim this reward.",
      );
      qc.invalidateQueries({ queryKey: ["session"] });
    },
  });

  const channels: any[] = session.membership?.channels ?? [];
  const joinedChat = (chat?: string) =>
    !chat || channels.find((c) => c.chat === chat)?.joined === true;
  const allJoined = session.membership?.ok !== false;
  const tasksDoneAt: Record<string, string> = session.tasksDoneAt ?? {};

  return (
    <div className="px-4 flex flex-col gap-3">
      <h2 className="text-xl font-bold">Tasks</h2>
      <ChannelGate session={session} />
      {session.tasks.map((t: any) => {
        const wasDone = session.tasksDone.includes(t.id);
        const joined = joinedChat(t.chat);
        const locked = !allJoined || !joined;

        let cooldownRemainingMs = 0;
        if (wasDone && t.repeatable && tasksDoneAt[t.id]) {
          const last = new Date(tasksDoneAt[t.id]).getTime();
          const readyAt = last + (t.cooldownHours ?? 24) * 3_600_000;
          cooldownRemainingMs = Math.max(0, readyAt - Date.now());
        }
        const done = wasDone && !(t.repeatable && cooldownRemainingMs === 0);

        const isTimed = t.kind === "visit" || t.kind === "video";
        const start = startedAt[t.id];
        const waitSeconds = t.visitSeconds ?? 15;
        const elapsedMs = start ? Date.now() - start : 0;
        const remainingSec = isTimed && start ? Math.max(0, Math.ceil((waitSeconds * 1000 - elapsedMs) / 1000)) : waitSeconds;
        const timerReady = isTimed && start && elapsedMs >= waitSeconds * 1000;

        return (
          <div key={t.id} className="list-row flex-col items-stretch">
            <div className="flex justify-between gap-3">
              {t.kind === "video" && t.thumbnailUrl && (
                <img
                  src={t.thumbnailUrl}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{t.description}</div>
                <div className="text-sm text-[var(--gold)] font-bold mt-1">
                  +{formatNum(t.reward)} DBL
                  {t.repeatable && (
                    <span className="text-xs text-[var(--muted-foreground)] font-normal">
                      {" "}
                      · every {t.cooldownHours ?? 24}h
                    </span>
                  )}
                </div>
                {!done && locked && (
                  <div className="text-xs mt-1" style={{ color: "#ff6b6b" }}>
                    🔒 Not joined yet — you must join {t.chat ?? "all required channels"} to claim
                    this reward.
                  </div>
                )}
                {!done && !locked && t.kind === "channel" && (
                  <div className="text-xs mt-1 text-[var(--gold)]">✓ Joined — ready to claim</div>
                )}
                {!done && !locked && isTimed && start && !timerReady && (
                  <div className="text-xs mt-1 text-[var(--gold)]">
                    ⏳ Wait {remainingSec}s, then come back to claim
                  </div>
                )}
                {done && t.repeatable && cooldownRemainingMs > 0 && (
                  <div className="text-xs mt-1 text-[var(--muted-foreground)]">
                    ⏱ Next in {Math.ceil(cooldownRemainingMs / 3_600_000)}h
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2">
              {done ? (
                <span className="badge">✓ Done</span>
              ) : t.kind === "channel" ? (
                <div className="flex gap-2">
                  <button className="ghost-btn flex-1" onClick={() => openTelegramUrl(t.url)}>
                    Join
                  </button>
                  <button
                    className="primary-btn flex-1"
                    style={{ padding: "6px 12px", opacity: locked ? 0.5 : 1 }}
                    disabled={mut.isPending}
                    onClick={() => {
                      if (locked || mut.isPending) {
                        haptic("medium");
                        getWebApp()?.showAlert?.(
                          "You haven't joined yet. Join the channel, then tap “I've joined — check again”.",
                        );
                        qc.invalidateQueries({ queryKey: ["session"] });
                        return;
                      }
                      mut.mutate(t.id);
                    }}
                  >
                    {locked ? "🔒 Claim" : "Claim"}
                  </button>
                </div>
              ) : isTimed ? (
                <div className="flex gap-2">
                  <button
                    className="ghost-btn flex-1"
                    onClick={() => {
                      if (t.url) openTelegramUrl(t.url);
                      setStartedAt((s) => ({ ...s, [t.id]: Date.now() }));
                    }}
                  >
                    {start ? "Open again" : "Open link"}
                  </button>
                  <button
                    className="primary-btn flex-1"
                    style={{ opacity: !timerReady || locked ? 0.5 : 1 }}
                    disabled={mut.isPending}
                    onClick={() => {
                      if (locked) {
                        getWebApp()?.showAlert?.("Join all required channels first to unlock rewards.");
                        return;
                      }
                      if (!start) {
                        getWebApp()?.showAlert?.("Tap “Open link” first, then wait before claiming.");
                        return;
                      }
                      if (!timerReady) {
                        getWebApp()?.showAlert?.(`Please wait ${remainingSec}s more before claiming.`);
                        return;
                      }
                      mut.mutate(t.id);
                    }}
                  >
                    {timerReady ? "Claim" : `Wait ${remainingSec}s`}
                  </button>
                </div>
              ) : (
                <button
                  className="primary-btn"
                  style={{ width: "auto", opacity: locked ? 0.5 : 1 }}
                  onClick={() => {
                    if (locked || mut.isPending) {
                      haptic("medium");
                      getWebApp()?.showAlert?.("Join all required channels first to unlock rewards.");
                      return;
                    }
                    mut.mutate(t.id);
                  }}
                  disabled={mut.isPending}
                >
                  {locked ? "🔒 Claim" : "Claim"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FriendsTab({ session }: { session: any }) {
  const link = `https://t.me/${session.config.botUsername}?start=ref_${session.user.id}`;
  const shareText = encodeURIComponent(`🪙 Join me on Doubloon Tap and earn DBL! ${link}`);
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
              } catch (e) {
                // Clipboard access may fail silently
              }
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <button className="primary-btn flex-1" onClick={() => openTelegramUrl(shareUrl)}>
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
      playClaim();
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
        Balance:{" "}
        <span className="text-[var(--gold)] font-bold">
          {formatNum(Number(session.user.balance))} DBL
        </span>
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
  const [simulatedPayout, setSimulatedPayout] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

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
      showToast("Withdrawal request submitted ✓");
    },
    onError: (e: any) => getWebApp()?.showAlert?.(e.message ?? "Failed"),
  });

  const usdt = (Number(amount) || 0) / session.config.dblPerUsdt;

  useEffect(() => {
    const next = randomUsdAmount();
    setSimulatedPayout(next);
    showToast(`💸 $${next.toFixed(2)} was just paid out to a nearby player`);
  }, [session.user.id]);

  return (
    <div className="px-4 flex flex-col gap-3">
      {toast && (
        <div className="toast-note" role="status" aria-live="polite">
          {toast}
        </div>
      )}
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
        <div className="rounded-xl border border-[var(--gold)]/20 bg-[var(--accent)]/70 p-3 text-sm">
          <div className="font-semibold text-[var(--gold)]">💸 Live payout feed</div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
            Recent withdrawals are simulated live. This one is ${simulatedPayout.toFixed(2)} USD.
          </div>
        </div>
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

      {session.withdrawals.length > 0 && (
        <>
          <h3 className="font-bold mt-2">History</h3>
          {session.withdrawals.map((w: any) => (
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
          ))}
        </>
      )}

      <Leaderboard />
    </div>
  );
}

function randomOnline() {
  // Fresh value every tick, always comfortably above 100k (≈100k–250k).
  return 100_000 + Math.floor(Math.random() * 150_000);
}

function Leaderboard() {
  const getLb = useServerFn(getLeaderboard);
  const [onlineCount, setOnlineCount] = useState(randomOnline);
  const { data } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => getLb(),
    staleTime: 60_000,
  });

  useEffect(() => {
    const tick = () => {
      setOnlineCount(randomOnline());
    };
    tick();
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const blended = useMemo(() => {
    const fakeEntries = [
      {
        id: 90001,
        rank: 0,
        first_name: "Nova",
        username: "nova",
        balance: 1_250_000,
        photo_url: "",
      },
      {
        id: 90002,
        rank: 0,
        first_name: "Mina",
        username: "mina",
        balance: 1_100_000,
        photo_url: "",
      },
      { id: 90003, rank: 0, first_name: "Rex", username: "rex", balance: 980_000, photo_url: "" },
      { id: 90004, rank: 0, first_name: "Luna", username: "luna", balance: 870_000, photo_url: "" },
      { id: 90005, rank: 0, first_name: "Kai", username: "kai", balance: 760_000, photo_url: "" },
      { id: 90006, rank: 0, first_name: "Aria", username: "aria", balance: 650_000, photo_url: "" },
      { id: 90007, rank: 0, first_name: "Zane", username: "zane", balance: 560_000, photo_url: "" },
      { id: 90008, rank: 0, first_name: "Ivy", username: "ivy", balance: 480_000, photo_url: "" },
      { id: 90009, rank: 0, first_name: "Owen", username: "owen", balance: 410_000, photo_url: "" },
      { id: 90010, rank: 0, first_name: "Sia", username: "sia", balance: 350_000, photo_url: "" },
    ];
    const base = (data ?? []) as Array<any>;
    return [...base, ...fakeEntries]
      .sort((a, b) => Number(b.balance) - Number(a.balance))
      .slice(0, 10)
      .map((u, index) => ({ ...u, rank: index + 1 }));
  }, [data]);

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-bold">🏆 Live leaderboard</h3>
        <span className="rounded-full bg-[var(--gold)]/20 px-2 py-1 text-[10px] font-semibold text-[var(--gold)]">
          {onlineCount.toLocaleString()}+ online
        </span>
      </div>
      <div className="mb-3 rounded-xl border border-[var(--gold)]/20 bg-[var(--accent)]/50 p-2 text-xs text-[var(--muted-foreground)]">
        Live activity is simulated so the board feels active and the online count stays above 100k.
      </div>
      {blended.map((u) => (
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
          <div className="text-sm font-bold text-[var(--gold)]">{formatNum(Number(u.balance))}</div>
        </div>
      ))}
    </div>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "earn", label: "Earn", icon: "🪙" },
    { id: "spin", label: "Spin", icon: "🎡" },
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
