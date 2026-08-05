import { useEffect, useMemo } from "react";

function formatNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return (n / 1000).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

export interface WinOverlayProps {
  open: boolean;
  amount: number;
  title?: string;
  onClose: () => void;
}

const CONFETTI_COLORS = [
  "var(--gold)",
  "var(--gold-dark)",
  "oklch(0.7 0.17 150)",
  "oklch(0.95 0.14 88)",
];

export function WinOverlay({ open, amount, title = "You won!", onClose }: WinOverlayProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.35,
        duration: 1.4 + Math.random() * 1.2,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 8,
        rotate: Math.random() * 360,
      })),
    // Regenerate the burst each time the overlay opens.
    [
      // Only regenerate when opening, not when closing or onClose changes
    ],
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, 2400);
    return () => clearTimeout(t);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="win-overlay"
      role="alertdialog"
      aria-label={`${title} ${formatNum(amount)} DBL`}
      onClick={onClose}
    >
      <div className="win-confetti" aria-hidden="true">
        {pieces.map((p) => (
          <span
            key={p.id}
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.6,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rotate}deg)`,
            }}
          />
        ))}
      </div>
      <div className="win-card">
        <div className="win-coin">D</div>
        <div className="win-title">{title}</div>
        <div className="win-amount">+{formatNum(amount)} DBL</div>
        <div className="win-hint">Tap to continue</div>
      </div>
    </div>
  );
}
