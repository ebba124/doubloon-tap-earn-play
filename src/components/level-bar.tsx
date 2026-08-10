interface ProgressionData {
  level?: number;
  title?: string;
  pct?: number;
  xpIntoLevel?: number;
  xpForNext?: number;
}

interface LevelBarSessionData {
  progression?: ProgressionData;
  user?: {
    gems?: number;
  };
}

function formatNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

/** Compact level chip + XP bar + gem balance, shown under the header. */
export function LevelBar({ session }: { session: LevelBarSessionData }) {
  const p = session.progression ?? {
    level: 1,
    title: "Stowaway",
    pct: 0,
    xpIntoLevel: 0,
    xpForNext: 0,
  };
  const gems = Number(session.user?.gems ?? 0);
  const maxed = p.xpForNext === 0;

  return (
    <div className="flex items-center gap-3 px-4 pb-3">
      <div className="level-chip" title={`Level ${p.level} — ${p.title}`}>
        <span className="level-chip-num">{p.level}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-semibold truncate">{p.title}</span>
          <span className="text-[var(--muted-foreground)]">
            {maxed ? "MAX" : `${formatNum(p.xpIntoLevel ?? 0)} / ${formatNum(p.xpForNext ?? 0)} XP`}
          </span>
        </div>
        <div className="xp-bar">
          <div
            className="xp-bar-fill"
            style={{ width: `${maxed ? 100 : (p.pct ?? 0)}%` }}
            role="progressbar"
            aria-valuenow={Math.round(maxed ? 100 : (p.pct ?? 0))}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Experience progress"
          />
        </div>
      </div>
      <span className="badge gem" title="Gems">
        💠 {formatNum(gems)}
      </span>
    </div>
  );
}
