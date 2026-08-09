-- Atomic RPCs backing the tap and daily-claim server functions.
-- These were referenced from src/lib/game.functions.ts but never defined,
-- so every tap and daily claim failed at the database call.

CREATE OR REPLACE FUNCTION public.apply_tap_reward(
  p_user_id BIGINT,
  p_dbl NUMERIC,
  p_xp BIGINT,
  p_energy INTEGER,
  p_total_taps BIGINT
)
RETURNS SETOF public.users
LANGUAGE sql
AS $$
  UPDATE public.users
  SET
    balance = balance + p_dbl,
    xp = xp + p_xp,
    energy = p_energy,
    total_taps = p_total_taps,
    last_energy_update = now()
  WHERE id = p_user_id
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION public.apply_tap_reward(BIGINT, NUMERIC, BIGINT, INTEGER, BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_daily_reward(
  p_user_id BIGINT,
  p_reward NUMERIC,
  p_day INTEGER,
  p_longest_streak INTEGER,
  p_freezes INTEGER,
  p_claimed_at TIMESTAMPTZ
)
RETURNS SETOF public.users
LANGUAGE sql
AS $$
  UPDATE public.users
  SET
    balance = balance + p_reward,
    streak_day = p_day,
    longest_streak = p_longest_streak,
    streak_freezes = p_freezes,
    last_daily_claim = p_claimed_at
  WHERE id = p_user_id
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward(BIGINT, NUMERIC, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ) TO service_role;
