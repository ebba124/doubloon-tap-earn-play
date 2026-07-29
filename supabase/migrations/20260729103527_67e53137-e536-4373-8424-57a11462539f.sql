CREATE TYPE public.admin_role AS ENUM ('superadmin', 'withdraw_reviewer', 'economy_editor');

CREATE TABLE public.admin_roles (
  telegram_id BIGINT NOT NULL,
  role public.admin_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT,
  PRIMARY KEY (telegram_id, role)
);
GRANT ALL ON public.admin_roles TO service_role;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.economy_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by BIGINT
);
GRANT ALL ON public.economy_settings TO service_role;
ALTER TABLE public.economy_settings ENABLE ROW LEVEL SECURITY;