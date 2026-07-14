-- ============================================================================
-- 2026-05-23 — MÓDULO SOCIAL BETA — Conteúdo real por sub-área (Fatia 3.6)
-- Idempotente — pode rodar várias vezes no SQL Editor do Supabase EXTERNO
-- ============================================================================

-- 1) RPC: usuários recentes em uma sub-área (últimas 24h, anônimo opcional) -
--    Para alimentar o "Quem passou por aqui" e "Sugestões para chamar".
--    Retorna perfis básicos (sem dados sensíveis) de quem visitou recentemente,
--    excluindo o próprio usuário. Disponível para quem tem acesso ao Social Beta.
create or replace function public.social_beta_recent_slot_users(
  _slot text default null,
  _limit int default 12,
  _hours int default 24
)
returns table (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  last_visit timestamptz,
  visits_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  norm text := lower(coalesce(_slot, ''));
  lim int := least(greatest(coalesce(_limit, 12), 1), 50);
  hrs int := least(greatest(coalesce(_hours, 24), 1), 168);
begin
  if uid is null or not public.social_beta_can_access(uid) then
    return;
  end if;

  return query
    with recent as (
      select v.user_id,
             max(v.visited_at) as last_visit,
             count(*) as visits_count
        from public.oculto_social_beta_visits v
       where v.visited_at > now() - make_interval(hours => hrs)
         and v.user_id <> uid
         and (norm = '' or v.slot = norm)
       group by v.user_id
    )
    select
      p.user_id,
      p.username,
      p.name,
      p.avatar_url,
      r.last_visit,
      r.visits_count
    from recent r
    join public.profiles p on p.user_id = r.user_id
    where p.user_id is not null
      -- respeita bloqueios em ambas direções, se a tabela existir
      and not exists (
        select 1 from public.blocked_contacts bc
         where (bc.user_id = uid and bc.blocked_user_id = p.user_id)
            or (bc.user_id = p.user_id and bc.blocked_user_id = uid)
      )
    order by r.last_visit desc
    limit lim;
end;
$$;

grant execute on function public.social_beta_recent_slot_users(text, int, int) to authenticated;

-- 2) Fix: search_users disponível para quem tem acesso (não apenas master) ---
--    Bug original travava o convite por @username dentro das sessões.
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
  uid uuid := auth.uid();
  q text := trim(coalesce(_query, ''));
  lim int := least(greatest(coalesce(_limit, 10), 1), 25);
  selected_ids uuid[];
begin
  if uid is null or not public.social_beta_can_access(uid) then
    return;
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
    and p.user_id <> uid
    and (
      p.username ilike '%' || q || '%'
      or p.name ilike '%' || q || '%'
    )
    and not exists (
      select 1 from public.blocked_contacts bc
       where (bc.user_id = uid and bc.blocked_user_id = p.user_id)
          or (bc.user_id = p.user_id and bc.blocked_user_id = uid)
    )
  order by
    case when lower(coalesce(p.username, '')) = lower(q) then 0 else 1 end,
    p.username asc
  limit lim;
end;
$$;

grant execute on function public.social_beta_search_users(text, int) to authenticated;

notify pgrst, 'reload schema';
