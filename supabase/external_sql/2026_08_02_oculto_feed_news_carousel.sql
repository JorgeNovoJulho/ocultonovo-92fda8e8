-- ============================================================
-- Carrossel "Novidades do Oculto" — card 2 (novidades recentes)
-- gerenciado pelo administrador master no painel.
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_feed_news (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  emoji       text,
  position    int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oculto_feed_news TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.oculto_feed_news TO authenticated;
GRANT ALL ON public.oculto_feed_news TO service_role;

ALTER TABLE public.oculto_feed_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oculto_feed_news_select_all ON public.oculto_feed_news;
CREATE POLICY oculto_feed_news_select_all
  ON public.oculto_feed_news FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS oculto_feed_news_write_master ON public.oculto_feed_news;
CREATE POLICY oculto_feed_news_write_master
  ON public.oculto_feed_news FOR ALL
  TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

-- Seed inicial (só se a tabela estiver vazia)
INSERT INTO public.oculto_feed_news (title, emoji, position)
SELECT * FROM (VALUES
  ('É possível reagir e responder um comentário', '✨', 1),
  ('Agora você pode mencionar amig@s em publicações', '✨', 2),
  ('Novos filmes e músicas no Oculto Play', '🎬', 3),
  ('Correção de bugs e atualizações de segurança', '🛡️', 4)
) AS v(title, emoji, position)
WHERE NOT EXISTS (SELECT 1 FROM public.oculto_feed_news);

NOTIFY pgrst, 'reload schema';
