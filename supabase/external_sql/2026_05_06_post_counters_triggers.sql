-- ============================================================
-- Contadores de interações em posts (likes, dislikes, comments, saves, shares)
-- + Realtime para feed e tabelas de interação.
-- 100% idempotente — pode ser executado várias vezes sem erro.
-- ============================================================

-- 1) Garante colunas de contadores em posts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='posts') THEN
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS likes_count    integer NOT NULL DEFAULT 0;
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS dislikes_count integer NOT NULL DEFAULT 0;
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0;
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS saves_count    integer NOT NULL DEFAULT 0;
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS shares_count   integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 2) Função genérica para ajustar contadores +/- 1
CREATE OR REPLACE FUNCTION public.fn_post_counter_bump(
  _post_id uuid, _column text, _delta int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE format(
    'UPDATE public.posts SET %I = GREATEST(0, COALESCE(%I,0) + $1) WHERE id = $2',
    _column, _column
  ) USING _delta, _post_id;
END $$;

-- 3) Triggers por tabela
DO $$
DECLARE
  cfg RECORD;
BEGIN
  FOR cfg IN
    SELECT * FROM (VALUES
      ('post_likes',    'likes_count'),
      ('post_dislikes', 'dislikes_count'),
      ('post_comments', 'comments_count'),
      ('saved_posts',   'saves_count'),
      ('post_shares',   'shares_count')
    ) AS t(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=cfg.tbl
    ) THEN
      -- Cria função específica (uma por tabela) para encapsular o nome da coluna
      EXECUTE format($f$
        CREATE OR REPLACE FUNCTION public.fn_trg_%1$s_count()
        RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
        BEGIN
          IF (TG_OP = 'INSERT') THEN
            PERFORM public.fn_post_counter_bump(NEW.post_id, %2$L, 1);
            RETURN NEW;
          ELSIF (TG_OP = 'DELETE') THEN
            PERFORM public.fn_post_counter_bump(OLD.post_id, %2$L, -1);
            RETURN OLD;
          END IF;
          RETURN NULL;
        END $body$;
      $f$, cfg.tbl, cfg.col);

      EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_count ON public.%1$s', cfg.tbl);
      EXECUTE format($t$
        CREATE TRIGGER trg_%1$s_count
        AFTER INSERT OR DELETE ON public.%1$s
        FOR EACH ROW EXECUTE FUNCTION public.fn_trg_%1$s_count();
      $t$, cfg.tbl);
    END IF;
  END LOOP;
END $$;

-- 4) Backfill inicial (uma vez é o suficiente — idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='posts') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_likes') THEN
      UPDATE public.posts p SET likes_count = COALESCE(c.n,0)
      FROM (SELECT post_id, COUNT(*)::int n FROM public.post_likes GROUP BY post_id) c
      WHERE p.id = c.post_id AND p.likes_count IS DISTINCT FROM c.n;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_dislikes') THEN
      UPDATE public.posts p SET dislikes_count = COALESCE(c.n,0)
      FROM (SELECT post_id, COUNT(*)::int n FROM public.post_dislikes GROUP BY post_id) c
      WHERE p.id = c.post_id AND p.dislikes_count IS DISTINCT FROM c.n;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_comments') THEN
      UPDATE public.posts p SET comments_count = COALESCE(c.n,0)
      FROM (SELECT post_id, COUNT(*)::int n FROM public.post_comments GROUP BY post_id) c
      WHERE p.id = c.post_id AND p.comments_count IS DISTINCT FROM c.n;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='saved_posts') THEN
      UPDATE public.posts p SET saves_count = COALESCE(c.n,0)
      FROM (SELECT post_id, COUNT(*)::int n FROM public.saved_posts GROUP BY post_id) c
      WHERE p.id = c.post_id AND p.saves_count IS DISTINCT FROM c.n;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_shares') THEN
      UPDATE public.posts p SET shares_count = COALESCE(c.n,0)
      FROM (SELECT post_id, COUNT(*)::int n FROM public.post_shares GROUP BY post_id) c
      WHERE p.id = c.post_id AND p.shares_count IS DISTINCT FROM c.n;
    END IF;
  END IF;
END $$;

-- 5) Realtime — garante publication + REPLICA IDENTITY FULL e adiciona tabelas
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'posts','profiles',
    'post_likes','post_dislikes','post_comments','saved_posts','post_shares'
  ];
  already_member BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) INTO already_member;
      IF NOT already_member THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
