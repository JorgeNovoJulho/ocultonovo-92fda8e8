/**
 * RouteSkeleton — fallback de Suspense usado nas rotas lazy.
 *
 * Por quê:
 *  - O fallback antigo era apenas um spinner em tela inteira; em redes mais
 *    lentas o usuário via uma tela vazia até o chunk baixar, o que parecia
 *    travamento.
 *  - Aqui mostramos um esqueleto leve que imita a estrutura da rota destino
 *    (feed, perfil, admin, auth, default). É puro CSS (Tailwind + tokens
 *    semânticos) e custa praticamente zero — não há fetch nem layout pesado.
 *
 * Regras:
 *  - Usa apenas tokens semânticos (`bg-background`, `bg-muted`, `border-border`)
 *    para respeitar tema claro/escuro.
 *  - `animate-pulse` discreto para indicar carregamento sem agitar UI.
 *  - Detecta a variante automaticamente via `window.location.pathname`; o
 *    pathname já está disponível antes do React montar o componente lazy.
 */

import { useMemo } from 'react';

type Variant = 'feed' | 'profile' | 'admin' | 'auth' | 'default';

function detectVariant(): Variant {
  if (typeof window === 'undefined') return 'default';
  const p = window.location.pathname;
  if (p.startsWith('/admin')) return 'admin';
  if (p === '/feed' || p === '/') return 'feed';
  if (
    p.startsWith('/login') ||
    p.startsWith('/signup') ||
    p.startsWith('/forgot') ||
    p.startsWith('/reset')
  ) return 'auth';
  if (
    p.startsWith('/perfil') ||
    p.startsWith('/canal') ||
    p.startsWith('/u/') ||
    p.startsWith('/criador')
  ) return 'profile';
  return 'default';
}

const Bar = ({ className = '' }: { className?: string }) => (
  <div className={`bg-muted rounded ${className}`} />
);

function FeedSkeleton() {
  return (
    <div className="min-h-dvh bg-background animate-pulse">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6" aria-hidden="true">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <Bar className="h-3 w-1/3" />
            <Bar className="h-2 w-1/5" />
          </div>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted aspect-[4/5]" />
          <div className="p-4 space-y-2">
            <Bar className="h-3 w-3/4" />
            <Bar className="h-3 w-1/2" />
          </div>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted aspect-square" />
          <div className="p-4 space-y-2">
            <Bar className="h-3 w-2/3" />
            <Bar className="h-3 w-1/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-dvh bg-background animate-pulse">
      <div className="max-w-3xl mx-auto px-4 pt-8" aria-hidden="true">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-3 w-1/4" />
            <Bar className="h-3 w-1/2" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-muted aspect-square rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="min-h-dvh bg-background animate-pulse flex" aria-hidden="true">
      <div className="hidden md:block w-56 border-r border-border p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Bar key={i} className="h-3 w-full" />
        ))}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Bar className="h-5 w-1/4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-64 rounded-lg bg-muted" />
      </div>
    </div>
  );
}

function AuthSkeleton() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center animate-pulse" aria-hidden="true">
      <div className="w-full max-w-sm border border-border rounded-xl p-6 space-y-4">
        <Bar className="h-5 w-1/2 mx-auto" />
        <Bar className="h-10 w-full" />
        <Bar className="h-10 w-full" />
        <Bar className="h-10 w-2/3 mx-auto" />
      </div>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center" aria-hidden="true">
      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

export interface RouteSkeletonProps {
  variant?: Variant;
}

export function RouteSkeleton({ variant }: RouteSkeletonProps = {}) {
  const v = useMemo<Variant>(() => variant ?? detectVariant(), [variant]);
  switch (v) {
    case 'feed': return <FeedSkeleton />;
    case 'profile': return <ProfileSkeleton />;
    case 'admin': return <AdminSkeleton />;
    case 'auth': return <AuthSkeleton />;
    default: return <DefaultSkeleton />;
  }
}

export default RouteSkeleton;
