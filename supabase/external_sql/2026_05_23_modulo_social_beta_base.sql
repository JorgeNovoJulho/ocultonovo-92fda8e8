-- ============================================================================
-- 2026-05-23 — MÓDULO SOCIAL BETA (estrutura base isolada, idempotente)
-- Executar manualmente no SQL Editor do Supabase EXTERNO.
-- Compatível com a base antiga de oculto_hidden_experiences_config.
-- ============================================================================

-- 0) Segurança: helper master -----------------------------------------------
create or replace function public.oculto_is_master_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.has_role(_user_id, 'admin_master')
    or exists (
      select 1
      from public.profiles p
      where p.user_id = _user_id
        and (
          lower(coalesce(p.username, '')) = 'ocultomaster'
          or lower(coalesce(p.email, '')) = 'ocultomaster@ocultoswing.com.br'
          or lower(coalesce(p.name, '')) = 'ocultomaster'
        )
    )
  );
$$;

grant execute on function public.oculto_is_master_admin(uuid) to anon, authenticated;

-- 1) Config principal do módulo ---------------------------------------------
create table if not exists public.oculto_social_beta_config (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default false,
  beta_mode boolean not null default true,
  allowed_plans text[] not null default array[]::text[],
  selected_users uuid[] not null default array[]::uuid[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.oculto_social_beta_config (enabled, beta_mode)
select false, true
where not exists (select 1 from public.oculto_social_beta_config);

alter table public.oculto_social_beta_config enable row level security;

drop policy if exists "social_beta_cfg_master_all" on public.oculto_social_beta_config;
create policy "social_beta_cfg_master_all"
  on public.oculto_social_beta_config
  for all
  to authenticated
  using (public.oculto_is_master_admin(auth.uid()))
  with check (public.oculto_is_master_admin(auth.uid()));

-- 2) Nomes públicos editáveis ------------------------------------------------
create table if not exists public.oculto_social_beta_public_config (
  id uuid primary key default gen_random_uuid(),
  module_name text not null default 'Módulo Social Beta',
  lounge_label text not null default 'Lounge',
  connections_label text not null default 'Conexões',
  games_label text not null default 'Jogos',
  dynamics_label text not null default 'Dinâmicas',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.oculto_social_beta_public_config (
  module_name,
  lounge_label,
  connections_label,
  games_label,
  dynamics_label
)
select 'Módulo Social Beta', 'Lounge', 'Conexões', 'Jogos', 'Dinâmicas'
where not exists (select 1 from public.oculto_social_beta_public_config);

alter table public.oculto_social_beta_public_config enable row level security;

drop policy if exists "social_beta_public_read" on public.oculto_social_beta_public_config;
create policy "social_beta_public_read"
  on public.oculto_social_beta_public_config
  for select
  to authenticated
  using (true);

drop policy if exists "social_beta_public_master_write" on public.oculto_social_beta_public_config;
create policy "social_beta_public_master_write"
  on public.oculto_social_beta_public_config
  for all
  to authenticated
  using (public.oculto_is_master_admin(auth.uid()))
  with check (public.oculto_is_master_admin(auth.uid()));

-- 3) Trigger simples de updated_at ------------------------------------------
create or replace function public.oculto_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_oculto_social_beta_config_updated_at on public.oculto_social_beta_config;
create trigger trg_oculto_social_beta_config_updated_at
before update on public.oculto_social_beta_config
for each row
execute function public.oculto_touch_updated_at();

drop trigger if exists trg_oculto_social_beta_public_config_updated_at on public.oculto_social_beta_public_config;
create trigger trg_oculto_social_beta_public_config_updated_at
before update on public.oculto_social_beta_public_config
for each row
execute function public.oculto_touch_updated_at();

-- 4) RPC de acesso -----------------------------------------------------------
create or replace function public.social_beta_can_access(_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg public.oculto_social_beta_config;
  plan text;
begin
  if _user_id is null then
    return false;
  end if;

  if public.oculto_is_master_admin(_user_id) then
    return true;
  end if;

  select *
    into cfg
    from public.oculto_social_beta_config
   order by created_at
   limit 1;

  if cfg is null or cfg.enabled = false then
    return false;
  end if;

  if cfg.beta_mode = true then
    return _user_id = any(cfg.selected_users);
  end if;

  if _user_id = any(cfg.selected_users) then
    return true;
  end if;

  if array_length(cfg.allowed_plans, 1) is null then
    return false;
  end if;

  select p.plan_type
    into plan
    from public.profiles p
   where p.user_id = _user_id
   limit 1;

  return coalesce(plan, 'free') = any(cfg.allowed_plans);
end;
$$;

grant execute on function public.social_beta_can_access(uuid) to anon, authenticated;

-- 5) RPC master-only de leitura ---------------------------------------------
create or replace function public.social_beta_get_config()
returns table (
  enabled boolean,
  beta_mode boolean,
  allowed_plans text[],
  selected_users uuid[],
  notes text,
  module_name text,
  lounge_label text,
  connections_label text,
  games_label text,
  dynamics_label text,
  updated_at timestamptz
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
  select
    cfg.enabled,
    cfg.beta_mode,
    cfg.allowed_plans,
    cfg.selected_users,
    cfg.notes,
    pub.module_name,
    pub.lounge_label,
    pub.connections_label,
    pub.games_label,
    pub.dynamics_label,
    greatest(cfg.updated_at, pub.updated_at) as updated_at
  from public.oculto_social_beta_config cfg
  cross join public.oculto_social_beta_public_config pub
  order by cfg.created_at, pub.created_at
  limit 1;
end;
$$;

grant execute on function public.social_beta_get_config() to authenticated;

-- 6) RPC master-only de update ----------------------------------------------
create or replace function public.social_beta_update_config(
  _enabled boolean,
  _beta_mode boolean,
  _allowed_plans text[],
  _selected_users uuid[],
  _module_name text,
  _lounge_label text,
  _connections_label text,
  _games_label text,
  _dynamics_label text,
  _notes text default null
)
returns table (
  enabled boolean,
  beta_mode boolean,
  allowed_plans text[],
  selected_users uuid[],
  notes text,
  module_name text,
  lounge_label text,
  connections_label text,
  games_label text,
  dynamics_label text,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cfg_id uuid;
  pub_id uuid;
begin
  if not public.oculto_is_master_admin(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into cfg_id
  from public.oculto_social_beta_config
  order by created_at
  limit 1;

  select id into pub_id
  from public.oculto_social_beta_public_config
  order by created_at
  limit 1;

  update public.oculto_social_beta_config
     set enabled = coalesce(_enabled, enabled),
         beta_mode = coalesce(_beta_mode, beta_mode),
         allowed_plans = coalesce(_allowed_plans, allowed_plans),
         selected_users = coalesce(_selected_users, selected_users),
         notes = coalesce(_notes, notes),
         updated_at = now()
   where id = cfg_id;

  update public.oculto_social_beta_public_config
     set module_name = coalesce(nullif(trim(_module_name), ''), module_name),
         lounge_label = coalesce(nullif(trim(_lounge_label), ''), lounge_label),
         connections_label = coalesce(nullif(trim(_connections_label), ''), connections_label),
         games_label = coalesce(nullif(trim(_games_label), ''), games_label),
         dynamics_label = coalesce(nullif(trim(_dynamics_label), ''), dynamics_label),
         updated_at = now()
   where id = pub_id;

  return query
  select * from public.social_beta_get_config();
end;
$$;

grant execute on function public.social_beta_update_config(boolean, boolean, text[], uuid[], text, text, text, text, text, text) to authenticated;

-- 7) Compatibilidade/migração da estrutura antiga ----------------------------
do $$
declare
  legacy_cfg record;
  legacy_public record;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'oculto_hidden_experiences_config'
  ) then
    select * into legacy_cfg
    from public.oculto_hidden_experiences_config
    order by created_at
    limit 1;

    if legacy_cfg is not null then
      update public.oculto_social_beta_config
         set enabled = legacy_cfg.enabled,
             beta_mode = legacy_cfg.beta_mode,
             allowed_plans = legacy_cfg.allowed_plans,
             selected_users = legacy_cfg.selected_users,
             notes = legacy_cfg.notes,
             updated_at = now()
       where id = (select id from public.oculto_social_beta_config order by created_at limit 1);
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'oculto_social_beta_public_config'
      and column_name = 'module_name'
  ) then
    select * into legacy_public
      from public.oculto_social_beta_public_config
     order by created_at
     limit 1;

    if legacy_public is not null then
      update public.oculto_social_beta_public_config
         set module_name = coalesce(nullif(trim(legacy_public.module_name), ''), module_name),
             lounge_label = coalesce(nullif(trim(legacy_public.lounge_label), ''), lounge_label),
             connections_label = coalesce(nullif(trim(legacy_public.connections_label), ''), connections_label),
             games_label = coalesce(nullif(trim(legacy_public.games_label), ''), games_label),
             dynamics_label = coalesce(nullif(trim(legacy_public.dynamics_label), ''), dynamics_label),
             updated_at = now()
       where id = (select id from public.oculto_social_beta_public_config order by created_at limit 1);
    end if;
  end if;
end $$;

-- 8) Realtime ----------------------------------------------------------------
alter publication supabase_realtime add table public.oculto_social_beta_public_config;

notify pgrst, 'reload schema';
