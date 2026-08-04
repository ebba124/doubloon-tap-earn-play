import { useEffect, useMemo, useRef, useState } from "react";

// --- Fake-but-believable social proof --------------------------------------
// The online counter and the withdrawal ticker are purely cosmetic hype
// elements. No values are hardcoded — every number is generated at runtime so
// the feed always looks fresh.

const FIRST_NAMES = [
  "Alex", "Daniel", "Sofia", "Ahmed", "Mia", "Liam", "Noah", "Emma", "Yusuf",
  "Olivia", "Lucas", "Aisha", "Ethan", "Zara", "Omar", "Hana", "Diego", "Nina",
  "Ravi", "Leila", "Marco", "Chloe", "Ivan", "Amara", "Kento", "Priya", "Tomas",
  "Fatima", "Jonas", "Elena", "Bilal", "Grace", "Viktor", "Layla", "Andre",
];

const METHODS = [
  "USDT (TRC-20)",
  "USDT (BEP-20)",
  "Binance Pay",
  "Bybit",
];

/** Random display name like "Alex K." — never a full real identity. */
function randomName() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const initial = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${first} ${initial}.`;
}

/**
 * USDT payout amount: strictly greater than 10 and less than 50, with random
 * cents so it never looks like a round "20 / 30" number. e.g. 23.47, 41.80.
 */
function randomAmount() {
  const value = 10 + Math.random() * 40; // (10, 50)
  const clamped = Math.min(49.99, Math.max(10.01, value));
  return clamped.toFixed(2);
}

interface Payout {
  id: number;
  name: string;
  amount: string;
  method: string;
}

function makePayout(): Payout {
  return {
    id: Date.now() + Math.random(),
    name: randomName(),
    amount: randomAmount(),
    method: METHODS[Math.floor(Math.random() * METHODS.length)],
  };
}

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

/** Online-players counter: always above 100k, drifts every minute. */
function useOnlineCount() {
  const [count, setCount] = useState<number>(() => 100_000 + Math.floor(Math.random() * 60_000));

  useEffect(() => {
    const tick = () => {
      setCount((prev) => {
        // Small minute-to-minute drift, kept comfortably above 100,000.
        const delta = Math.floor((Math.random() - 0.45) * 1200);
        return Math.max(100_137, prev + delta);
      });
    };
    const i = setInterval(tick, 60_000);
    return () => clearInterval(i);
  }, []);

  return count;
}

export function OnlineBadge() {
  const count = useOnlineCount();
  return (
    <div
      className="flex items-center justify-center gap-2 text-sm font-semibold"
      aria-live="polite"
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{
          background: "var(--success)",
          boxShadow: "0 0 0 3px oklch(0.70 0.17 150 / 0.25)",
        }}
      />
      <span className="text-[var(--success)]">{formatCount(count)}</span>
      <span className="text-[var(--muted-foreground)]">players online</span>
    </div>
  );
}

export function WithdrawTicker() {
  const [payout, setPayout] = useState<Payout>(() => makePayout());
  const [visible, setVisible] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const cycle = () => {
      // fade out, swap, fade back in — every ~4s with a fresh random payout.
      setVisible(false);
      const t1 = setTimeout(() => {
        setPayout(makePayout());
        setVisible(true);
      }, 350);
      timers.current.push(t1);
    };
    const i = setInterval(cycle, 4000);
    return () => {
      clearInterval(i);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="list-row" aria-live="polite">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 rounded-full grid place-items-center flex-shrink-0 font-bold"
          style={{ background: "var(--secondary)", color: "var(--gold)" }}
        >
          {payout.name.slice(0, 1)}
        </div>
        <div
          className="min-w-0"
          style={{
            transition: "opacity 300ms ease",
            opacity: visible ? 1 : 0,
          }}
        >
          <div className="text-sm font-semibold truncate">
            {payout.name} withdrew{" "}
            <span className="text-[var(--gold)]">${payout.amount} USDT</span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)] truncate">
            via {payout.method} · just now
          </div>
        </div>
      </div>
      <span className="badge">✓ Paid</span>
    </div>
  );
}

/** Combined social-proof block used on the Earn and Wallet tabs. */
export function LiveStats() {
  const heading = useMemo(() => "💸 Live payouts", []);
  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{heading}</span>
        <OnlineBadge />
      </div>
      <WithdrawTicker />
    </div>
  );
}
