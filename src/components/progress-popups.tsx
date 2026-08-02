import { useEffect, useState } from "react";
import { subscribeProgress, type ProgressPopup } from "@/lib/progress-bus";
import { haptic } from "@/lib/telegram-webapp";
import { playClaim } from "@/lib/sound";

function formatNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

/**
 * Mounted once per app. Drains the progress bus and shows level-up /
 * achievement cards one at a time.
 */
export function ProgressPopups() {
  const [queue, setQueue] = useState<ProgressPopup[]>([]);

  useEffect(
    () =>
      subscribeProgress((items) => {
        setQueue((q) => {
          const seen = new Set(q.map((i) => i.key));
          return [...q, ...items.filter((i) => !seen.has(i.key))];
        });
      }),
    [],
  );

  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    haptic("medium");
    playClaim();
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 2800);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;

  const dismiss = () => setQueue((q) => q.slice(1));

  return (
    <div
      className="win-overlay"
      role="alertdialog"
      aria-label={current.kind === "level" ? `Level ${current.level} reached` : current.name}
      onClick={dismiss}
    >
      <div className="win-card" style={{ maxWidth: 320, textAlign: "center" }}>
        {current.kind === "level" ? (
          <>
            <div className="level-medal">{current.level}</div>
            <div className="win-title">Level up!</div>
            <div className="win-amount" style={{ fontSize: "1.5rem" }}>
              {current.title}
            </div>
          </>
        ) : (
          <>
            <div className="ach-medal">{current.icon}</div>
            <div className="win-title">Achievement unlocked</div>
            <div className="win-amount" style={{ fontSize: "1.35rem" }}>
              {current.name}
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">
              {current.description}
            </div>
          </>
        )}
        <div className="flex items-center gap-2 mt-1">
          {current.dbl > 0 && <span className="badge">🪙 +{formatNum(current.dbl)} DBL</span>}
          {current.gems > 0 && <span className="badge gem">💠 +{current.gems}</span>}
        </div>
        <div className="win-hint">
          Tap to continue{queue.length > 1 ? ` (${queue.length - 1} more)` : ""}
        </div>
      </div>
    </div>
  );
}
