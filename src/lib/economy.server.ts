// Server-authoritative economy config. Client cannot influence these values.

export const DBL_PER_USDT = 1_000; // 10,000 DBL = 10 USDT
export const MIN_WITHDRAW_DBL = 10_000; // 10 USDT
export const MAX_TAPS_PER_REQUEST = 50;
export const MAX_TAPS_PER_SECOND = 20; // anti-bot rate cap per user

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
}

export const TASKS: TaskDef[] = [
  {
    id: "join_community",
    name: "Join Doubloon Community",
    description: "Join our official Telegram community.",
    url: "https://t.me/Doublooncommunity",
    reward: 5_000,
    kind: "channel",
  },
  {
    id: "join_channel",
    name: "Join Doubloon Tap Channel",
    description: "Follow the announcements channel.",
    url: "https://t.me/Doubloontap",
    reward: 5_000,
    kind: "channel",
  },
  {
    id: "join_rewards",
    name: "Join Doubloon Rewards",
    description: "Join the rewards channel for drops and bonuses.",
    url: "https://t.me/Doubloonreward",
    reward: 5_000,
    kind: "channel",
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
