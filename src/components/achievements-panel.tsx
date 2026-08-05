import type { AchievementDef, AchievementStat } from "@/lib/progression";

interface SessionData {
  achievements?: AchievementDef[];
  achievementsUnlocked?: Array<{ id: string }>;
  user: {
    total_taps?: number;
    balance?: number;
  };
  progression?: {
    level?: number;
  };
  streak?: {
    longest?: number;
  };
  referralCount?: number;
  tasksDone?: unknown[];
}

function formatNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

const STAT_LABEL: Record<AchievementStat, string> = {
  total_taps: "taps",
  level: "level",
  longest_streak: "day streak",
  referrals: "friends",
  tasks: "tasks",
  balance: "DBL",
  spins: "spins",
};

export function AchievementsPanel({ session }: { session: SessionData }) {
  const defs: AchievementDef[] = session.achievements ?? [];
  const unlockedIds = new Set<string>(
    (session.achievementsUnlocked ?? []).map((a: { id: string }) => a.id),
  );

  // Current value for every stat an achievement can track.
  const stats: Record<AchievementStat, number> = {
    total_taps: Number(session.user.total_taps ?? 0),
    level: Number(session.progression?.level ?? 1),
    longest_streak: Number(session.streak?.longest ?? 0),
    referrals: Number(session.referralCount ?? 0),
    tasks: (session.tasksDone ?? []).length,
    balance: Number(session.user.balance ?? 0),
    spins: 0,
  };

  const unlocked = defs.filter((a) => unlockedIds.has(a.id));
  const locked = defs.filter((a) => !unlockedIds.has(a.id));

  return (
    <section className="flex flex-col gap-3">
      <div className="stat-card flex items-center justify-between">
        <div>
          <div className="text-xs text-[var(--muted-foreground)]">Achievements</div>
          <div className="font-bold text-lg">
            {unlocked.length} / {defs.length} unlocked
          </div>
        </div>
        <div className="text-3xl" aria-hidden="true">
          🏅
        </div>
      </div>

      <div className="ach-grid">
        {[...unlocked, ...locked].map((a) => {
          const done = unlockedIds.has(a.id);
          // `spins` has no client-side counter, so show it as a plain target.
          const trackable = a.stat !== "spins";
          const value = Math.min(stats[a.stat], a.threshold);
          const pct = done ? 100 : Math.min(100, (stats[a.stat] / a.threshold) * 100);
          return (
            <article key={a.id} className="ach-card" data-done={done}>
              <div className="ach-icon" aria-hidden="true">
                {done ? a.icon : "🔒"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{a.name}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{a.description}</div>
                {!done && trackable && (
                  <>
                    <div className="ach-bar" aria-hidden="true">
                      <div className="ach-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                      {formatNum(value)} / {formatNum(a.threshold)} {STAT_LABEL[a.stat]}
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="badge">🪙 {formatNum(a.dbl)}</span>
                  {a.gems > 0 && <span className="badge gem">💠 {a.gems}</span>}
                  {a.xp > 0 && <span className="badge xp">✨ {a.xp} XP</span>}
                </div>
              </div>
              {done && <span className="badge shrink-0">✓</span>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
