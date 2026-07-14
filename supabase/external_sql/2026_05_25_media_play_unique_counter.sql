-- ============================================================================
-- Contador de reproduções de mídia (vídeo) — uma vez por @username
-- Idempotente: pode rodar várias vezes.
-- ============================================================================

create table if not exists public.oculto_media_play_views (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null,
  viewer_id uuid not null,
  created_at timestamptz not null default now(),
  unique (media_id, viewer_id)
);

create index if not exists oculto_media_play_views_media_idx
  on public.oculto_media_play_views (media_id);

alter table public.oculto_media_play_views enable row level security;

-- SELECT: qualquer usuário autenticado pode contar (necessário para mostrar total)
drop policy if exists "media_play_views_select_all" on public.oculto_media_play_views;
create policy "media_play_views_select_all"
  on public.oculto_media_play_views
  for select
  to authenticated
  using (true);

-- INSERT: apenas o próprio usuário pode inserir o seu registro
drop policy if exists "media_play_views_insert_self" on public.oculto_media_play_views;
create policy "media_play_views_insert_self"
  on public.oculto_media_play_views
  for insert
  to authenticated
  with check (viewer_id = auth.uid());

-- RPC: registra reprodução (idempotente por usuário) e devolve o total único
create or replace function public.record_media_play(p_media_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total int;
begin
  if v_uid is null or p_media_id is null then
    select count(*) into v_total
      from public.oculto_media_play_views
      where media_id = p_media_id;
    return coalesce(v_total, 0);
  end if;

  insert into public.oculto_media_play_views (media_id, viewer_id)
  values (p_media_id, v_uid)
  on conflict (media_id, viewer_id) do nothing;

  select count(*) into v_total
    from public.oculto_media_play_views
    where media_id = p_media_id;

  return coalesce(v_total, 0);
end;
$$;

grant execute on function public.record_media_play(uuid) to authenticated;

-- View pública opcional para leitura agregada (sem expor viewer_id)
create or replace view public.v_media_play_counts as
  select media_id, count(*)::int as total_plays
    from public.oculto_media_play_views
    group by media_id;

grant select on public.v_media_play_counts to authenticated, anon;
