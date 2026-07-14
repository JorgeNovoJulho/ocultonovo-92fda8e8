-- =============================================================================
-- AUTH LOGIN TIMEOUT DIAGNOSTIC + PUBLIC SAFE FIXES (IDEMPOTENTE)
-- Projeto externo: rvybbrkzmboqbhcemqar
--
-- Objetivo:
-- 1) Diagnosticar a camada de auth sem modificar schemas reservados
-- 2) Garantir que funções públicas ligadas ao bootstrap de perfis sejam fail-open
-- 3) Reforçar índices mínimos do fluxo pós-login
--
-- IMPORTANTE:
-- - Execute no SQL Editor do Supabase EXTERNO.
-- - Este script NÃO altera auth.users, auth.identities nem cria/remove triggers em auth.*.
-- - Se o /auth/v1/health continuar expirando, o problema é da infraestrutura/serviço de auth.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) DIAGNÓSTICO: apenas leitura sobre auth + triggers existentes
-- -----------------------------------------------------------------------------
select
  now() as checked_at,
  'auth_users_triggers' as section,
  t.tgname as trigger_name,
  c.relname as table_name,
  pg_get_triggerdef(t.oid, true) as trigger_sql
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'auth'
  and c.relname = 'users';

select
  now() as checked_at,
  'public_auth_functions' as section,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_sql
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('handle_new_user', 'auto_assign_admin_master');

select
  now() as checked_at,
  'auth_users_summary' as section,
  count(*) filter (where deleted_at is null) as active_auth_users,
  count(*) filter (where email_confirmed_at is not null) as confirmed_auth_users,
  count(*) filter (where banned_until is not null and banned_until > now()) as currently_banned
from auth.users;

select
  now() as checked_at,
  'auth_identities_summary' as section,
  count(*) filter (where provider = 'email') as email_identities,
  count(*) filter (where provider = 'email' and user_id is null) as email_identities_without_user
from auth.identities;

select
  lower(email) as email,
  count(*) as total_rows,
  array_agg(id order by created_at asc nulls last) as auth_user_ids
from auth.users
where email is not null
group by lower(email)
having count(*) > 1;

select
  lower(provider_id) as email_identity,
  count(*) as total_rows,
  array_agg(user_id order by created_at asc nulls last) as linked_users
from auth.identities
where provider = 'email'
  and provider_id is not null
group by lower(provider_id)
having count(*) > 1;

-- -----------------------------------------------------------------------------
-- 2) FUNÇÕES PÚBLICAS FAIL-OPEN (sem tocar em auth.*)
-- -----------------------------------------------------------------------------
create or replace function public.auto_assign_admin_master()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = 'ocultomaster@ocultoswing.com.br'
     and to_regclass('public.user_roles') is not null then
    insert into public.user_roles (user_id, role, granted_by)
    values (new.id, 'admin_master', new.id)
    on conflict do nothing;
  end if;

  return new;
exception
  when others then
    raise log 'auto_assign_admin_master failed for %: % %', new.id, sqlerrm, sqlstate;
    return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_base_username text;
  v_counter integer := 0;
  v_name text;
begin
  v_name := nullif(trim(coalesce(new.raw_user_meta_data->>'name', '')), '');

  v_base_username := lower(regexp_replace(
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'username'), ''),
      split_part(coalesce(new.email, new.id::text), '@', 1)
    ),
    '[^a-zA-Z0-9_]',
    '',
    'g'
  ));

  if v_base_username is null or length(v_base_username) < 3 then
    v_base_username := 'user_' || substr(new.id::text, 1, 8);
  end if;

  v_username := v_base_username;

  while exists (select 1 from public.profiles where username = v_username) loop
    v_counter := v_counter + 1;
    v_username := v_base_username || '_' || v_counter;
    if v_counter > 100 then
      v_username := v_base_username || '_' || substr(gen_random_uuid()::text, 1, 6);
      exit;
    end if;
  end loop;

  insert into public.profiles (id, user_id, name, username, avatar_url, created_at, updated_at)
  values (
    new.id,
    new.id,
    coalesce(v_name, split_part(coalesce(new.email, new.id::text), '@', 1)),
    v_username,
    new.raw_user_meta_data->>'avatar_url',
    now(),
    now()
  )
  on conflict (id) do update
    set user_id = excluded.user_id,
        username = coalesce(public.profiles.username, excluded.username),
        name = coalesce(nullif(public.profiles.name, ''), excluded.name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = now();

  return new;
exception
  when others then
    raise log 'handle_new_user failed for %: % %', new.id, sqlerrm, sqlstate;
    return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) PERFIL E ÍNDICES MÍNIMOS DO PÓS-LOGIN
-- -----------------------------------------------------------------------------
create index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_profiles_username_lower on public.profiles(lower(username));

-- -----------------------------------------------------------------------------
-- 4) RELATÓRIO FINAL PÚBLICO
-- -----------------------------------------------------------------------------
select
  count(*) as profiles_total,
  count(*) filter (where user_id is null) as profiles_without_user_id,
  count(*) filter (where id = user_id) as profiles_id_equals_user_id
from public.profiles;
