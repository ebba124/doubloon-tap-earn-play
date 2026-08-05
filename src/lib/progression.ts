// Shared progression rules: XP, levels, streak multipliers, achievements.
// Pure data + pure functions only — imported by both the server functions and
// the UI so the client can render progress without duplicating the maths.

// --- XP ---------------------------------------------------------------------

export const XP_PER_TAP = 1;
export const XP_PER_TASK = 100;
export const XP_PER_DAILY = 50;
export const XP_PER_SPIN = 25;
export const XP_PER_REFERRAL = 200;

export const MAX_LEVEL = 50;

/** Cumulative XP required to reach a level. Level 1 starts at 0 XP. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return Math.round(125 * (l - 1) * l);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Progress within the current level, for XP bars. */
export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = level >= MAX_LEVEL ? floor : xpForLevel(level + 1);
  const span = Math.max(1, ceil - floor);
  return {
    level,
    xpIntoLevel: Math.max(0, xp - floor),
    xpForNext: level >= MAX_LEVEL ? 0 : span,
    pct: level >= MAX_LEVEL ? 100 : Math.min(100, ((xp - floor) / span) * 100),
  };
}

const LEVEL_TITLES = [
  "Stowaway",
  "Deckhand",
  "Sailor",
  "Bosun",
  "Gunner",
  "Quartermaster",
  "Navigator",
  "First Mate",
  "Captain",
  "Pirate Lord",
];

export function levelTitle(level: number): string {
  const idx = Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 5));
  return LEVEL_TITLES[idx];
}

/** Reward paid out when a player reaches `level`. */
export function levelUpReward(level: number): { dbl: number; gems: number } {
  return { dbl: 1_000 * level, gems: 5 + Math.floor(level / 2) };
}

// --- Streaks ----------------------------------------------------------------

/** Daily-claim multiplier earned by keeping a check-in streak alive. */
export function streakMultiplier(day: number): number {
  if (day >= 30) return 3;
  if (day >= 14) return 2.5;
  if (day >= 7) return 2;
  if (day >= 3) return 1.5;
  return 1;
}

export const STREAK_TIERS: { day: number; multiplier: number }[] = [
  { day: 1, multiplier: 1 },
  { day: 3, multiplier: 1.5 },
  { day: 7, multiplier: 2 },
  { day: 14, multiplier: 2.5 },
  { day: 30, multiplier: 3 },
];

/** Max stored streak freezes. One is granted every 7 completed streak days. */
export const MAX_STREAK_FREEZES = 3;
/** A freeze can rescue a streak for gaps up to this many hours. */
export const STREAK_FREEZE_WINDOW_HOURS = 72;
/** Paid once when a player returns after losing a streak of 3+ days. */
export const COMEBACK_BONUS_DBL = 2_500;
/** Gems paid per daily claim, plus a kicker on every 7th day. */
export const GEMS_PER_DAILY = 1;
export const GEMS_WEEKLY_BONUS = 5;

// --- Achievements -----------------------------------------------------------

