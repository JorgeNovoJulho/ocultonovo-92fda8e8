-- =====================================================================
-- Módulo Social Beta — Fatia 3.1
-- Tabelas de catálogo (módulos, cartas), eventos de rodada, consentimento
-- de uso, sistema de renomeação (i18n_overrides) + seed.
--
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- Convenção: tudo prefixado com oculto_social_beta_.
-- Acesso de leitura aberto a authenticated; escrita só master.
-- =====================================================================

-- =========================
-- 0) Helpers reutilizados
-- =========================
-- public.social_beta_is_master() já existe (vide migration anterior).
-- public.oculto_touch_updated_at() já existe.

-- =========================
-- 1) Catálogo de MÓDULOS
-- =========================
create table if not exists public.oculto_social_beta_modules (
  id uuid primary key default gen_random_uuid(),
  -- code é o identificador estável usado no código (não muda)
  code text not null unique,
  -- nome exibível padrão (pode ser sobrescrito via i18n_overrides)
  default_label text not null,
  description text,
  -- intensidade máxima permitida: leve | divertido | provocante | avancado
  max_level text not null default 'provocante'
    check (max_level in ('leve','divertido','provocante','avancado')),
  -- cooldown entre rodadas (segundos)
  cooldown_seconds int not null default 0,
  -- contexto permitido: duo | grupo | ambos
  allowed_context text not null default 'ambos'
    check (allowed_context in ('duo','grupo','ambos')),
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_oculto_social_beta_modules_enabled
  on public.oculto_social_beta_modules(enabled, sort_order);

drop trigger if exists trg_oculto_social_beta_modules_updated_at
  on public.oculto_social_beta_modules;
create trigger trg_oculto_social_beta_modules_updated_at
before update on public.oculto_social_beta_modules
for each row execute function public.oculto_touch_updated_at();

alter table public.oculto_social_beta_modules enable row level security;

drop policy if exists modules_read on public.oculto_social_beta_modules;
create policy modules_read on public.oculto_social_beta_modules
  for select to authenticated using (true);

drop policy if exists modules_write_master on public.oculto_social_beta_modules;
create policy modules_write_master on public.oculto_social_beta_modules
  for all to authenticated
  using (public.social_beta_is_master())
  with check (public.social_beta_is_master());

-- =========================
-- 2) CARTAS (prompts/perguntas dos módulos)
-- =========================
create table if not exists public.oculto_social_beta_cards (
  id uuid primary key default gen_random_uuid(),
  module_code text not null references public.oculto_social_beta_modules(code)
    on update cascade on delete cascade,
  -- categoria livre (ex: 'pergunta','desafio','escolha','energia')
  category text,
  level text not null default 'leve'
    check (level in ('leve','divertido','provocante','avancado')),
  -- conteúdo principal e payload opcional (ex: opções, etc)
  content text not null,
  payload jsonb,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_oculto_social_beta_cards_module_level
  on public.oculto_social_beta_cards(module_code, level, enabled);

drop trigger if exists trg_oculto_social_beta_cards_updated_at
  on public.oculto_social_beta_cards;
create trigger trg_oculto_social_beta_cards_updated_at
before update on public.oculto_social_beta_cards
for each row execute function public.oculto_touch_updated_at();

alter table public.oculto_social_beta_cards enable row level security;

drop policy if exists cards_read on public.oculto_social_beta_cards;
create policy cards_read on public.oculto_social_beta_cards
  for select to authenticated using (enabled or public.social_beta_is_master());

drop policy if exists cards_write_master on public.oculto_social_beta_cards;
create policy cards_write_master on public.oculto_social_beta_cards
  for all to authenticated
  using (public.social_beta_is_master())
  with check (public.social_beta_is_master());

-- =========================
-- 3) EVENTOS de rodada (telemetria/auditoria por sessão)
-- =========================
create table if not exists public.oculto_social_beta_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.oculto_social_beta_sessions(id) on delete cascade,
  module_code text references public.oculto_social_beta_modules(code) on update cascade,
  card_id uuid references public.oculto_social_beta_cards(id) on delete set null,
  actor_id uuid,                     -- quem disparou
  target_id uuid,                    -- alvo (se houver)
  -- ex: 'round_start','card_drawn','answer','reaction','round_end','module_end'
  kind text not null,
  level text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_oculto_social_beta_events_session_kind
  on public.oculto_social_beta_events(session_id, kind, created_at desc);
