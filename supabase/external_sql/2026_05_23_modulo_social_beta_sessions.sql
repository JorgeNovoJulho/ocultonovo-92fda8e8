-- ============================================================================
-- 2026-05-23 — MÓDULO SOCIAL BETA — SESSÕES + CONVITES + MINI CHAT
-- Executar manualmente no SQL Editor do Supabase EXTERNO. Idempotente.
-- Depende de: 2026_05_23_modulo_social_beta_base.sql
-- ============================================================================

-- 1) TABELAS -----------------------------------------------------------------

create table if not exists public.oculto_social_beta_sessions (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot in ('lounge','connections','games','dynamics')),
  title text not null,
  description text,
  host_id uuid not null,
  max_participants int not null default 8 check (max_participants between 2 and 8),
  status text not null default 'open' check (status in ('open','closed','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_oculto_social_beta_sessions_slot_status
  on public.oculto_social_beta_sessions(slot, status, created_at desc);
create index if not exists idx_oculto_social_beta_sessions_host
  on public.oculto_social_beta_sessions(host_id);

create table if not exists public.oculto_social_beta_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.oculto_social_beta_sessions(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('host','member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (session_id, user_id)
);
create index if not exists idx_oculto_social_beta_participants_session
  on public.oculto_social_beta_session_participants(session_id);
create index if not exists idx_oculto_social_beta_participants_user
  on public.oculto_social_beta_session_participants(user_id);

create table if not exists public.oculto_social_beta_session_invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.oculto_social_beta_sessions(id) on delete cascade,
  invited_by uuid not null,
  invited_user uuid not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (session_id, invited_user)
);
create index if not exists idx_oculto_social_beta_invites_user_status
  on public.oculto_social_beta_session_invites(invited_user, status);

create table if not exists public.oculto_social_beta_session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.oculto_social_beta_sessions(id) on delete cascade,
  user_id uuid not null,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_oculto_social_beta_msgs_session
  on public.oculto_social_beta_session_messages(session_id, created_at);

create table if not exists public.oculto_social_beta_session_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.oculto_social_beta_sessions(id) on delete cascade,
  reporter_id uuid not null,
  target_user uuid,
  reason text not null,
  created_at timestamptz not null default now()
);

-- updated_at trigger
drop trigger if exists trg_oculto_social_beta_sessions_updated_at on public.oculto_social_beta_sessions;
create trigger trg_oculto_social_beta_sessions_updated_at
before update on public.oculto_social_beta_sessions
for each row execute function public.oculto_touch_updated_at();

-- 2) HELPERS -----------------------------------------------------------------

create or replace function public.social_beta_is_participant(_session_id uuid, _user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.oculto_social_beta_session_participants
    where session_id = _session_id and user_id = _user_id and left_at is null
  );
$$;
grant execute on function public.social_beta_is_participant(uuid, uuid) to authenticated;

create or replace function public.social_beta_is_host(_session_id uuid, _user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.oculto_social_beta_sessions
    where id = _session_id and host_id = _user_id
  );
$$;
grant execute on function public.social_beta_is_host(uuid, uuid) to authenticated;

-- 3) RLS ---------------------------------------------------------------------

alter table public.oculto_social_beta_sessions enable row level security;
alter table public.oculto_social_beta_session_participants enable row level security;
alter table public.oculto_social_beta_session_invites enable row level security;
alter table public.oculto_social_beta_session_messages enable row level security;
alter table public.oculto_social_beta_session_reports enable row level security;

-- sessions: leitura por usuários liberados; escrita somente via RPC (forçar uso de RPC)
drop policy if exists "sb_sessions_read" on public.oculto_social_beta_sessions;
create policy "sb_sessions_read" on public.oculto_social_beta_sessions
  for select to authenticated
  using (public.social_beta_can_access(auth.uid()));

drop policy if exists "sb_sessions_master_all" on public.oculto_social_beta_sessions;
create policy "sb_sessions_master_all" on public.oculto_social_beta_sessions
  for all to authenticated
  using (public.oculto_is_master_admin(auth.uid()))
  with check (public.oculto_is_master_admin(auth.uid()));

-- participants: ver se é participante, host ou master
drop policy if exists "sb_parts_read" on public.oculto_social_beta_session_participants;
create policy "sb_parts_read" on public.oculto_social_beta_session_participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.social_beta_is_participant(session_id, auth.uid())
    or public.social_beta_is_host(session_id, auth.uid())
    or public.oculto_is_master_admin(auth.uid())
  );

