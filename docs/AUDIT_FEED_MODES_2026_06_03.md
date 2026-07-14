# Auditoria — Feed View Modes (Etapa 6)
Data: 2026-06-03

## Lazy-loading real por modo — CONFIRMADO ✅

Todas as 21 strips do `RealFeed` são importadas via `React.lazy(() => import('...'))` e
renderizadas dentro de blocos condicionais `feedModeShows('key') && <Strip />`.

Como `lazy()` só dispara o `import()` no **primeiro mount** do componente, modos
que não usam uma strip **nunca baixam o chunk correspondente**. Vite faz code-split
automático por dynamic import.

### Custo estimado por modo (chunks que NÃO baixam)
| Modo        | Chunks evitados (de 21) | Notas |
|-------------|------------------------:|-------|
| completo    | 0                       | baseline (~ todos os carrosséis) |
| social      | 14                      | sem Radar/VIP/Hidden/Marketplace/Ads |
| descoberta  | 13                      | sem Stories/Retention/MicroTips |
| limpo       | 21                      | só posts; **mais leve possível** |
| card        | 20                      | só Stories + grid de cards |

Economia média de ~60–70% de JS inicial em `limpo` e `card`, validando o
objetivo de performance <4GB RAM.

## Mobile checklist

- [x] `FeedModeSelector` com tap target ≥44px no mobile (h-9 + min-w-44px + touch-manipulation)
- [x] `DropdownMenuContent` com `max-w-[calc(100vw-1rem)]` (não estoura viewport 320–414px)
- [x] `aria-label` informa o modo atual para leitores de tela
- [x] `FeedModePreviewGrid` em 2 colunas no mobile (sm:3) — confirmado
- [x] Realtime de `oculto_feed_modes_config` aplica desabilitação em ≤1s

## Telemetria (Etapa 5)

- `oculto_feed_mode_events` populada via `log_feed_mode_event` fire-and-forget
- Origens rastreadas: `selector` (header), `onboarding` (preview grid),
  `admin` (reservado), `system` (reservado)
- Painel `/admin/modos-feed` aba **Métricas** com janelas 1/7/30/90d

## Próximos passos sugeridos (fora desta etapa)

- Pré-fetch opcional do próximo modo mais provável quando idle (`requestIdleCallback`)
- A/B test do modo default para novos usuários via `ab_test_configs`
- Heatmap de retenção por modo cruzado com plano
