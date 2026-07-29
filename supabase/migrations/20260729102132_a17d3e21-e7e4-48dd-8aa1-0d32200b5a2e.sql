
-- Users (Telegram users; PK = telegram user id)
CREATE TABLE public.users (
  id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  language_code TEXT,
  balance NUMERIC NOT NULL DEFAULT 0,
  energy INTEGER NOT NULL DEFAULT 1000,
  energy_max INTEGER NOT NULL DEFAULT 1000,
  energy_regen_per_sec NUMERIC NOT NULL DEFAULT 1,
  tap_value INTEGER NOT NULL DEFAULT 1,
  tap_multiplier_permanent INTEGER NOT NULL DEFAULT 1,
  multitap_level INTEGER NOT NULL DEFAULT 1,
  energy_limit_level INTEGER NOT NULL DEFAULT 1,
  last_energy_update TIMESTAMPTZ NOT NULL DEFAULT now(),
  streak_day INTEGER NOT NULL DEFAULT 0,
  last_daily_claim TIMESTAMPTZ,
  referred_by BIGINT,
  total_taps BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- No policies: all access via server functions using service role after Telegram initData verification.

-- Referrals
CREATE TABLE public.referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  reward_paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_id);
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Pending referrals (from /start ref_<id> before invitee opens the app)
CREATE TABLE public.pending_referrals (
  referred_id BIGINT PRIMARY KEY,
  referrer_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.pending_referrals TO service_role;
ALTER TABLE public.pending_referrals ENABLE ROW LEVEL SECURITY;

-- Tasks completed (task_id defined in economy_config)
CREATE TABLE public.tasks_done (
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);
GRANT ALL ON public.tasks_done TO service_role;
ALTER TABLE public.tasks_done ENABLE ROW LEVEL SECURITY;

-- Withdrawals
CREATE TABLE public.withdrawals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_dbl NUMERIC NOT NULL,
  amount_usdt NUMERIC NOT NULL,
  method TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT
);
CREATE INDEX idx_withdrawals_user ON public.withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON public.withdrawals(status);
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- Audit log
CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  action TEXT NOT NULL,
  delta NUMERIC,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user ON public.audit_log(user_id);
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Idempotency keys for tap/boost
CREATE TABLE public.idempotency (
  key TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.idempotency TO service_role;
ALTER TABLE public.idempotency ENABLE ROW LEVEL SECURITY;
