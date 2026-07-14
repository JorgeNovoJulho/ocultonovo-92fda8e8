-- ============================================================
-- 2026_05_23 — Social Beta · Admin RPCs (módulos, cards, i18n, métricas)
-- Idempotente. Rode no SQL Editor do Supabase externo.
-- Dependências: 2026_05_23_social_beta_modules_cards_events.sql
--
-- Schema real (revisado):
--   modules: code, default_label, description, max_level, cooldown_seconds,
--            allowed_context, enabled, sort_order
--   cards  : module_code, category, level, content, payload, enabled
--   events : session_id, module_code, card_id, actor_id, target_id, kind, level
--   i18n   : scope ('module'|'menu'|'session'|'title'|'button'|'generic'),
--            key, locale, value  (override de módulo = scope 'module', key=code)
-- ============================================================

-- 1) Listagem completa de módulos (com override pt-BR + contagens)
create or replace function public.social_beta_admin_list_modules()
returns table (
  id                uuid,
  code              text,
  base_label        text,
  override_label    text,
  description       text,
  enabled           boolean,
  max_level         text,
  cooldown_seconds  int,
  allowed_context   text,
  sort_order        int,
  cards_total       int,
  cards_by_level    jsonb,
  updated_at        timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    m.id,
    m.code,
    m.default_label,
    (select value from public.oculto_social_beta_i18n_overrides o
       where o.scope = 'module' and o.key = m.code and o.locale = 'pt-BR' limit 1),
    m.description,
    m.enabled,
    m.max_level,
    m.cooldown_seconds,
    m.allowed_context,
    m.sort_order,
    (select count(*)::int from public.oculto_social_beta_cards c where c.module_code = m.code),
    (select coalesce(jsonb_object_agg(level, qty), '{}'::jsonb)
       from (select level, count(*)::int as qty
               from public.oculto_social_beta_cards
              where module_code = m.code
              group by level) s),
    m.updated_at
  from public.oculto_social_beta_modules m
  where public.social_beta_is_master()
  order by m.sort_order, m.default_label;
$$;
grant execute on function public.social_beta_admin_list_modules() to authenticated;

-- 2) Upsert de módulo
create or replace function public.social_beta_admin_upsert_module(
  _code             text,
  _default_label    text,
  _description      text,
  _enabled          boolean,
  _max_level        text,
  _cooldown_seconds int,
  _allowed_context  text,
  _sort_order       int
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.social_beta_is_master() then
    raise exception 'forbidden';
  end if;

  insert into public.oculto_social_beta_modules
    (code, default_label, description, enabled, max_level, cooldown_seconds, allowed_context, sort_order)
  values
    (_code, _default_label, _description,
     coalesce(_enabled, true),
     coalesce(_max_level, 'provocante'),
     coalesce(_cooldown_seconds, 0),
     coalesce(_allowed_context, 'ambos'),
     coalesce(_sort_order, 0))
  on conflict (code) do update
    set default_label   = excluded.default_label,
        description     = excluded.description,
        enabled         = excluded.enabled,
        max_level       = excluded.max_level,
        cooldown_seconds= excluded.cooldown_seconds,
        allowed_context = excluded.allowed_context,
        sort_order      = excluded.sort_order,
        updated_at      = now()
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function public.social_beta_admin_upsert_module(text,text,text,boolean,text,int,text,int) to authenticated;

-- 3) Override i18n (renomear módulo/menu/etc) — vazio remove o override
create or replace function public.social_beta_admin_set_i18n(
  _scope  text,
  _key    text,
  _locale text,
  _value  text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.social_beta_is_master() then raise exception 'forbidden'; end if;

  if _value is null or length(btrim(_value)) = 0 then
    delete from public.oculto_social_beta_i18n_overrides
     where scope = _scope and key = _key and locale = _locale;
  else
    insert into public.oculto_social_beta_i18n_overrides (scope, key, locale, value)
    values (_scope, _key, _locale, _value)
    on conflict (scope, key, locale) do update
      set value = excluded.value, updated_at = now();
  end if;
end;
$$;
grant execute on function public.social_beta_admin_set_i18n(text,text,text,text) to authenticated;

-- 4) Cards — listar / upsert / delete
create or replace function public.social_beta_admin_list_cards(_module_code text)
returns table (
  id          uuid,
  module_code text,
  category    text,
  level       text,
  content     text,
  enabled     boolean,
  created_at  timestamptz
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.module_code, c.category, c.level, c.content, c.enabled, c.created_at
    from public.oculto_social_beta_cards c
   where c.module_code = _module_code and public.social_beta_is_master()
   order by c.level, c.created_at desc;
$$;
grant execute on function public.social_beta_admin_list_cards(text) to authenticated;

create or replace function public.social_beta_admin_upsert_card(
  _id          uuid,
  _module_code text,
  _category    text,
  _level       text,
  _content     text,
  _enabled     boolean
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.social_beta_is_master() then raise exception 'forbidden'; end if;

  if _level not in ('leve','divertido','provocante','avancado') then
    raise exception 'invalid_level';
  end if;

  if not exists (select 1 from public.oculto_social_beta_modules where code = _module_code) then
    raise exception 'module_not_found';
  end if;

  if _id is null then
    insert into public.oculto_social_beta_cards (module_code, category, level, content, enabled, created_by)
    values (_module_code, _category, _level, _content, coalesce(_enabled, true), auth.uid())
    returning id into v_id;
  else
    update public.oculto_social_beta_cards
       set category = _category,
           level    = _level,
           content  = _content,
           enabled  = coalesce(_enabled, true)
     where id = _id
     returning id into v_id;
  end if;

  return v_id;
end;
$$;
grant execute on function public.social_beta_admin_upsert_card(uuid,text,text,text,text,boolean) to authenticated;

create or replace function public.social_beta_admin_delete_card(_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.social_beta_is_master() then raise exception 'forbidden'; end if;
  delete from public.oculto_social_beta_cards where id = _id;
end;
$$;
grant execute on function public.social_beta_admin_delete_card(uuid) to authenticated;

-- 5) Métricas de eventos por módulo (período em dias)
create or replace function public.social_beta_admin_module_metrics(_days int default 30)
returns table (
  module_code         text,
  module_label        text,
  events_total        int,
  events_period       int,
  draws_period        int,
  answers_period      int,
  unique_users_period int,
  last_event_at       timestamptz
)
language sql stable security definer set search_path = public
as $$
  with base as (
    select e.*, m.default_label as m_label, m.code as m_code
      from public.oculto_social_beta_events e
      join public.oculto_social_beta_modules m on m.code = e.module_code
     where public.social_beta_is_master()
  )
  select
    m_code,
    m_label,
    count(*)::int,
    count(*) filter (where created_at >= now() - make_interval(days => _days))::int,
    count(*) filter (where kind = 'card_drawn' and created_at >= now() - make_interval(days => _days))::int,
    count(*) filter (where kind in ('answer','answered') and created_at >= now() - make_interval(days => _days))::int,
    count(distinct actor_id) filter (where created_at >= now() - make_interval(days => _days))::int,
    max(created_at)
  from base
  group by m_code, m_label
  order by 4 desc, m_label;
$$;
grant execute on function public.social_beta_admin_module_metrics(int) to authenticated;
