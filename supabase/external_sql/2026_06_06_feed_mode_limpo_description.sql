-- ============================================================
-- Atualiza a descrição do modo "Limpo" no seletor de visualização.
-- Externo: rvybbrkzmboqbhcemqar.supabase.co — SQL Editor.
-- Idempotente.
-- Agora o modo Limpo inclui, por padrão, Stories + Comunidades
-- Ocultas + Salas Ocultas, além dos posts.
-- ============================================================

UPDATE public.oculto_feed_modes_config
   SET label = 'Limpo',
       description = 'Posts + Stories, Comunidades e Salas Ocultas — sem distrações extras'
 WHERE mode_id = 'limpo';
