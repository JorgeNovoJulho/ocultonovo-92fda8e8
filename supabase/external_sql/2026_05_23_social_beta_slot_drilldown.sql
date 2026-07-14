-- =============================================================
-- Fatias 3.11 / 3.13 — Social Beta · Drilldown por usuário + Timeline diária
-- Rodar no SQL Editor do Supabase EXTERNO. Idempotente. Master-only.
-- =============================================================

-- 1) Top usuários para um (slot, event) nos últimos N dias
create or replace function public.social_beta_slot_event_users(
  _slot text,
  _event text,
  _days integer default 30,
  _limit integer default 25
) returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  event_count bigint,
  last_event timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.aura_is_master_admin() then
    return;
  end if;
  if _slot is null or _event is null then
    return;
  end if;

  return query
    select
      e.user_id,
      p.username,
      coalesce(p.display_name, p.username) as display_name,
      p.avatar_url,
      count(*)::bigint as event_count,
      max(e.created_at) as last_event
    from public.oculto_social_beta_slot_events e
    left join public.profiles p on p.user_id = e.user_id
    where e.slot = _slot
      and e.event = _event
      and e.created_at >= now() - make_interval(days => greatest(_days, 1))
    group by e.user_id, p.username, p.display_name, p.avatar_url
    order by event_count desc, last_event desc
    limit greatest(_limit, 1);
end;
$$;

grant execute on function public.social_beta_slot_event_users(text, text, integer, integer) to authenticated;

-- 2) Série diária para um (slot, event) nos últimos N dias
create or replace function public.social_beta_slot_event_timeline(
  _slot text,
  _event text,
  _days integer default 14
) returns table (
  day date,
  count_total bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  d integer := greatest(_days, 1);
begin
  if not public.aura_is_master_admin() then
    return;
  end if;
  if _slot is null or _event is null then
    return;
  end if;

  return query
    with days as (
      select (current_date - g)::date as day
      from generate_series(0, d - 1) as g
    ),
    agg as (
      select date_trunc('day', e.created_at)::date as day, count(*)::bigint as c
      from public.oculto_social_beta_slot_events e
      where e.slot = _slot
        and e.event = _event
        and e.created_at >= current_date - (d - 1)
      group by 1
    )
    select days.day, coalesce(agg.c, 0)::bigint as count_total
    from days
    left join agg using (day)
    order by days.day asc;
end;
$$;

grant execute on function public.social_beta_slot_event_timeline(text, text, integer) to authenticated;
