-- =============================================================
-- Fatia 3.7 — Social Beta · Analytics interno por slot
-- Rodar no SQL Editor do Supabase EXTERNO. Idempotente.
-- =============================================================

-- 1) Tabela de eventos granulares (clicks, dwell, abas, ações)
create table if not exists public.oculto_social_beta_slot_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null check (slot in ('lounge','connections','games','dynamics','hub')),
  event text not null,                  -- ex.: 'click_invite','dwell','open_subarea','start_session'
  seconds_spent integer,                -- usado quando event='dwell'
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sb_slot_events_slot_time
  on public.oculto_social_beta_slot_events (slot, created_at desc);
create index if not exists idx_sb_slot_events_event_time
  on public.oculto_social_beta_slot_events (event, created_at desc);
create index if not exists idx_sb_slot_events_user_time
  on public.oculto_social_beta_slot_events (user_id, created_at desc);

alter table public.oculto_social_beta_slot_events enable row level security;

drop policy if exists "sb_slot_events_master_read" on public.oculto_social_beta_slot_events;
create policy "sb_slot_events_master_read"
  on public.oculto_social_beta_slot_events
  for select to authenticated
  using (public.aura_is_master_admin());

drop policy if exists "sb_slot_events_self_insert" on public.oculto_social_beta_slot_events;
create policy "sb_slot_events_self_insert"
  on public.oculto_social_beta_slot_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- 2) RPC para registrar evento (autenticado, com acesso ao Social Beta)
create or replace function public.social_beta_record_slot_event(
  _slot text,
  _event text,
  _seconds_spent integer default null,
  _meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  if not public.social_beta_can_access(uid) then return; end if;
  if _slot is null or _event is null then return; end if;
  if length(_event) > 64 then return; end if;

  insert into public.oculto_social_beta_slot_events (user_id, slot, event, seconds_spent, meta)
  values (uid, _slot, _event, _seconds_spent, coalesce(_meta, '{}'::jsonb));
end;
$$;

grant execute on function public.social_beta_record_slot_event(text, text, integer, jsonb) to authenticated;

-- 3) RPC agregadora — visão por slot/evento/janela (master-only)
create or replace function public.social_beta_slot_analytics()
returns table (
  slot text,
  event text,
  count_total bigint,
  count_24h bigint,
  count_7d bigint,
  count_30d bigint,
  unique_users_30d bigint,
  avg_seconds_30d numeric,
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

  return query
    select
      e.slot,
      e.event,
      count(*)::bigint as count_total,
      count(*) filter (where e.created_at >= now() - interval '24 hours')::bigint as count_24h,
      count(*) filter (where e.created_at >= now() - interval '7 days')::bigint as count_7d,
      count(*) filter (where e.created_at >= now() - interval '30 days')::bigint as count_30d,
      count(distinct e.user_id) filter (where e.created_at >= now() - interval '30 days')::bigint as unique_users_30d,
      round(avg(e.seconds_spent) filter (where e.event = 'dwell' and e.created_at >= now() - interval '30 days')::numeric, 1) as avg_seconds_30d,
      max(e.created_at) as last_event
    from public.oculto_social_beta_slot_events e
    group by e.slot, e.event
    order by e.slot, count_30d desc;
end;
$$;

grant execute on function public.social_beta_slot_analytics() to authenticated;
