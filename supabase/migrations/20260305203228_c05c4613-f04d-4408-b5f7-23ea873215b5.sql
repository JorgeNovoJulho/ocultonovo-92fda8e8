CREATE TABLE IF NOT EXISTS public.addon_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price_monthly numeric(10,2) NOT NULL DEFAULT 9.90,
  is_enabled boolean NOT NULL DEFAULT true,
  min_plan text NOT NULL DEFAULT 'premium',
  icon text DEFAULT 'ghost',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.addon_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "addon_configs_public_read" ON public.addon_configs
  FOR SELECT USING (true);

CREATE POLICY "addon_configs_admin_write" ON public.addon_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

INSERT INTO public.addon_configs (slug, name, description, price_monthly, is_enabled, min_plan, icon)
VALUES ('ghost_mode', 'Modo Fantasma', 'Navegue de forma invisível — suas visitas não serão registradas', 9.90, true, 'premium', 'ghost')
ON CONFLICT (slug) DO NOTHING;