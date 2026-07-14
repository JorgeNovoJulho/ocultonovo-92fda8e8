-- ============================================================================
-- OCULTO PLAY — Etapa 28
-- "Pico agora" — detecta itens do criador com surge de views recente.
-- Sem novas tabelas. Idempotente.
--
-- Heurística:
--   recent   = views únicas com last_seen_at >= now() - p_window_min
--   baseline = views únicas entre (now()-24h) e (now()-window),
--              normalizado pela mesma duração da janela
--   surge se recent >= p_min_recent e recent >= baseline * p_min_ratio
-- ============================================================================

create or replace function public.oculto_play_creator_surges(
  p_window_min  int     default 30,
  p_min_ratio   numeric default 2.5,
  p_min_recent  int     default 5,
  p_limit       int     default 10,
  p_user_id     uuid    default null
)
returns table (
  item_id        uuid,
  title          text,
  thumb_url      text,
  kind           text,
  recent_views   bigint,
  baseline_views numeric,
  surge_ratio    numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_window interval := make_interval(mins => greatest(5, p_window_min));
  v_baseline_buckets numeric;
begin
  if v_user is null then
    return;
  end if;

  -- Quantas janelas cabem em 24h - 1 (excluindo a janela "recente")
  v_baseline_buckets := greatest(1, ((24 * 60.0) / greatest(5, p_window_min)) - 1);

  return query
  with my_items as (
    select i.id, i.title, i.thumb_url, i.kind
    from public.oculto_play_items i
    where i.author_id = v_user
      and i.is_published = true
  ),
  agg as (
    select
      v.item_id,
      count(*) filter (where v.last_seen_at >= now() - v_window)::bigint as recent_views,
      (count(*) filter (
        where v.last_seen_at >= now() - interval '24 hours'
          and v.last_seen_at <  now() - v_window
      ))::numeric / v_baseline_buckets as baseline_views
    from public.oculto_play_views v
    where v.item_id in (select id from my_items)
      and v.last_seen_at >= now() - interval '24 hours'
    group by v.item_id
  )
  select
    mi.id,
    mi.title,
    mi.thumb_url,
    mi.kind,
    a.recent_views,
    round(a.baseline_views, 2) as baseline_views,
    round(
      case
        when a.baseline_views <= 0 then a.recent_views::numeric
        else a.recent_views::numeric / a.baseline_views
      end,
      2
    ) as surge_ratio
  from agg a
  join my_items mi on mi.id = a.item_id
  where a.recent_views >= p_min_recent
    and (
      a.baseline_views <= 0
      or a.recent_views >= a.baseline_views * p_min_ratio
    )
  order by surge_ratio desc, recent_views desc
  limit greatest(1, p_limit);
end;
$$;

revoke all on function public.oculto_play_creator_surges(int, numeric, int, int, uuid) from public;
grant execute on function public.oculto_play_creator_surges(int, numeric, int, int, uuid) to authenticated;
