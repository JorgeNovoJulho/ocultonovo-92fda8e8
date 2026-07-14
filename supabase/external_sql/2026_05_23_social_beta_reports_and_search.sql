-- Módulo Social Beta — extensões: busca de usuários para convite + listagem de reports (master)
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.

-- =========================
-- 1) Busca de usuários (autocomplete de convite)
-- =========================
create or replace function public.social_beta_search_users(_q text)
returns table (user_id uuid, username text, name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.username, p.name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and coalesce(p.is_seed, false) = false
    and p.user_id <> auth.uid()
    and (
      p.username ilike (regexp_replace(_q, '^@', '') || '%')
      or p.name ilike ('%' || _q || '%')
    )
  order by
    case when p.username ilike (regexp_replace(_q, '^@', '') || '%') then 0 else 1 end,
    p.username asc nulls last
  limit 8;
$$;

grant execute on function public.social_beta_search_users(text) to authenticated;

-- =========================
-- 2) Listagem de reports (apenas master admin)
-- =========================
create or replace function public.social_beta_list_reports(_limit int default 100)
returns table (
  id uuid,
  session_id uuid,
  session_title text,
  slot text,
  reporter_id uuid,
  reporter_username text,
  target_user uuid,
  target_username text,
  reason text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.session_id,
    s.title as session_title,
    s.slot,
    r.reporter_id,
    rp.username as reporter_username,
    r.target_user,
    tp.username as target_username,
    r.reason,
    r.created_at
  from public.oculto_social_beta_session_reports r
  left join public.oculto_social_beta_sessions s on s.id = r.session_id
  left join public.profiles rp on rp.user_id = r.reporter_id
  left join public.profiles tp on tp.user_id = r.target_user
  where exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and lower(coalesce(p.username, '')) = 'ocultomaster'
  )
  order by r.created_at desc
  limit greatest(1, least(_limit, 500));
$$;

grant execute on function public.social_beta_list_reports(int) to authenticated;
