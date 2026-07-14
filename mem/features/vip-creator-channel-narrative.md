---
name: VIP Creator Channel — Narrative Sections
description: Canal VIP suporta 6 seções narrativas (story/chapter/diary/article/series/text_post) reusando posts + subscription_plans
type: feature
---

# Canal VIP — Conteúdo Narrativo

Além das seções de mídia (short_video, long_video, photo, photo_pack, video_pack, events, promo), o Canal VIP suporta 6 seções narrativas usando a **mesma tabela `posts`** via `section_type` + `content_format='narrative'`:

| section_type | Rótulo PT-BR | Ícone |
|---|---|---|
| story | Histórias | BookOpen |
| chapter | Capítulos | BookMarked |
| series | Séries | Library |
| diary | Diário VIP | Notebook |
| article | Textos | FileText |
| text_post | Bastidores | Sparkles |

## Colunas usadas (posts)
`title`, `subtitle`, `teaser`, `content_text` (corpo), `series_id`, `series_title`, `chapter_number`, `scheduled_at`, `read_time_minutes`, `narrative_status`, `content_format`, `thumbnail_url` (capa), `is_locked`, `is_paid`, `paid_price`.

## Tabela auxiliar
`creator_content_series` — apenas agrupador opcional (id, creator_id, title, cover_url). Capítulos vivem em `posts`, não duplicar.

## Componentes
- `CreatorChannelPage.SECTION_DEFS` lista as 13 seções; `NARRATIVE_KEYS` identifica narrativas
- `AddNarrativeContentModal` — modal dedicado (texto longo + série + capa + agendamento + preço)
- `ChannelContentViewer` ramifica para layout de leitura quando `content_format === 'narrative'` (fonte serif, leading 1.8, capa hero, teaser destacado, watermark anti-pirataria)

## Acesso (reusado, sem nova RPC)
- Dono: vê tudo + edita/exclui/congela
- Assinante ativo OU comprador avulso: corpo completo
- Free/Premium sem acesso: título + capa + teaser + CTA (mesma camada blur dos cards de mídia)

## SQL
`supabase/external_sql/2026_05_24_canal_vip_narrative.sql` — idempotente, adiciona colunas + trigger de validação + tabela de séries com RLS.