export type AchievementStat =
  "total_taps" | "level" | "longest_streak" | "referrals" | "tasks" | "balance" | "spins";

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  stat: AchievementStat;
  threshold: number;
  dbl: number;
  gems: number;
  xp: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Tapping
  {
    id: "tap_100",
    name: "First Doubloons",
    description: "Tap 100 times.",
    icon: "🪙",
    stat: "total_taps",
    threshold: 100,
    dbl: 500,
    gems: 1,
    xp: 50,
  },
  {
    id: "tap_1k",
    name: "Deck Grinder",
    description: "Tap 1,000 times.",
    icon: "👆",
    stat: "total_taps",
    threshold: 1_000,
    dbl: 2_500,
    gems: 3,
    xp: 150,
  },
  {
    id: "tap_10k",
    name: "Tap Machine",
    description: "Tap 10,000 times.",
    icon: "⚡",
    stat: "total_taps",
    threshold: 10_000,
    dbl: 15_000,
    gems: 10,
    xp: 500,
  },
  {
    id: "tap_100k",
    name: "Unstoppable",
    description: "Tap 100,000 times.",
    icon: "🌪️",
    stat: "total_taps",
    threshold: 100_000,
    dbl: 100_000,
    gems: 40,
    xp: 2_000,
  },
  // Levels
  {
    id: "level_5",
    name: "Sailor Stripes",
    description: "Reach level 5.",
    icon: "🎖️",
    stat: "level",
    threshold: 5,
    dbl: 2_500,
    gems: 3,
    xp: 0,
  },
  {
    id: "level_15",
    name: "Officer",
    description: "Reach level 15.",
    icon: "🧭",
    stat: "level",
    threshold: 15,
    dbl: 20_000,
    gems: 12,
    xp: 0,
  },
  {
    id: "level_30",
    name: "Captain's Hat",
    description: "Reach level 30.",
    icon: "🏴‍☠️",
    stat: "level",
    threshold: 30,
    dbl: 75_000,
    gems: 30,
    xp: 0,
  },
  // Streaks
  {
    id: "streak_3",
    name: "Warming Up",
    description: "Keep a 3-day streak.",
    icon: "🔥",
    stat: "longest_streak",
    threshold: 3,
    dbl: 1_000,
    gems: 2,
    xp: 75,
  },
  {
    id: "streak_7",
    name: "Week Aboard",
    description: "Keep a 7-day streak.",
    icon: "📅",
    stat: "longest_streak",
    threshold: 7,
    dbl: 7_500,
    gems: 6,
    xp: 250,
  },
  {
    id: "streak_30",
    name: "Loyal Crew",
    description: "Keep a 30-day streak.",
    icon: "💎",
    stat: "longest_streak",
    threshold: 30,
    dbl: 50_000,
    gems: 25,
    xp: 1_000,
  },
  // Referrals
  {
    id: "ref_1",
    name: "Recruiter",
    description: "Invite your first friend.",
    icon: "🤝",
    stat: "referrals",
    threshold: 1,
    dbl: 1_000,
    gems: 2,
    xp: 100,
  },
  {
    id: "ref_10",
    name: "Crew Builder",
    description: "Invite 10 friends.",
    icon: "🧑‍🤝‍🧑",
    stat: "referrals",
    threshold: 10,
    dbl: 15_000,
    gems: 10,
    xp: 500,
  },
  {
    id: "ref_50",
    name: "Fleet Admiral",
    description: "Invite 50 friends.",
    icon: "⚓",
    stat: "referrals",
    threshold: 50,
    dbl: 100_000,
    gems: 50,
    xp: 2_500,
  },
  // Tasks
  {
    id: "task_1",
    name: "Getting Started",
    description: "Complete your first task.",
    icon: "✅",
    stat: "tasks",
    threshold: 1,
    dbl: 750,
    gems: 1,
    xp: 50,
  },
  {
    id: "task_all",
    name: "Taskmaster",
    description: "Complete 4 tasks.",
    icon: "📋",
    stat: "tasks",
    threshold: 4,
    dbl: 10_000,
    gems: 8,
    xp: 400,
  },
  // Spins
  {
    id: "spin_10",
    name: "Wheel Regular",
    description: "Spin the wheel 10 times.",
    icon: "🎡",
    stat: "spins",
    threshold: 10,
    dbl: 5_000,
    gems: 5,
    xp: 200,
  },
  // Balance
  {
    id: "bal_100k",
    name: "Treasure Chest",
    description: "Hold 100,000 DBL.",
    icon: "🧰",
    stat: "balance",
    threshold: 100_000,
    dbl: 10_000,
    gems: 8,
    xp: 300,
  },
  {
    id: "bal_1m",
    name: "Millionaire",
    description: "Hold 1,000,000 DBL.",
    icon: "👑",
    stat: "balance",
    threshold: 1_000_000,
    dbl: 75_000,
    gems: 35,
    xp: 1_500,
  },
];

/** Tap counts that can unlock an achievement — used to skip needless checks. */
export const TAP_ACHIEVEMENT_THRESHOLDS = ACHIEVEMENTS.filter((a) => a.stat === "total_taps").map(
  (a) => a.threshold,
);

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
