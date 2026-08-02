// Server-authoritative economy config. Client cannot influence these values.

export const DBL_PER_USDT = 25_000; // 25,000 DBL = 1 USDT ($1 = 25,000 coins)
export const MIN_WITHDRAW_DBL = 25_000; // 1 USDT minimum
export const MAX_TAPS_PER_REQUEST = 50;
export const MAX_TAPS_PER_SECOND = 20; // anti-bot rate cap per user

// --- Lucky Spin Wheel -------------------------------------------------------
// One free spin per cooldown window. Prize is chosen server-side with a
// weighted random draw so the client can never influence the outcome.
export const SPIN_COOLDOWN_SEC = 3 * 60 * 60; // 3 hours between free spins

export interface SpinPrize {
  label: string;
  amount: number;
  weight: number;
  color: string;
}

// Order defines the on-wheel segment layout (index 0 at the top, clockwise).
export const SPIN_PRIZES: SpinPrize[] = [
  { label: "250", amount: 250, weight: 26, color: "oklch(0.30 0.05 60)" },
  { label: "1K", amount: 1_000, weight: 22, color: "oklch(0.55 0.14 65)" },
  { label: "500", amount: 500, weight: 20, color: "oklch(0.30 0.05 60)" },
  { label: "2K", amount: 2_000, weight: 13, color: "oklch(0.55 0.14 65)" },
  { label: "5K", amount: 5_000, weight: 9, color: "oklch(0.30 0.05 60)" },
  { label: "750", amount: 750, weight: 7, color: "oklch(0.55 0.14 65)" },
  { label: "10K", amount: 10_000, weight: 2.5, color: "oklch(0.30 0.05 60)" },
  { label: "25K", amount: 25_000, weight: 0.5, color: "oklch(0.85 0.17 85)" },
];

/** Weighted random prize draw. Returns the winning segment index. */
export function pickSpinPrize(): number {
  const total = SPIN_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SPIN_PRIZES.length; i++) {
    r -= SPIN_PRIZES[i].weight;
    if (r <= 0) return i;
  }
  return SPIN_PRIZES.length - 1;
}

export const DAILY_STREAK_REWARDS: number[] = [
  500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000,
  75_000, 100_000, 150_000, 250_000, 500_000, 1_000_000,
];

export interface BoostDef {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  apply(user: {
    tap_value: number;
    energy_max: number;
    multitap_level: number;
    energy_limit_level: number;
  }): Partial<{
    tap_value: number;
    energy_max: number;
    multitap_level: number;
    energy_limit_level: number;
  }>;
}

export const BOOSTS: BoostDef[] = [
  {
    id: "multitap",
    name: "Multitap",
    description: "+1 DBL per tap.",
    maxLevel: 20,
    baseCost: 1_000,
    costMultiplier: 2,
    apply(u) {
      return {
        multitap_level: u.multitap_level + 1,
        tap_value: u.tap_value + 1,
      };
    },
  },
  {
    id: "energy_limit",
    name: "Energy Limit",
    description: "+500 max energy.",
    maxLevel: 20,
    baseCost: 1_000,
    costMultiplier: 2,
    apply(u) {
      return {
        energy_limit_level: u.energy_limit_level + 1,
        energy_max: u.energy_max + 500,
      };
    },
  },
];

export function boostCost(b: BoostDef, currentLevel: number): number {
  return Math.floor(b.baseCost * Math.pow(b.costMultiplier, currentLevel - 1));
}

export interface TaskDef {
  id: string;
  name: string;
  description: string;
  url: string;
  reward: number;
  kind: "channel" | "external";
  /** Telegram chat @username — membership is verified server-side before payout. */
  chat?: string;
}

export const TASKS: TaskDef[] = [
  {
    id: "join_community",
    name: "Join Doubloon Community",
    description: "Join our official Telegram community.",
    url: "https://t.me/Doublooncommunity",
    reward: 5_000,
    kind: "channel",
    chat: "@Doublooncommunity",
  },
  {
    id: "join_channel",
    name: "Join Doubloon Tap Channel",
    description: "Follow the announcements channel.",
    url: "https://t.me/Doubloontap",
    reward: 5_000,
    kind: "channel",
    chat: "@Doubloontap",
  },
  {
    id: "join_rewards",
    name: "Join Doubloon Rewards",
    description: "Join the rewards channel for drops and bonuses.",
    url: "https://t.me/Doubloonreward",
    reward: 5_000,
    kind: "channel",
    chat: "@Doubloonreward",
  },
  {
    id: "invite_1",
    name: "Invite your first friend",
    description: "Bring one friend to Doubloon Tap.",
    url: "",
    reward: 2_500,
    kind: "external",
  },
];

// Referral milestone: 50 invited friends -> +25,000 DBL and permanent 2x tap.
export const REFERRAL_MILESTONE_COUNT = 50;
export const REFERRAL_MILESTONE_BONUS = 25_000;
export const REFERRAL_REWARD_PER_FRIEND = 2_500;
export const REFERRAL_REWARD_FOR_INVITEE = 1_000;

// Withdrawal method address regex (loose format checks).
export const WITHDRAW_METHODS: Record<
  string,
  { label: string; addressRegex: RegExp; network: string }
> = {
  "usdt-trc20": {
    label: "USDT (TRC-20)",
    addressRegex: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
    network: "TRON",
  },
  "usdt-bep20": {
    label: "USDT (BEP-20)",
    addressRegex: /^0x[a-fA-F0-9]{40}$/,
    network: "BNB Smart Chain",
  },
  binance: {
    label: "Binance Pay ID",
    addressRegex: /^\d{6,15}$/,
    network: "Binance",
  },
  bybit: {
    label: "Bybit UID",
    addressRegex: /^\d{6,15}$/,
    network: "Bybit",
  },
};

export const BOT_USERNAME = "DoubloonTapBot";

// Channels every user must be subscribed to before claiming any reward.
export const REQUIRED_CHANNELS: { chat: string; label: string; url: string }[] = [
  { chat: "@Doublooncommunity", label: "Doubloon Community", url: "https://t.me/Doublooncommunity" },
  { chat: "@Doubloontap", label: "Doubloon Tap Channel", url: "https://t.me/Doubloontap" },
  { chat: "@Doubloonreward", label: "Doubloon Rewards", url: "https://t.me/Doubloonreward" },
];
