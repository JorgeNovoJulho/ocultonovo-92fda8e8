-- ============================================================
-- Módulo Social Beta — Fatia 3.4
-- Denúncias de MÓDULO e CARD + ações master (resolver, arquivar,
-- desativar módulo/card, listagem agregada).
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================

-- =========================
-- 1) Tabela de denúncias de conteúdo (módulo ou card)
-- =========================
create table if not exists public.oculto_social_beta_content_reports (
  id              uuid primary key default gen_random_uuid(),
  target_type     text not null check (target_type in ('module','card')),
  module_code     text references public.oculto_social_beta_modules(code) on update cascade,
  card_id         uuid references public.oculto_social_beta_cards(id) on delete set null,
  session_id      uuid references public.oculto_social_beta_sessions(id) on delete set null,
  reporter_id     uuid not null,
  reason          text not null,
  status          text not null default 'open'
                    check (status in ('open','resolved','archived')),
  resolved_at     timestamptz,
  resolved_by     uuid,
  resolution_note text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_social_beta_content_reports_status
  on public.oculto_social_beta_content_reports(status, created_at desc);
create index if not exists idx_social_beta_content_reports_module
  on public.oculto_social_beta_content_reports(module_code);
create index if not exists idx_social_beta_content_reports_card
  on public.oculto_social_beta_content_reports(card_id);

alter table public.oculto_social_beta_content_reports enable row level security;

drop policy if exists content_reports_insert_self on public.oculto_social_beta_content_reports;
create policy content_reports_insert_self on public.oculto_social_beta_content_reports
  for insert to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists content_reports_select_master on public.oculto_social_beta_content_reports;
create policy content_reports_select_master on public.oculto_social_beta_content_reports
  for select to authenticated
  using (public.social_beta_is_master());

drop policy if exists content_reports_update_master on public.oculto_social_beta_content_reports;
create policy content_reports_update_master on public.oculto_social_beta_content_reports
  for update to authenticated
  using (public.social_beta_is_master())
  with check (public.social_beta_is_master());

-- =========================
-- 2) Submeter denúncia (qualquer usuário autenticado)
-- =========================
create or replace function public.social_beta_report_content(
  _target_type text,
  _module_code text default null,
  _card_id     uuid default null,
  _session_id  uuid default null,
  _reason      text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if _target_type not in ('module','card') then
    raise exception 'invalid_target_type';
  end if;
  if _target_type = 'module' and _module_code is null then
    raise exception 'module_code_required';
  end if;
  if _target_type = 'card' and _card_id is null then
    raise exception 'card_id_required';
  end if;
  if coalesce(trim(_reason), '') = '' then
    raise exception 'reason_required';
  end if;

  -- Anti-flood: máx 5 denúncias / hora por usuário
  if (
    select count(*) from public.oculto_social_beta_content_reports
    where reporter_id = auth.uid()
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'rate_limited';
  end if;

  insert into public.oculto_social_beta_content_reports
    (target_type, module_code, card_id, session_id, reporter_id, reason)
  values
    (_target_type, _module_code, _card_id, _session_id, auth.uid(), left(_reason, 500))
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.social_beta_report_content(text, text, uuid, uuid, text) to authenticated;

-- =========================
-- 3) Listagem master (com agregados de denúncias por alvo)
-- =========================
create or replace function public.social_beta_list_content_reports(
  _status text default 'open',
  _limit  int default 100
)
returns table (
  id uuid,
  target_type text,
  module_code text,
  module_label text,
  card_id uuid,
  card_content text,
  card_level text,
  session_id uuid,
  reporter_id uuid,
  reporter_username text,
  reason text,
  status text,
  reports_count_for_target int,
  created_at timestamptz,
  resolved_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with base as (
    select r.*
    from public.oculto_social_beta_content_reports r
    where public.social_beta_is_master()
      and (_status = 'all' or r.status = _status)
  ),
  counts as (
    select
      r.id,
      count(*) over (
        partition by r.target_type,
                     coalesce(r.module_code, ''),
                     coalesce(r.card_id::text, '')
      ) as cnt
    from public.oculto_social_beta_content_reports r
    where r.status = 'open'
  )
  select
    b.id,
    b.target_type,
    b.module_code,
    coalesce(m.default_label, b.module_code) as module_label,
    b.card_id,
    c.content as card_content,
    c.level::text as card_level,
    b.session_id,
    b.reporter_id,
    rp.username as reporter_username,
    b.reason,
    b.status,
    coalesce(cnt.cnt, 1)::int as reports_count_for_target,
    b.created_at,
    b.resolved_at
  from base b
  left join public.oculto_social_beta_modules m on m.code = b.module_code
  left join public.oculto_social_beta_cards   c on c.id   = b.card_id
  left join public.profiles rp on rp.user_id = b.reporter_id
  left join counts cnt on cnt.id = b.id
  order by b.created_at desc
  limit greatest(1, least(_limit, 500));
$$;
grant execute on function public.social_beta_list_content_reports(text, int) to authenticated;

-- =========================
-- 4) Resolver / arquivar denúncia de conteúdo
-- =========================
create or replace function public.social_beta_resolve_content_report(
  _report_id uuid,
  _action    text,            -- 'resolved' | 'archived' | 'open'
  _note      text default null
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

  update public.oculto_social_beta_content_reports
     set status = _action,
         resolved_at = case when _action = 'open' then null else now() end,
         resolved_by = case when _action = 'open' then null else auth.uid() end,
         resolution_note = coalesce(_note, resolution_note)
   where id = _report_id;

  return found;
end;
$$;
grant execute on function public.social_beta_resolve_content_report(uuid, text, text) to authenticated;

-- =========================
-- 5) Ação master: desativar módulo OU card (e resolver pendências do alvo)
-- =========================
create or replace function public.social_beta_disable_target(
  _target_type text,
  _module_code text default null,
  _card_id     uuid default null,
  _note        text default null
)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.social_beta_is_master() then
    raise exception 'not_authorized';
  end if;
  if _target_type not in ('module','card') then
    raise exception 'invalid_target_type';
  end if;

  if _target_type = 'module' then
    if _module_code is null then raise exception 'module_code_required'; end if;
    update public.oculto_social_beta_modules
       set enabled = false, updated_at = now()
     where code = _module_code;

    update public.oculto_social_beta_content_reports
       set status = 'resolved',
           resolved_at = now(),
           resolved_by = auth.uid(),
           resolution_note = coalesce(_note, 'Módulo desativado pelo master')
     where module_code = _module_code
       and target_type = 'module'
       and status = 'open';
  else
    if _card_id is null then raise exception 'card_id_required'; end if;
    update public.oculto_social_beta_cards
       set enabled = false
     where id = _card_id;

    update public.oculto_social_beta_content_reports
       set status = 'resolved',
           resolved_at = now(),
           resolved_by = auth.uid(),
           resolution_note = coalesce(_note, 'Card desativado pelo master')
     where card_id = _card_id
       and target_type = 'card'
       and status = 'open';
  end if;

  return true;
end;
$$;
grant execute on function public.social_beta_disable_target(text, text, uuid, text) to authenticated;
