-- ============================================================================
-- OCULTO PLAY — Etapa 29
-- Marcos (milestones) do criador: identifica itens que cruzaram
-- thresholds de views/likes para celebrar no app.
-- Sem novas tabelas. Stateless: o frontend decide o que já foi mostrado.
-- ============================================================================

create or replace function public.oculto_play_creator_milestones(
  p_user_id uuid default null,
  p_limit   int  default 10
)
returns table (
  item_id        uuid,
  title          text,
  thumb_url      text,
  kind           text,
  metric         text,    -- 'views' ou 'likes'
  threshold      int,
  current_value  bigint,
  reached_recent boolean  -- true se cresceu nas últimas 24h
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
  with thresholds(metric, threshold) as (
    values
      ('views', 100),  ('views', 500),  ('views', 1000),
      ('views', 5000), ('views', 10000), ('views', 50000),
      ('likes', 10),   ('likes', 50),   ('likes', 100),
      ('likes', 500),  ('likes', 1000)
  ),
  my_items as (
    select
      i.id,
      i.title,
      i.thumb_url,
      i.kind,
      i.view_count,
      i.like_count,
      i.created_at
    from public.oculto_play_items i
    where i.author_id = v_user
      and i.is_published = true
  ),
  matches as (
    select
      mi.id          as item_id,
      mi.title,
      mi.thumb_url,
      mi.kind,
      t.metric,
      t.threshold,
      case t.metric
        when 'views' then mi.view_count::bigint
        when 'likes' then mi.like_count::bigint
      end as current_value,
      -- "Recente" = item criado nas últimas 24h OU recebeu views/likes recentes
      (mi.created_at >= now() - interval '24 hours') as reached_recent
    from my_items mi
    cross join thresholds t
    where case t.metric
            when 'views' then mi.view_count
            when 'likes' then mi.like_count
          end >= t.threshold
  ),
  -- só o maior threshold cruzado por item/metric
  top_per_item as (
    select distinct on (m.item_id, m.metric)
      m.item_id, m.title, m.thumb_url, m.kind,
      m.metric, m.threshold, m.current_value, m.reached_recent
    from matches m
    order by m.item_id, m.metric, m.threshold desc
  )
  select
    item_id, title, thumb_url, kind,
    metric, threshold, current_value, reached_recent
  from top_per_item
  order by reached_recent desc, threshold desc, current_value desc
  limit greatest(1, p_limit);
end;
$$;

revoke all on function public.oculto_play_creator_milestones(uuid, int) from public;
grant execute on function public.oculto_play_creator_milestones(uuid, int) to authenticated;