drop policy if exists "sb_parts_master_all" on public.oculto_social_beta_session_participants;
create policy "sb_parts_master_all" on public.oculto_social_beta_session_participants
  for all to authenticated
  using (public.oculto_is_master_admin(auth.uid()))
  with check (public.oculto_is_master_admin(auth.uid()));

-- invites: ver os próprios (enviados/recebidos) ou se for host/master
drop policy if exists "sb_invites_read" on public.oculto_social_beta_session_invites;
create policy "sb_invites_read" on public.oculto_social_beta_session_invites
  for select to authenticated
  using (
    invited_user = auth.uid()
    or invited_by = auth.uid()
    or public.social_beta_is_host(session_id, auth.uid())
    or public.oculto_is_master_admin(auth.uid())
  );

drop policy if exists "sb_invites_master_all" on public.oculto_social_beta_session_invites;
create policy "sb_invites_master_all" on public.oculto_social_beta_session_invites
  for all to authenticated
  using (public.oculto_is_master_admin(auth.uid()))
  with check (public.oculto_is_master_admin(auth.uid()));

-- messages: só participantes leem; insert só via RPC
drop policy if exists "sb_msgs_read" on public.oculto_social_beta_session_messages;
create policy "sb_msgs_read" on public.oculto_social_beta_session_messages
  for select to authenticated
  using (
    public.social_beta_is_participant(session_id, auth.uid())
    or public.oculto_is_master_admin(auth.uid())
  );

drop policy if exists "sb_msgs_master_all" on public.oculto_social_beta_session_messages;
create policy "sb_msgs_master_all" on public.oculto_social_beta_session_messages
  for all to authenticated
  using (public.oculto_is_master_admin(auth.uid()))
  with check (public.oculto_is_master_admin(auth.uid()));

-- reports: usuário cria os próprios; master vê tudo
drop policy if exists "sb_reports_insert" on public.oculto_social_beta_session_reports;
create policy "sb_reports_insert" on public.oculto_social_beta_session_reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and public.social_beta_can_access(auth.uid()));

drop policy if exists "sb_reports_read_master" on public.oculto_social_beta_session_reports;
create policy "sb_reports_read_master" on public.oculto_social_beta_session_reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.oculto_is_master_admin(auth.uid()));

-- 4) RPCs --------------------------------------------------------------------

