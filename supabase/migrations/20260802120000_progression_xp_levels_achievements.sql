-- Phase 1 gamification: XP, levels, gems, streak upgrades, achievements.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS xp BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS gems BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_freezes INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_xp ON public.users(xp DESC);

-- Unlocked achievements (achievement_id defined in src/lib/progression.ts)
CREATE TABLE IF NOT EXISTS public.achievements (
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_achievements_user ON public.achievements(user_id);
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
-- No policies: all access via server functions using the service role.

-- Backfill longest_streak for existing players.
UPDATE public.users SET longest_streak = streak_day WHERE longest_streak < streak_day;
