-- ============================================================================
-- 2026-05-23 — MÓDULO SOCIAL BETA — Visitas + Métricas (idempotente)
-- Executar manualmente no SQL Editor do Supabase EXTERNO, após o arquivo base.
-- ============================================================================

-- 1) Tabela de visitas por sub-área (slot) -----------------------------------
create table if not exists public.oculto_social_beta_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  slot text not null check (slot in ('hub','lounge','connections','games','dynamics')),
  visited_at timestamptz not null default now()
);

create index if not exists idx_social_beta_visits_slot_time
  on public.oculto_social_beta_visits (slot, visited_at desc);

create index if not exists idx_social_beta_visits_user_time
  on public.oculto_social_beta_visits (user_id, visited_at desc);

alter table public.oculto_social_beta_visits enable row level security;

drop policy if exists "social_beta_visits_master_read" on public.oculto_social_beta_visits;
create policy "social_beta_visits_master_read"
  on public.oculto_social_beta_visits
  for select
  to authenticated
  using (public.oculto_is_master_admin(auth.uid()));

drop policy if exists "social_beta_visits_self_insert" on public.oculto_social_beta_visits;
create policy "social_beta_visits_self_insert"
  on public.oculto_social_beta_visits
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 2) RPC: registrar visita ---------------------------------------------------
create or replace function public.social_beta_record_visit(_slot text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  norm text := lower(coalesce(_slot, ''));
begin
  if uid is null then return; end if;
  if norm not in ('hub','lounge','connections','games','dynamics') then return; end if;
  if not public.social_beta_can_access(uid) then return; end if;

  -- 1 registro por (user, slot) por minuto: evita spam de remontagens
  if exists (
    select 1 from public.oculto_social_beta_visits v
    where v.user_id = uid
      and v.slot = norm
      and v.visited_at > now() - interval '1 minute'
  ) then return; end if;

  insert into public.oculto_social_beta_visits (user_id, slot)
  values (uid, norm);
end;
$$;

grant execute on function public.social_beta_record_visit(text) to authenticated;

-- 3) RPC: métricas (master-only) --------------------------------------------
create or replace function public.social_beta_metrics()
returns table (
  slot text,
  visits_total bigint,
  visits_7d bigint,
  visits_30d bigint,
  unique_users_30d bigint,
  last_visit timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.oculto_is_master_admin(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with slots as (
    select unnest(array['hub','lounge','connections','games','dynamics']) as slot
  )
  select
    s.slot,
    coalesce(count(v.id), 0)::bigint as visits_total,
    coalesce(count(v.id) filter (where v.visited_at > now() - interval '7 days'), 0)::bigint as visits_7d,
    coalesce(count(v.id) filter (where v.visited_at > now() - interval '30 days'), 0)::bigint as visits_30d,
    coalesce(count(distinct v.user_id) filter (where v.visited_at > now() - interval '30 days'), 0)::bigint as unique_users_30d,
    max(v.visited_at) as last_visit
  from slots s
  left join public.oculto_social_beta_visits v on v.slot = s.slot
  group by s.slot
  order by s.slot;
end;
$$;

grant execute on function public.social_beta_metrics() to authenticated;

-- 4) RPC: busca de candidatos por username/nome (master-only) ---------------
create or replace function public.social_beta_search_users(_query text, _limit int default 10)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  is_selected boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := trim(coalesce(_query, ''));
  lim int := least(greatest(coalesce(_limit, 10), 1), 25);
  selected_ids uuid[];
begin
  if not public.oculto_is_master_admin(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if length(q) < 2 then return; end if;

  select coalesce(c.selected_users, array[]::uuid[])
    into selected_ids
    from public.oculto_social_beta_config c
   order by c.created_at
   limit 1;

  return query
  select
    p.user_id,
    p.username,
    p.name,
    p.avatar_url,
    (p.user_id = any(coalesce(selected_ids, array[]::uuid[]))) as is_selected
  from public.profiles p
  where p.user_id is not null
    and (
      p.username ilike '%' || q || '%'
      or p.name ilike '%' || q || '%'
    )
  order by
    case when lower(coalesce(p.username, '')) = lower(q) then 0 else 1 end,
    p.username asc
  limit lim;
end;
$$;

grant execute on function public.social_beta_search_users(text, int) to authenticated;

notify pgrst, 'reload schema';
