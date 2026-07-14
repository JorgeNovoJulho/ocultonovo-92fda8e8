/**
 * RetentionRouteTracker — marca missões como CONCLUÍDAS quando o usuário
 * visita a rota de qualquer missão pendente do dia.
 *
 * Estratégia genérica (não hardcoded): casa pathname (+ hash) com o
 * cta_route de toda missão ainda não concluída retornada pelo backend.
 * Funciona automaticamente para os 7 dias e para missões futuras.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useRetentionMissions } from '@/hooks/retention/useRetention';

function normalize(p: string) {
  return (p || '/').replace(/\/+$/, '') || '/';
}

function matches(currentPath: string, currentHash: string, route: string) {
  if (!route) return false;
  const [rPath, rHash] = route.split('#');
  const cur = normalize(currentPath);
  const target = normalize(rPath || '/');
  const pathOk = cur === target || cur.startsWith(target + '/');
  if (!pathOk) return false;
  if (rHash) {
    return (currentHash || '').replace(/^#/, '') === rHash.replace(/^#/, '');
  }
  return true;
}

export function RetentionRouteTracker() {
  const { user } = useAuth();
  const { pathname, hash } = useLocation();
  const { data: missions = [] } = useRetentionMissions();
  const qc = useQueryClient();
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || missions.length === 0) return;

    const pending = missions.filter((m) => !m.completed && m.cta_route);
    const toFire = pending.filter(
      (m) => matches(pathname, hash, m.cta_route!) && !fired.current.has(m.key),
    );
    if (toFire.length === 0) return;

    // Debounce curto (600ms) — evita disparar em transições muito rápidas
    // mas garante o complete antes do usuário voltar para o feed.
    const id = setTimeout(async () => {
      const promises = toFire.map(async (m) => {
        if (fired.current.has(m.key)) return;
        fired.current.add(m.key);
        try {
          await (supabase as any).rpc('retention_mission_complete', { p_key: m.key });
        } catch { /* noop */ }
      });
      await Promise.allSettled(promises);
      // Revalida imediatamente — realtime de oculto_retention_progress
      // também dispara, mas garantimos a atualização sem depender disso.
      qc.invalidateQueries({ queryKey: ['retention-missions'] });
      qc.invalidateQueries({ queryKey: ['retention-state'] });
    }, 600);

    return () => clearTimeout(id);
  }, [pathname, hash, user?.id, missions, qc]);

  return null;
}
