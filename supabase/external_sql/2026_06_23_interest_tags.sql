-- ============================================================
-- TAGS DE INTERESSE — Configuráveis pelo admin
-- Externo: rvybbrkzmboqbhcemqar — rodar no SQL Editor
-- Idempotente
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_interest_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('social','adult')),
  name text NOT NULL,
  icon text,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_interest_tags_kind_name
  ON public.oculto_interest_tags (kind, lower(name));
CREATE INDEX IF NOT EXISTS idx_interest_tags_active
  ON public.oculto_interest_tags (is_active, position);

GRANT SELECT ON public.oculto_interest_tags TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.oculto_interest_tags TO authenticated;
GRANT ALL ON public.oculto_interest_tags TO service_role;

ALTER TABLE public.oculto_interest_tags ENABLE ROW LEVEL SECURITY;

-- Reuso da função de master admin já existente (criada por tutoriais)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_master_admin_tutorials') THEN
    CREATE OR REPLACE FUNCTION public.is_master_admin_tutorials(_uid uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $f$
      SELECT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = _uid
          AND lower(regexp_replace(coalesce(p.username, ''), '[^a-zA-Z0-9]', '', 'g')) = 'ocultomaster'
      ) OR EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = _uid
          AND lower(coalesce(u.email, '')) = 'ocultomaster@ocultoswing.com.br'
      );
    $f$;
  END IF;
END $$;

DROP POLICY IF EXISTS "interest_tags_select_all" ON public.oculto_interest_tags;
CREATE POLICY "interest_tags_select_all" ON public.oculto_interest_tags
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "interest_tags_master_insert" ON public.oculto_interest_tags;
CREATE POLICY "interest_tags_master_insert" ON public.oculto_interest_tags
  FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin_tutorials(auth.uid()));

DROP POLICY IF EXISTS "interest_tags_master_update" ON public.oculto_interest_tags;
CREATE POLICY "interest_tags_master_update" ON public.oculto_interest_tags
  FOR UPDATE TO authenticated
  USING (public.is_master_admin_tutorials(auth.uid()))
  WITH CHECK (public.is_master_admin_tutorials(auth.uid()));

DROP POLICY IF EXISTS "interest_tags_master_delete" ON public.oculto_interest_tags;
CREATE POLICY "interest_tags_master_delete" ON public.oculto_interest_tags
  FOR DELETE TO authenticated
  USING (public.is_master_admin_tutorials(auth.uid()));

CREATE OR REPLACE FUNCTION public.oculto_interest_tags_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_oculto_interest_tags_touch ON public.oculto_interest_tags;
CREATE TRIGGER trg_oculto_interest_tags_touch
  BEFORE UPDATE ON public.oculto_interest_tags
  FOR EACH ROW EXECUTE FUNCTION public.oculto_interest_tags_touch();

ALTER TABLE public.oculto_interest_tags REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'oculto_interest_tags'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_interest_tags';
  END IF;
END $$;

-- SEED — espelha src/data/tagsData.ts (idempotente via ON CONFLICT)
INSERT INTO public.oculto_interest_tags (kind, name, icon, position) VALUES
('social','Rock','🎸',10),('social','Futebol','⚽',20),('social','Filmes de Terror','🎃',30),
('social','Academia','💪',40),('social','Viagens','✈️',50),('social','Gastronomia','🍽️',60),
('social','Games','🎮',70),('social','Anime','🌸',80),('social','Cerveja Artesanal','🍺',90),
('social','Vinho','🍷',100),('social','Praia','🏖️',110),('social','Acampar','⛺',120),
('social','Fotografia','📷',130),('social','Tatuagem','🖋️',140),('social','Signos','♈',150),
('social','Café','☕',160),('social','Séries','📺',170),('social','Literatura','📚',180),
('social','Yoga','🧘',190),('social','Pet Friendly','🐾',200),('social','Festas','🎉',210),
('social','Poker','♠️',220),('social','Skate','🛹',230),('social','Meditação','🕯️',240),
('social','Trilhas','🥾',250),('social','Tecnologia','💻',260),('social','Dança','💃',270),
('social','Podcast','🎙️',280),('social','Idiomas','🌍',290),('social','Pintura','🎨',300),
('adult','Anal','🔥',10),('adult','DP (Dupla)','🔥',20),('adult','Sadomasoquismo','⛓️',30),
('adult','Oral','💋',40),('adult','Bi Feminino','🌈',50),('adult','Bi Masculino','🌈',60),
('adult','Menage','👥',70),('adult','Menage Masculino','👥',80),('adult','Menage Feminino','👥',90),
('adult','Gang Bang','🔞',100),('adult','Gozo Facial','💦',110),('adult','Cuckold','👀',120),
('adult','BDSM','⛓️',130),('adult','Dominação','👑',140),('adult','Submissão','🔒',150),
('adult','Fetiche por Pés','🦶',160),('adult','Roleplay','🎭',170),('adult','Voyeurismo','👁️',180),
('adult','Exibicionismo','✨',190),('adult','Squirt','💦',200),('adult','Deepthroat','💋',210),
('adult','Bondage','🪢',220),('adult','Swing','🔄',230),('adult','Golden Shower','🌧️',240),
('adult','Spanking','🖐️',250),('adult','Pegging','🔥',260),('adult','Creampie','💦',270),
('adult','Milf/Dilf','💎',280),('adult','Massagem Erótica','💆',290),('adult','Fantasias','🎭',300),
('adult','Brinquedos','🧸',310),('adult','Orgia','🔞',320),('adult','Trans','🏳️‍⚧️',330),
('adult','Cross','👗',340),('adult','Gay','🌈',350),('adult','2 Homens','👬',360),
('adult','2 Mulheres','👭',370),('adult','Hot Wife','🔥',380),('adult','BBW','💖',390),
('adult','Negros','🖤',400),('adult','Brancos','🤍',410),('adult','Asiáticos','🌸',420),
('adult','Novidades','🆕',430)
ON CONFLICT (kind, lower(name)) DO NOTHING;

NOTIFY pgrst, 'reload schema';
