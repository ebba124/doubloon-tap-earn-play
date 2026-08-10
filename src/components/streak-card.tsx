interface StreakData {
  day?: number;
  longest?: number;
  freezes?: number;
  maxFreezes?: number;
  multiplier?: number;
  nextMultiplier?: number;
  tiers?: Array<{ day: number; multiplier: number }>;
}

interface StreakCardSessionData {
  streak?: StreakData;
  config?: {
    dailyRewards?: number[];
  };
}

import { formatNum } from "@/lib/utils";

/**
 * Check-in streak summary: current day, active multiplier, banked freezes and
 * the next multiplier tier the player is working toward.
 */
export function StreakCard({ session }: { session: StreakCardSessionData }) {
  const streak = session.streak ?? { day: 0, longest: 0, freezes: 0, maxFreezes: 3, multiplier: 1 };
  const rewards: number[] = session.config?.dailyRewards ?? [];
  const day = Number(streak.day ?? 0);
  const nextDay = Math.min(day + 1, rewards.length);
  const nextMultiplier = Number(streak.nextMultiplier ?? 1);
  const nextReward = Math.floor((rewards[nextDay - 1] ?? 0) * nextMultiplier);

  const tiers: { day: number; multiplier: number }[] = streak.tiers ?? [];
  const upcoming = tiers.find((t) => t.day > day);

  return (
    <section className="stat-card w-full flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--muted-foreground)]">Check-in streak</div>
          <div className="font-bold text-lg">
            🔥 Day {day}
            <span className="text-sm font-semibold text-[var(--muted-foreground)]">
              {" "}
              · best {streak.longest}
            </span>
          </div>
        </div>
        <div className="mult-chip">{streak.multiplier}× rewards</div>
      </div>

      <div className="streak-track" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => {
          const d = i + 1;
          const cycleDay = day % 7 === 0 && day > 0 ? 7 : day % 7;
          return <span key={d} className="streak-pip" data-on={d <= cycleDay} />;
        })}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--muted-foreground)]">
          Next claim: <strong className="text-[var(--gold)]">+{formatNum(nextReward)} DBL</strong>{" "}
          at {nextMultiplier}×
        </span>
        <span className="badge" title="Streak freezes protect a missed day">
          ❄️ {streak.freezes}/{streak.maxFreezes}
        </span>
      </div>

      {upcoming && (
        <div className="text-xs text-[var(--muted-foreground)]">
          Reach day {upcoming.day} for a {upcoming.multiplier}× multiplier
          {" · "}every 7 days banks a freeze
        </div>
      )}
    </section>
  );
}
