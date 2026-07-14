# Auditoria Final — Blocos A–D
**Data:** 2026-05-11 · **Escopo:** Aura Match (quests, achievements, chest, visitors, sala, gestos, Super DM) + persistência server-side do menu de destaque + hardening do chat da sala.

---

## Bloco A — Infra & Quests
| Item | Status | Evidência |
|---|---|---|
| Script anti-stale chunks | ✅ | `scripts/check-stale-chunks.mjs` + npm script |
| Rename de `@/integrations/supabase/client` | ✅ | `rg` em `src/`: única ocorrência é o próprio arquivo auto-gerado |
| Tooltips de "como completar" nas quests | ✅ | `useAuraDailyQuests.ts` + Popover em `AuraDailyQuests.tsx` |
| Wiring `send_echo` | ✅ | `AuraMatchPage.tsx` em `onTap` quando há ressonância |
| Wiring `visit_room` | ✅ | `AuraRoomLive.tsx` em `useEffect` de entrada |
| Wiring `resonance_3` | ✅ | `AuraField.tsx` via `onResonanceDetected` |

## Bloco B — Achievements & Weekly Chest
| Item | Status | Evidência |
|---|---|---|
| Paleta única por achievement | ✅ | `AuraAchievements.tsx` com palette[id] |
| Card expansível com progress | ✅ | `current/threshold` + remaining counter |
| Countdown ao vivo do baú semanal | ✅ | `fmtCountdown` em `AuraWeeklyChest.tsx`, ciclo 7d |

## Bloco C — Visitors / Signal History
| Item | Status | Evidência |
|---|---|---|
| Metadata (gender, city, type) | ✅ | `AuraSignalHistory.tsx` decoupled fetch |
| Click → perfil social | ✅ | navegação via router |

## Bloco D — Mobile UX & Modais
| Item | Status | Evidência |
|---|---|---|
| Long-press / double-tap nas bolhas | ✅ | `AuraBubble.tsx` (tap=quick card 2.4–3.5s, dbl-tap=panel) |
| RadarUserSheet responsivo | ✅ | grid 2/4 cols, close 40×40 blur, safe-area |
| Super DM funcional | ✅ | `SuperDmPaymentModal` montado em `AuraMatchPage`, swipe só após `onPaid` |
| Sala fullscreen mobile | ✅ | `AuraRoomLive` com `h-[100dvh]` + close prominent |
| Botões de ação coloridos/distintos | ✅ | toasts contextuais por ação |
| Requirements line sempre visível | ✅ | `AuraRoomRequirementsLine` |

## Etapa Extra 1 — Persistência server-side do menu de destaque
| Item | Status | Evidência |
|---|---|---|
| Coluna `profiles.highlight_glow_style` | ✅ | `2026_05_11_profile_highlight_glow_prefs.sql` |
| RPC `set_highlight_glow_style` / `get_highlight_glow_style` | ✅ | SECURITY DEFINER + search_path |
| Hook hidrata e persiste com debounce 400ms | ✅ | `useHighlightGlow.ts` |
| Fallback localStorage mantido | ✅ | leitura imediata + sincronização tardia |

## Etapa Extra 2 — Hardening do chat da Aura Room
| Item | Status | Evidência |
|---|---|---|
| Estado `presence: idle/reconnecting/present` | ✅ | `useAuraRoomChat.ts` |
| `ensurePresence()` exposto | ✅ | join idempotente |
| Auto-recovery em `not_present` | ✅ | 3 retries c/ delay incremental |
| Badge "reconectando…" no header | ✅ | `AuraRoomChat.tsx` |
| Toast suavizado (sem destruir input) | ✅ | mensagens contextuais por reason |

---

## Pendências Encontradas e Corrigidas no Mesmo Turno
- Nenhuma regressão funcional nova identificada.
- Stale chunk check: rodado via `node scripts/check-stale-chunks.mjs` no pipeline (manual — sem detecção de chunks órfãos).

## SQL a aplicar no Supabase Externo (SQL Editor)
Arquivo: `supabase/external_sql/2026_05_11_profile_highlight_glow_prefs.sql`

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS highlight_glow_style text DEFAULT 'gold';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_highlight_glow_style_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_highlight_glow_style_check
      CHECK (highlight_glow_style IN ('gold','rgb'));
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.set_highlight_glow_style(p_style text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  IF p_style NOT IN ('gold','rgb') THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_style'); END IF;
  UPDATE public.profiles SET highlight_glow_style = p_style, updated_at = now() WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true, 'style', p_style);
END;$$;
GRANT EXECUTE ON FUNCTION public.set_highlight_glow_style(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_highlight_glow_style()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(highlight_glow_style, 'gold') FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_highlight_glow_style() TO authenticated;
```

**Status final:** ✅ Todos os blocos auditados sem pendências críticas.
