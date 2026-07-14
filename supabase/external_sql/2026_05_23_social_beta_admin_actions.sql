-- Módulo Social Beta — ações extras de admin (master):
--   • resolver / arquivar denúncia
--   • banir host de uma sessão (preenche profiles.banned_at) e encerra sessão
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.

-- =========================
-- 1) status nas denúncias
-- =========================
alter table public.oculto_social_beta_session_reports
  add column if not exists status text not null default 'open',
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid,
  add column if not exists resolution_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'oculto_social_beta_session_reports_status_chk'
  ) then
    alter table public.oculto_social_beta_session_reports
      add constraint oculto_social_beta_session_reports_status_chk
      check (status in ('open','resolved','archived'));
  end if;
end$$;

create index if not exists idx_oculto_social_beta_reports_status
  on public.oculto_social_beta_session_reports(status, created_at desc);

-- =========================
-- 2) Helper: é master admin?
-- =========================
create or replace function public.social_beta_is_master()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.username,'')) = 'ocultomaster'
  );
$$;
grant execute on function public.social_beta_is_master() to authenticated;

-- =========================
-- 3) Listagem (substitui versão anterior, passando status)
-- =========================
create or replace function public.social_beta_list_reports(_limit int default 100, _status text default 'open')
returns table (
  id uuid,
  session_id uuid,
  session_title text,
  slot text,
  host_id uuid,
  host_username text,
  reporter_id uuid,
  reporter_username text,
  target_user uuid,
  target_username text,
  reason text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    r.id, r.session_id,
    s.title, s.slot,
    s.host_id, hp.username,
    r.reporter_id, rp.username,
    r.target_user, tp.username,
    r.reason, r.status, r.created_at, r.resolved_at
  from public.oculto_social_beta_session_reports r
  left join public.oculto_social_beta_sessions s on s.id = r.session_id
  left join public.profiles hp on hp.user_id = s.host_id
  left join public.profiles rp on rp.user_id = r.reporter_id
  left join public.profiles tp on tp.user_id = r.target_user
  where public.social_beta_is_master()
    and (_status = 'all' or r.status = _status)
  order by r.created_at desc
  limit greatest(1, least(_limit, 500));
$$;
grant execute on function public.social_beta_list_reports(int, text) to authenticated;

-- =========================
-- 4) Resolver / arquivar denúncia
-- =========================
create or replace function public.social_beta_resolve_report(
  _report_id uuid,
  _action text,            -- 'resolved' | 'archived' | 'open'
  _note text default null
)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.social_beta_is_master() then
    raise exception 'not_authorized';
  end if;
  if _action not in ('resolved','archived','open') then
    raise exception 'invalid_action';
  end if;

  update public.oculto_social_beta_session_reports
     set status = _action,
         resolved_at = case when _action = 'open' then null else now() end,
         resolved_by = case when _action = 'open' then null else auth.uid() end,
         resolution_note = coalesce(_note, resolution_note)
   where id = _report_id;

  return found;
end;
$$;
grant execute on function public.social_beta_resolve_report(uuid, text, text) to authenticated;

-- =========================
-- 5) Banir host de uma sessão (encerra sessão + marca profile)
-- =========================
create or replace function public.social_beta_ban_host(
  _session_id uuid,
  _reason text default null
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_host uuid;
begin
  if not public.social_beta_is_master() then
    raise exception 'not_authorized';
  end if;

  select host_id into v_host
    from public.oculto_social_beta_sessions
   where id = _session_id;
  if v_host is null then
    raise exception 'session_not_found';
  end if;

  -- Proteção: nunca banir o próprio master
  if exists (
    select 1 from public.profiles
    where user_id = v_host
      and lower(coalesce(username,'')) = 'ocultomaster'
  ) then
    raise exception 'cannot_ban_master';
  end if;

  update public.profiles
     set banned_at = now()
   where user_id = v_host
     and banned_at is null;

  update public.oculto_social_beta_sessions
     set status = 'ended', ended_at = coalesce(ended_at, now())
   where id = _session_id;

  -- Marca todas as denúncias daquela sessão como resolvidas
  update public.oculto_social_beta_session_reports
     set status = 'resolved',
         resolved_at = now(),
         resolved_by = auth.uid(),
         resolution_note = coalesce(_reason, 'Host banido pelo master')
   where session_id = _session_id
     and status = 'open';

  return true;
end;
$$;
grant execute on function public.social_beta_ban_host(uuid, text) to authenticated;
