-- ============================================================================
-- OCULTO PLAY — Etapa 27
-- Presença do criador nas playlists editoriais ativas.
-- Idempotente. Sem novas tabelas.
-- ============================================================================

create or replace function public.oculto_play_creator_playlist_presence(
  p_user_id uuid default null
)
returns table (
  playlists_count   bigint,
  items_in_playlists bigint,
  top_playlists     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
begin
  if v_user is null then
    return query select 0::bigint, 0::bigint, '[]'::jsonb;
    return;
  end if;

  return query
  with creator_items as (
    select id
    from public.oculto_play_items
    where author_id = v_user
  ),
  joins as (
    select
      pli.playlist_id,
      pli.item_id,
      pl.title,
      pl.slug
    from public.oculto_play_playlist_items pli
    join public.oculto_play_playlists pl
      on pl.id = pli.playlist_id and pl.is_active = true
    join creator_items ci
      on ci.id = pli.item_id
  ),
  agg as (
    select
      count(distinct playlist_id)::bigint as playlists_count,
      count(distinct item_id)::bigint as items_in_playlists
    from joins
  ),
  top as (
    select jsonb_agg(t)
    from (
      select
        playlist_id,
        title,
        slug,
        count(*)::bigint as item_count
      from joins
      group by playlist_id, title, slug
      order by item_count desc, title asc
      limit 5
    ) t
  )
  select
    agg.playlists_count,
    agg.items_in_playlists,
    coalesce((select * from top), '[]'::jsonb)
  from agg;
end;
$$;

revoke all on function public.oculto_play_creator_playlist_presence(uuid) from public;
grant execute on function public.oculto_play_creator_playlist_presence(uuid) to authenticated;