create index if not exists idx_oculto_social_beta_events_actor
  on public.oculto_social_beta_events(actor_id, created_at desc);

alter table public.oculto_social_beta_events enable row level security;

-- leitura: participantes da sessão + master
drop policy if exists events_read on public.oculto_social_beta_events;
create policy events_read on public.oculto_social_beta_events
  for select to authenticated
  using (
    public.social_beta_is_master()
    or (session_id is not null
        and public.social_beta_is_participant(session_id, auth.uid()))
  );

-- inserts: participantes da sessão (ou master)
drop policy if exists events_insert on public.oculto_social_beta_events;
create policy events_insert on public.oculto_social_beta_events
  for insert to authenticated
  with check (
    public.social_beta_is_master()
    or (session_id is not null
        and public.social_beta_is_participant(session_id, auth.uid())
        and (actor_id is null or actor_id = auth.uid()))
  );

-- delete/update: somente master
drop policy if exists events_master_modify on public.oculto_social_beta_events;
create policy events_master_modify on public.oculto_social_beta_events
  for update to authenticated
  using (public.social_beta_is_master())
  with check (public.social_beta_is_master());

drop policy if exists events_master_delete on public.oculto_social_beta_events;
create policy events_master_delete on public.oculto_social_beta_events
  for delete to authenticated
  using (public.social_beta_is_master());

-- =========================
-- 4) CONSENTIMENTO de uso
-- =========================
create table if not exists public.oculto_social_beta_consents (
  user_id uuid primary key,
  accepted_at timestamptz not null default now(),
  accepted_version text not null default 'v1',
  -- preferências por nível (qual o teto que o usuário aceita ver)
  max_accepted_level text not null default 'provocante'
    check (max_accepted_level in ('leve','divertido','provocante','avancado')),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_oculto_social_beta_consents_updated_at
  on public.oculto_social_beta_consents;
create trigger trg_oculto_social_beta_consents_updated_at
before update on public.oculto_social_beta_consents
for each row execute function public.oculto_touch_updated_at();

alter table public.oculto_social_beta_consents enable row level security;

drop policy if exists consents_self_read on public.oculto_social_beta_consents;
create policy consents_self_read on public.oculto_social_beta_consents
  for select to authenticated
  using (user_id = auth.uid() or public.social_beta_is_master());

drop policy if exists consents_self_upsert on public.oculto_social_beta_consents;
create policy consents_self_upsert on public.oculto_social_beta_consents
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists consents_self_update on public.oculto_social_beta_consents;
create policy consents_self_update on public.oculto_social_beta_consents
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================
-- 5) RENOMEAÇÃO DINÂMICA (i18n overrides)
-- =========================
-- scope: 'module','menu','session','title','button','generic'
-- key:   ex: 'module.duo' ou 'button.start_round'
create table if not exists public.oculto_social_beta_i18n_overrides (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('module','menu','session','title','button','generic')),
  key text not null,
  locale text not null default 'pt-BR',
  value text not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (scope, key, locale)
);

create index if not exists idx_oculto_social_beta_i18n_scope
  on public.oculto_social_beta_i18n_overrides(scope, locale);

drop trigger if exists trg_oculto_social_beta_i18n_updated_at
  on public.oculto_social_beta_i18n_overrides;
create trigger trg_oculto_social_beta_i18n_updated_at
before update on public.oculto_social_beta_i18n_overrides
for each row execute function public.oculto_touch_updated_at();

alter table public.oculto_social_beta_i18n_overrides enable row level security;

drop policy if exists i18n_read on public.oculto_social_beta_i18n_overrides;
create policy i18n_read on public.oculto_social_beta_i18n_overrides
  for select to authenticated using (true);

drop policy if exists i18n_write_master on public.oculto_social_beta_i18n_overrides;
create policy i18n_write_master on public.oculto_social_beta_i18n_overrides
  for all to authenticated
  using (public.social_beta_is_master())
  with check (public.social_beta_is_master());

-- =========================
-- 6) RPCs de leitura/escrita
-- =========================

