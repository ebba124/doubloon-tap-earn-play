import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { spin } from "@/lib/game.functions";
import { getInitData, getWebApp, haptic, makeNonce } from "@/lib/telegram-webapp";
import { playSpinTick, playWin, playError, primeAudio } from "@/lib/sound";
import { WinOverlay } from "./win-overlay";

interface Prize {
  label: string;
  amount: number;
  color: string;
}

interface SpinWheelSessionData {
  config: {
    spinPrizes?: Prize[];
    spinCooldownSec?: number;
  };
  nextSpinAt?: string | null;
  user?: {
    balance?: number;
  };
  membership?: {
    ok?: boolean;
  };
}

interface SpinResult {
  prizeIndex: number;
  cooldown?: boolean;
  nextSpinAt?: string;
  amount: number;
  user?: {
    balance?: number;
  };
}

const SIZE = 220;
const C = SIZE / 2;
const R = 104;
const SPIN_MS = 4200;

function polar(angleDeg: number, radius: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)] as const;
}

function segPath(start: number, end: number) {
  const [sx, sy] = polar(start, R);
  const [ex, ey] = polar(end, R);
  const large = end - start > 180 ? 1 : 0;
  return `M${C},${C} L${sx.toFixed(2)},${sy.toFixed(2)} A${R},${R} 0 ${large} 1 ${ex.toFixed(2)},${ey.toFixed(2)} Z`;
}

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function SpinWheel({ session }: { session: SpinWheelSessionData }) {
  const qc = useQueryClient();
  const spinFn = useServerFn(spin);
  const prizes = useMemo(
    () => (session.config.spinPrizes ?? []) as Prize[],
    [session.config.spinPrizes],
  );
  const N = prizes.length;
  const seg = N > 0 ? 360 / N : 0;

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [win, setWin] = useState<{ open: boolean; amount: number }>({
    open: false,
    amount: 0,
  });
  const [nextSpinAt, setNextSpinAt] = useState<string | null>(session.nextSpinAt ?? null);
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setNextSpinAt(session.nextSpinAt ?? null);
  }, [session.nextSpinAt]);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);

  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
    },
    [],
  );

  const remainingMs = nextSpinAt ? new Date(nextSpinAt).getTime() - now : 0;
  const ready = remainingMs <= 0;
  const locked = session.membership?.ok === false;

  const segments = useMemo(
    () =>
      prizes.map((p, i) => {
        const start = i * seg;
        const end = start + seg;
        const center = start + seg / 2;
        const [lx, ly] = polar(center, R * 0.66);
        return { p, i, start, end, center, lx, ly };
      }),
    [prizes, seg],
  );

  const mut = useMutation({
    mutationFn: () => spinFn({ data: { initData: getInitData(), nonce: makeNonce() } }),
    onSuccess: (r: SpinResult) => {
      setErrorMessage(null);
      if (r.prizeIndex < 0) {
        setSpinning(false);
        if (tickRef.current) clearInterval(tickRef.current);
        if (r.nextSpinAt) setNextSpinAt(r.nextSpinAt);
        playError();
        getWebApp()?.showAlert?.(
          r.cooldown
            ? "No free spin yet — come back when the timer runs out."
            : "Spin could not be processed. Try again.",
        );
        return;
      }

      // Animate the wheel to land on the winning segment.
      const center = r.prizeIndex * seg + seg / 2;
      const targetMod = (((360 - center) % 360) + 360) % 360;
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      setRotation((prev) => prev - (prev % 360) + 360 * 5 + targetMod + jitter);

      // Ticking accelerando -> reveal.
      let ticks = 0;
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = setInterval(() => {
        ticks += 1;
        playSpinTick();
        if (ticks > 26 && tickRef.current) clearInterval(tickRef.current);
      }, 130);

      window.setTimeout(() => {
        if (tickRef.current) clearInterval(tickRef.current);
        setSpinning(false);
        setNextSpinAt(r.nextSpinAt ?? null);
        haptic("heavy");
        playWin();
        qc.setQueryData(["session"], (prev: SpinWheelSessionData | undefined) =>
          prev ? { ...prev, user: r.user, nextSpinAt: r.nextSpinAt } : prev,
        );
        setWin({ open: true, amount: r.amount });
      }, SPIN_MS);
    },
    onError: (e: Error) => {
      setSpinning(false);
      if (tickRef.current) clearInterval(tickRef.current);
      setErrorMessage(e.message || "Spin could not be processed. Please try again.");
      playError();
      getWebApp()?.showAlert?.(e.message || "Spin could not be processed. Please try again.");
      qc.invalidateQueries({ queryKey: ["session"] });
    },
  });

  const doSpin = () => {
    if (spinning || !ready || locked || mut.isPending) return;
    setErrorMessage(null);
    primeAudio();
    haptic("medium");
    setSpinning(true);
    mut.mutate();
  };

  return (
    <div className="flex flex-col items-center px-4 gap-4">
      <div className="text-center">
        <h2 className="text-xl font-bold">Lucky Spin</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          One free spin every {Math.round((session.config.spinCooldownSec ?? 10800) / 3600)}h. Win
          up to 25K DBL.
        </p>
      </div>

      <div className="wheel-wrap">
        <div className="wheel-pointer" aria-hidden="true" />
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="wheel-svg"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.16, 1, 0.3, 1)` : "none",
          }}
          role="img"
          aria-label="Prize wheel"
        >
          <circle cx={C} cy={C} r={R + 4} fill="oklch(0.30 0.06 60)" />
          {segments.map((s) => (
            <path
              key={s.i}
              d={segPath(s.start, s.end)}
              fill={s.p.color}
              stroke="oklch(0.20 0.03 55)"
              strokeWidth={1.5}
            />
          ))}
          {segments.map((s) => (
            <text
              key={`t-${s.i}`}
              x={s.lx}
              y={s.ly}
              fill="oklch(0.98 0.02 90)"
              fontSize="15"
              fontWeight="800"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${s.center} ${s.lx} ${s.ly})`}
            >
              {s.p.label}
            </text>
          ))}
          <circle
            cx={C}
            cy={C}
            r={18}
            fill="oklch(0.22 0.03 55)"
            stroke="var(--gold)"
            strokeWidth={3}
          />
        </svg>
      </div>

      {errorMessage && (
        <div className="w-full text-center text-sm text-[var(--danger)]" role="alert">
          {errorMessage}
        </div>
      )}

      <button
        className="primary-btn"
        style={{ maxWidth: 320 }}
        disabled={spinning || !ready || locked}
        onClick={doSpin}
      >
        {locked
          ? "🔒 Join channels to spin"
          : spinning
            ? "Spinning…"
            : ready
              ? "Spin now"
              : `Next spin in ${fmtCountdown(remainingMs)}`}
      </button>

      <div className="stat-card w-full">
        <div className="text-xs text-[var(--muted-foreground)] mb-2">Prize table</div>
        <div className="grid grid-cols-4 gap-2">
          {prizes.map((p, i) => (
            <div
              key={i}
              className="rounded-md py-2 text-center text-sm font-bold"
              style={{ background: p.color, color: "oklch(0.98 0.02 90)" }}
            >
              {p.label}
            </div>
          ))}
        </div>
      </div>

      <WinOverlay
        open={win.open}
        amount={win.amount}
        title="Lucky Spin win!"
        onClose={() => setWin({ open: false, amount: 0 })}
      />
    </div>
  );
}