create or replace function public.social_beta_create_session(
  _slot text,
  _title text,
  _description text default null,
  _max_participants int default 8
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  new_id uuid;
  uid uuid := auth.uid();
begin
  if uid is null or not public.social_beta_can_access(uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _slot not in ('lounge','connections','games','dynamics') then
    raise exception 'invalid_slot';
  end if;
  if coalesce(trim(_title),'') = '' then
    raise exception 'title_required';
  end if;

  insert into public.oculto_social_beta_sessions (slot, title, description, host_id, max_participants)
  values (_slot, trim(_title), nullif(trim(_description), ''), uid, greatest(2, least(8, coalesce(_max_participants, 8))))
  returning id into new_id;

  insert into public.oculto_social_beta_session_participants (session_id, user_id, role)
  values (new_id, uid, 'host');

  return new_id;
end;
$$;
grant execute on function public.social_beta_create_session(text, text, text, int) to authenticated;

create or replace function public.social_beta_list_sessions(_slot text)
returns table (
  id uuid, slot text, title text, description text,
  host_id uuid, status text, max_participants int,
  participant_count int, is_participant boolean, is_host boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, s.slot, s.title, s.description, s.host_id, s.status, s.max_participants,
    (select count(*)::int from public.oculto_social_beta_session_participants p
       where p.session_id = s.id and p.left_at is null) as participant_count,
    exists(select 1 from public.oculto_social_beta_session_participants p
       where p.session_id = s.id and p.user_id = auth.uid() and p.left_at is null) as is_participant,
    (s.host_id = auth.uid()) as is_host,
    s.created_at
  from public.oculto_social_beta_sessions s
  where s.slot = _slot
    and s.status in ('open','closed')
    and public.social_beta_can_access(auth.uid())
  order by s.created_at desc
  limit 50;
$$;
grant execute on function public.social_beta_list_sessions(text) to authenticated;

create or replace function public.social_beta_invite_user(_session_id uuid, _invited_user uuid)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (public.social_beta_is_host(_session_id, uid) or public.social_beta_is_participant(_session_id, uid)) then
    raise exception 'not_in_session' using errcode = '42501';
  end if;
  if not public.social_beta_can_access(_invited_user) then
    raise exception 'invited_user_not_allowed';
  end if;

  insert into public.oculto_social_beta_session_invites (session_id, invited_by, invited_user)
  values (_session_id, uid, _invited_user)
  on conflict (session_id, invited_user) do update
    set status = case when public.oculto_social_beta_session_invites.status = 'declined' then 'pending' else public.oculto_social_beta_session_invites.status end,
        invited_by = excluded.invited_by
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.social_beta_invite_user(uuid, uuid) to authenticated;

create or replace function public.social_beta_respond_invite(_invite_id uuid, _accept boolean)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inv record;
  current_count int;
  cap int;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into inv from public.oculto_social_beta_session_invites where id = _invite_id;
  if inv is null or inv.invited_user <> uid then raise exception 'invite_not_found'; end if;
  if inv.status <> 'pending' then return false; end if;

  if not _accept then
    update public.oculto_social_beta_session_invites
       set status='declined', responded_at=now() where id=_invite_id;
    return true;
  end if;

  select max_participants into cap from public.oculto_social_beta_sessions where id = inv.session_id;
  select count(*)::int into current_count from public.oculto_social_beta_session_participants
    where session_id = inv.session_id and left_at is null;
  if current_count >= cap then raise exception 'session_full'; end if;

  insert into public.oculto_social_beta_session_participants (session_id, user_id, role)
  values (inv.session_id, uid, 'member')
  on conflict (session_id, user_id) do update set left_at = null, joined_at = now();

  update public.oculto_social_beta_session_invites
     set status='accepted', responded_at=now() where id=_invite_id;
  return true;
end;
$$;
grant execute on function public.social_beta_respond_invite(uuid, boolean) to authenticated;

create or replace function public.social_beta_leave_session(_session_id uuid)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.oculto_social_beta_session_participants
     set left_at = now()
   where session_id = _session_id and user_id = uid and left_at is null;
  return true;
end;
$$;
grant execute on function public.social_beta_leave_session(uuid) to authenticated;

create or replace function public.social_beta_end_session(_session_id uuid)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (public.social_beta_is_host(_session_id, uid) or public.oculto_is_master_admin(uid)) then
    raise exception 'not_host' using errcode = '42501';
  end if;
  update public.oculto_social_beta_sessions
     set status='ended', ended_at=now()
   where id=_session_id;
  return true;
end;
$$;
grant execute on function public.social_beta_end_session(uuid) to authenticated;

create or replace function public.social_beta_post_message(_session_id uuid, _body text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  s_status text;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.social_beta_is_participant(_session_id, uid) then
    raise exception 'not_participant' using errcode = '42501';
  end if;
  select status into s_status from public.oculto_social_beta_sessions where id=_session_id;
  if s_status = 'ended' then raise exception 'session_ended'; end if;
  if coalesce(trim(_body),'') = '' then raise exception 'empty_body'; end if;

  insert into public.oculto_social_beta_session_messages (session_id, user_id, body)
  values (_session_id, uid, left(trim(_body), 1000))
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.social_beta_post_message(uuid, text) to authenticated;

create or replace function public.social_beta_report(_session_id uuid, _target_user uuid, _reason text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.oculto_social_beta_session_reports (session_id, reporter_id, target_user, reason)
  values (_session_id, uid, _target_user, left(coalesce(_reason,''), 500))
  returning id into new_id;
  return new_id;
end;
$$;
grant execute on function public.social_beta_report(uuid, uuid, text) to authenticated;

create or replace function public.social_beta_my_invites()
returns table (
  id uuid, session_id uuid, session_title text, slot text,
  invited_by uuid, status text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.id, i.session_id, s.title, s.slot, i.invited_by, i.status, i.created_at
  from public.oculto_social_beta_session_invites i
  join public.oculto_social_beta_sessions s on s.id = i.session_id
  where i.invited_user = auth.uid() and i.status = 'pending' and s.status <> 'ended'
  order by i.created_at desc;
$$;
grant execute on function public.social_beta_my_invites() to authenticated;

-- 5) REALTIME ---------------------------------------------------------------
do $$
begin
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='oculto_social_beta_session_messages';
  if not found then
    execute 'alter publication supabase_realtime add table public.oculto_social_beta_session_messages';
  end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='oculto_social_beta_session_participants';
  if not found then
    execute 'alter publication supabase_realtime add table public.oculto_social_beta_session_participants';
  end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='oculto_social_beta_sessions';
  if not found then
    execute 'alter publication supabase_realtime add table public.oculto_social_beta_sessions';
  end if;
end $$;

notify pgrst, 'reload schema';
