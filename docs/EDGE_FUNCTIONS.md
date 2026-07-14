# 📦 Edge Functions — APP OCULTO

Todas as 58 Edge Functions estão em `supabase/functions/` e usam Deno runtime padrão do Supabase.

## Deploy
```bash
# Todas de uma vez
supabase functions deploy

# Função específica
supabase functions deploy stripe-webhook
```

## Categorias

### 💳 Pagamentos
| Função | Descrição |
|--------|-----------|
| `stripe-gateway` | Cria sessões de checkout Stripe |
| `stripe-webhook` | Processa eventos Stripe (pagamento, cancelamento) |
| `stripe-config` | Configuração Stripe do admin |
| `pix-gateway` | Gera cobranças PIX via Asaas |
| `pix-webhook` | Processa confirmação PIX Asaas |
| `asaas-webhook` | Webhook geral Asaas |
| `payment-status-webhook` | Atualiza status de pagamento |
| `checkout-sentinel` | Monitora abandonos de checkout |
| `recover-abandoned-carts` | Envia lembretes de carrinho |
| `check-payment-reminders` | Verifica pagamentos pendentes |
| `creator-payout` | Processa saques de criadores |
| `admin-payout` | Aprovação de saques pelo admin |

### 🎥 Mídia
| Função | Descrição |
|--------|-----------|
| `transcode-video` | Transcoding via Cloudflare Stream |
| `upload-founder-media` | Upload de mídia de fundadores |

### 🔔 Notificações
| Função | Descrição |
|--------|-----------|
| `send-push-notification` | Push notifications (Web Push) |
| `dispatch-smart-push` | Push inteligente baseado em regras |
| `send-test-email` | Envio de e-mails transacionais |
| `send-waitlist-invites` | Convites da waitlist |
| `notify-founder-status` | Status de aplicação de fundador |
| `notify-looking-now` | Alertas "Buscando Agora" |
| `notify-madrinha-commission` | Notifica comissão de referral |
| `test-discord-webhook` | Testa webhook Discord |
| `test-resend-connection` | Testa conexão Resend |

### 🤖 IA e Automação
| Função | Descrição |
|--------|-----------|
| `openai-chat` | Chat IA com OpenAI |
| `ghost-like` | Likes automáticos (engajamento) |
| `smart-feed-filler` | Preenchimento inteligente do feed |
| `generate-test-profiles` | Geração de perfis de teste |
| `process-reengagement` | Re-engajamento automático |
| `execute-marketing-campaign` | Execução de campanhas |

### 🏷 Leilões e Marketplace
| Função | Descrição |
|--------|-----------|
| `auction-gateway` | Gestão de leilões |
| `check-auction-endings` | Verifica fins de leilão |

### 📊 Relatórios
| Função | Descrição |
|--------|-----------|
| `daily-financial-report` | Relatório financeiro diário |
| `weekly-creators-report` | Relatório semanal de criadores |
| `generate-invoice-pdf` | Geração de PDFs de fatura |
| `send-pdf-report-email` | Envio de relatórios por e-mail |

### 🔒 Segurança e Conta
| Função | Descrição |
|--------|-----------|
| `delete-account` | Auto-destruição de conta |
| `anonymize-inactive-users` | Anonimização LGPD |
| `export-user-data` | Exportação de dados (LGPD) |
| `check-safety-checkins` | Check-ins de segurança |

### ⏰ Scheduled (Cron)
| Função | Descrição |
|--------|-----------|
| `check-expirations` | Verifica expirações gerais |
| `check-freeze-expiration` | Verifica congelamentos |
| `check-growth-milestone` | Milestones de crescimento |
| `check-looking-now-expiration` | Expira "Buscando Agora" |
| `check-poll-closure` | Fecha enquetes expiradas |
| `check-verification-deadline` | Deadline de verificação |
| `process-scheduled-broadcasts` | Broadcasts agendados |
| `run-scheduled-backup` | Backup automático |

### 📦 Backup
| Função | Descrição |
|--------|-----------|
| `create-full-backup` | Backup completo |
| `restore-backup` | Restauração de backup |

### 📱 WhatsApp e Promoções
| Função | Descrição |
|--------|-----------|
| `whatsapp-gateway` | Gateway WhatsApp Business |
| `send-promotion-whatsapp` | Promoções via WhatsApp |

### 🔗 Outros
| Função | Descrição |
|--------|-----------|
| `track-conversion-event` | Tracking de conversões |
| `track-share-click` | Tracking de compartilhamentos |
| `submit-founder-application` | Aplicação de fundador |
| `setup-vapid` | Geração e configuração de chaves VAPID (admin-only) |
| `process-broadcast` | Processamento de broadcasts |
| `capacity-alert-dispatcher` | Alertas de capacidade |
| `resend-webhook` | Webhook Resend |

## Secrets necessários
```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  ASAAS_WEBHOOK_TOKEN=... \
  OPENAI_API_KEY=sk-... \
  CLOUDFLARE_ACCOUNT_ID=... \
  CLOUDFLARE_STREAM_API_TOKEN=... \
  DISCORD_WEBHOOK_URL=... \
  APP_URL=https://ocultoswing.com.br
```
