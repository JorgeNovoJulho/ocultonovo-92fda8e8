-- ============================================================================
-- OCULTO PLAY — Etapa 30
-- Mix Surpresa — playlist virtual personalizada por usuário.
-- Heurística: top kinds curtidos nos últimos 30d + frescor (7d) +
-- exclui itens já vistos. Idempotente, sem novas tabelas.
-- ============================================================================

create or replace function public.oculto_play_personal_mix(
  p_user_id uuid default null,
  p_limit   int  default 12
)
returns table (
  id            uuid,
  kind          text,
  title         text,
  thumb_url     text,
  media_url     text,
  view_count    int,
  like_count    int,
  author_id     uuid,
  affinity      numeric,
  created_at    timestamptz
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
    return;
  end if;

  return query
  with my_likes as (
    select i.kind, i.author_id, l.created_at
    from public.oculto_play_likes l
    join public.oculto_play_items i on i.id = l.item_id
    where l.user_id = v_user
      and l.created_at >= now() - interval '30 days'
  ),
  top_kinds as (
    select kind, count(*)::numeric as k_score
    from my_likes
    group by kind
    order by k_score desc
    limit 3
  ),
  top_authors as (
    select author_id, count(*)::numeric as a_score
    from my_likes
    where author_id is not null
    group by author_id
    order by a_score desc
    limit 10
  ),
  seen as (
    select item_id from public.oculto_play_views where user_id = v_user
  ),
  candidates as (
    select
      i.id, i.kind, i.title, i.thumb_url, i.media_url,
      i.view_count, i.like_count, i.author_id, i.created_at,
      coalesce(tk.k_score, 0) * 1.5
      + coalesce(ta.a_score, 0) * 2.0
      + case when i.created_at >= now() - interval '7 days' then 1.0 else 0.0 end
      + least(2.0, ln(greatest(2, i.view_count))::numeric / 3.0)
      as affinity
    from public.oculto_play_items i
    left join top_kinds   tk on tk.kind = i.kind
    left join top_authors ta on ta.author_id = i.author_id
    where i.is_published = true
      and i.author_id is distinct from v_user
      and i.id not in (select item_id from seen)
      and (
        exists (select 1 from top_kinds)   and tk.kind is not null
        or exists (select 1 from top_authors) and ta.author_id is not null
        or i.created_at >= now() - interval '3 days'
      )
  )
  select
    c.id, c.kind, c.title, c.thumb_url, c.media_url,
    c.view_count, c.like_count, c.author_id,
    round(c.affinity, 3) as affinity,
    c.created_at
  from candidates c
  order by c.affinity desc, c.created_at desc
  limit greatest(1, p_limit);
end;
$$;

revoke all on function public.oculto_play_personal_mix(uuid, int) from public;
grant execute on function public.oculto_play_personal_mix(uuid, int) to authenticated;