-- Lista módulos efetivamente disponíveis (aplica i18n_overrides)
create or replace function public.social_beta_list_modules(_locale text default 'pt-BR')
returns table (
  code text,
  label text,
  description text,
  max_level text,
  cooldown_seconds int,
  allowed_context text,
  enabled boolean,
  sort_order int
)
language sql stable security definer set search_path = public
as $$
  select
    m.code,
    coalesce(o.value, m.default_label) as label,
    m.description,
    m.max_level,
    m.cooldown_seconds,
    m.allowed_context,
    m.enabled,
    m.sort_order
  from public.oculto_social_beta_modules m
  left join public.oculto_social_beta_i18n_overrides o
    on o.scope = 'module' and o.locale = _locale and o.key = m.code
  where m.enabled or public.social_beta_is_master()
  order by m.sort_order asc, m.default_label asc;
$$;
grant execute on function public.social_beta_list_modules(text) to authenticated;

-- Sortear próxima carta de um módulo dentro de uma sessão
create or replace function public.social_beta_draw_card(
  _session_id uuid,
  _module_code text,
  _max_level text default null  -- override pelo nível efetivo da sessão; default = teto do módulo
)
returns table (
  id uuid, module_code text, category text, level text,
  content text, payload jsonb
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_module_max text;
  v_consent_max text;
  v_effective_max text;
begin
  if _session_id is null or not public.social_beta_is_participant(_session_id, auth.uid()) then
    raise exception 'not_participant';
  end if;

  select max_level into v_module_max
    from public.oculto_social_beta_modules
    where code = _module_code and enabled;
  if v_module_max is null then
    raise exception 'module_not_found_or_disabled';
  end if;

  select coalesce(max_accepted_level,'provocante') into v_consent_max
    from public.oculto_social_beta_consents where user_id = auth.uid();
  v_consent_max := coalesce(v_consent_max,'provocante');

  -- ordem: leve(1) < divertido(2) < provocante(3) < avancado(4)
  v_effective_max := (
    select level from (values
      ('leve',1),('divertido',2),('provocante',3),('avancado',4)
    ) v(level, ord)
    where ord = least(
      (select ord from (values ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) where x.level = coalesce(_max_level, v_module_max)),
      (select ord from (values ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) where x.level = v_module_max),
      (select ord from (values ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) where x.level = v_consent_max)
    )
  );

  return query
    select c.id, c.module_code, c.category, c.level, c.content, c.payload
    from public.oculto_social_beta_cards c
    where c.module_code = _module_code
      and c.enabled
      and (select ord from (values ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) where x.level = c.level)
        <= (select ord from (values ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) where x.level = v_effective_max)
    order by random()
    limit 1;
end;
$$;
grant execute on function public.social_beta_draw_card(uuid, text, text) to authenticated;

-- Registrar evento (participant-only; reforça actor=auth.uid)
create or replace function public.social_beta_log_event(
  _session_id uuid,
  _module_code text,
  _kind text,
  _card_id uuid default null,
  _target_id uuid default null,
  _level text default null,
  _payload jsonb default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if _session_id is null or not public.social_beta_is_participant(_session_id, auth.uid()) then
    raise exception 'not_participant';
  end if;
  insert into public.oculto_social_beta_events
    (session_id, module_code, card_id, actor_id, target_id, kind, level, payload)
  values
    (_session_id, _module_code, _card_id, auth.uid(), _target_id, _kind, _level, _payload)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.social_beta_log_event(uuid, text, text, uuid, uuid, text, jsonb) to authenticated;

-- Aceite de consentimento
create or replace function public.social_beta_accept_consent(
  _max_accepted_level text default 'provocante',
  _version text default 'v1'
)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if _max_accepted_level not in ('leve','divertido','provocante','avancado') then
    raise exception 'invalid_level';
  end if;
  insert into public.oculto_social_beta_consents (user_id, accepted_version, max_accepted_level)
  values (auth.uid(), _version, _max_accepted_level)
  on conflict (user_id) do update
    set accepted_version = excluded.accepted_version,
        max_accepted_level = excluded.max_accepted_level,
        accepted_at = now(),
        updated_at = now();
  return true;
end;
$$;
grant execute on function public.social_beta_accept_consent(text, text) to authenticated;

-- Helper para o frontend ler o consentimento do próprio usuário
create or replace function public.social_beta_my_consent()
returns table (accepted boolean, accepted_at timestamptz, version text, max_accepted_level text)
language sql stable security definer set search_path = public
as $$
  select true, c.accepted_at, c.accepted_version, c.max_accepted_level
  from public.oculto_social_beta_consents c
  where c.user_id = auth.uid()
  union all
  select false, null::timestamptz, null::text, null::text
  where not exists (select 1 from public.oculto_social_beta_consents where user_id = auth.uid())
  limit 1;
$$;
grant execute on function public.social_beta_my_consent() to authenticated;

-- =========================
-- 7) SEED dos 9 módulos (idempotente via code)
-- =========================
insert into public.oculto_social_beta_modules
  (code, default_label, description, max_level, cooldown_seconds, allowed_context, enabled, sort_order)
values
  ('conexao',        'Dados da Conexão',     'Quebra-gelo com perguntas rápidas para se apresentar.', 'divertido', 0,  'ambos', true,  10),
  ('verdade_escolha','Verdade ou Escolha',   'Sorteia perguntas e desafios curtos por nível.',         'provocante',5,  'ambos', true,  20),
  ('roda',           'Roda da Interação',    'Roda gira e sorteia uma interação entre dois.',          'provocante',8,  'grupo', true,  30),
  ('compatibilidade','Compatibilidade',      'Mini-quiz que estima afinidade entre participantes.',    'divertido', 10, 'ambos', true,  40),
  ('misterio',       'Mistério do Grupo',    'Pergunta anônima respondida por todos; revela padrão.',  'divertido', 5,  'grupo', true,  50),
  ('quem_combina',   'Quem Combina Mais',    'Cada um vota em quem mais combina com a frase sorteada.','provocante',6,  'grupo', true,  60),
  ('duas_verdades',  'Duas Verdades',        'Dois fatos verdadeiros e um falso; o grupo adivinha.',   'divertido', 4,  'ambos', true,  70),
  ('energia',        'Energia Anônima',      'Envia uma “energia” anônima a outro participante.',      'provocante',6,  'grupo', true,  80),
  ('duo',            'Modo Duo',             'Rodadas privadas para dois — somente quando duo.',       'provocante',5,  'duo',   true,  90)
on conflict (code) do update set
  default_label   = excluded.default_label,
  description     = excluded.description,
  max_level       = excluded.max_level,
  cooldown_seconds= excluded.cooldown_seconds,
  allowed_context = excluded.allowed_context,
  sort_order      = excluded.sort_order;

-- “avançado” fica desativado por padrão: garantimos max_level <= provocante
update public.oculto_social_beta_modules
   set max_level = 'provocante'
 where max_level = 'avancado';

-- =========================
-- 8) SEED de cartas iniciais (leve/divertido) — apenas se a tabela estiver vazia
-- =========================
insert into public.oculto_social_beta_cards (module_code, category, level, content)
select * from (values
  ('conexao','pergunta','leve','Qual foi a melhor surpresa da sua semana?'),
  ('conexao','pergunta','leve','Diga uma coisa simples que te deixa feliz.'),
  ('conexao','pergunta','divertido','Qual hábito seu surpreende quem te conhece pouco?'),
  ('verdade_escolha','pergunta','leve','Conte algo que poucos sabem sobre você.'),
  ('verdade_escolha','desafio','divertido','Faça uma careta que descreva seu dia.'),
  ('roda','interacao','leve','Diga um elogio sincero a quem a roda apontou.'),
  ('roda','interacao','divertido','Conte rapidamente como vocês dois se conheceram (real ou inventado).'),
  ('compatibilidade','quiz','leve','Praia ou montanha?'),
  ('compatibilidade','quiz','leve','Festa grande ou jantar pequeno?'),
  ('misterio','anonimo','divertido','Qual a coisa mais corajosa que você já fez?'),
  ('quem_combina','frase','divertido','“Sempre chega atrasado mas com a melhor história.”'),
  ('duas_verdades','rodada','leve','Diga três coisas sobre você: duas verdadeiras e uma falsa.'),
  ('energia','energia','leve','Envie boas vibrações a alguém do grupo.'),
  ('duo','pergunta','divertido','Que pequena tradição vocês poderiam inventar agora?')
) v(module_code, category, level, content)
where not exists (select 1 from public.oculto_social_beta_cards);

-- =========================
-- 9) Realtime opcional para eventos (se ainda não estiver na publicação)
-- =========================
do $$
begin
  perform 1 from pg_publication_tables
   where pubname='supabase_realtime'
     and schemaname='public'
     and tablename='oculto_social_beta_events';
  if not found then
    execute 'alter publication supabase_realtime add table public.oculto_social_beta_events';
  end if;
end$$;
