-- ============================================================================
-- Comunidades Ocultas — Parte 11 (idempotente + defensivo)
-- Persistência de mídia em oculto_community_media para a aba Mídia
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_community_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.oculto_community_topics(id) ON DELETE CASCADE,
  reply_id uuid REFERENCES public.oculto_community_replies(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image','video','audio')),
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Garantir colunas mesmo se tabela legada já existir
ALTER TABLE public.oculto_community_media
  ADD COLUMN IF NOT EXISTS community_id uuid,
  ADD COLUMN IF NOT EXISTS topic_id     uuid,
  ADD COLUMN IF NOT EXISTS reply_id     uuid,
  ADD COLUMN IF NOT EXISTS author_id    uuid,
  ADD COLUMN IF NOT EXISTS kind         text,
  ADD COLUMN IF NOT EXISTS url          text,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz NOT NULL DEFAULT now();

-- Forçar NOT NULL onde for seguro
DO $$
BEGIN
  BEGIN ALTER TABLE public.oculto_community_media ALTER COLUMN community_id SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.oculto_community_media ALTER COLUMN author_id    SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.oculto_community_media ALTER COLUMN kind         SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.oculto_community_media ALTER COLUMN url          SET NOT NULL; EXCEPTION WHEN others THEN NULL; END;
END $$;

CREATE INDEX IF NOT EXISTS idx_oculto_community_media_community
  ON public.oculto_community_media(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_community_media_topic
  ON public.oculto_community_media(topic_id);

GRANT SELECT, INSERT ON public.oculto_community_media TO authenticated;
GRANT ALL ON public.oculto_community_media TO service_role;

ALTER TABLE public.oculto_community_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read community media" ON public.oculto_community_media;
CREATE POLICY "members read community media"
ON public.oculto_community_media
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.oculto_community_members m
    WHERE m.community_id = oculto_community_media.community_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  )
);

DROP POLICY IF EXISTS "author inserts own community media" ON public.oculto_community_media;
CREATE POLICY "author inserts own community media"
ON public.oculto_community_media
FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "owners/mods delete community media" ON public.oculto_community_media;
CREATE POLICY "owners/mods delete community media"
ON public.oculto_community_media
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.oculto_community_members m
    WHERE m.community_id = oculto_community_media.community_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','moderator')
      AND m.status = 'active'
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

NOTIFY pgrst, 'reload schema';
