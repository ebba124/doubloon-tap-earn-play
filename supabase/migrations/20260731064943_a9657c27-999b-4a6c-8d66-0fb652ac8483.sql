INSERT INTO public.admin_roles (telegram_id, role)
VALUES (6724417946, 'superadmin')
ON CONFLICT (telegram_id, role) DO NOTHING;