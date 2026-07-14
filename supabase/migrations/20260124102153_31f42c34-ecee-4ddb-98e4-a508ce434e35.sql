-- =====================================================
-- 1. TABELA EMAIL_LOGS PARA MÉTRICAS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  resend_message_id TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON public.email_logs(template_key);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_resend_id ON public.email_logs(resend_message_id);

-- RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver logs de email
CREATE POLICY "Admins can view email logs"
  ON public.email_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin_master', 'admin_regional', 'moderator')
    )
  );

-- =====================================================
-- 2. NOVOS TEMPLATES DE EMAIL (usando JSONB para variables)
-- =====================================================

-- Template: Boas-vindas
INSERT INTO public.email_templates (template_key, name, category, subject, html_content, variables, is_active)
VALUES (
  'welcome_new_user',
  'Boas-vindas ao Novo Usuário',
  'onboarding',
  'Bem-vindo(a) ao {{platform_name}}, {{user_name}}! 🎉',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;"><div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 16px; text-align: center;"><h1 style="color: white; margin: 0;">Bem-vindo(a)! 🎉</h1></div><div style="background: #16213e; padding: 30px; border-radius: 16px; margin-top: 20px; color: white;"><p style="font-size: 18px;">Olá, <strong>{{user_name}}</strong>!</p><p>Sua conta foi criada com sucesso. Estamos muito felizes em ter você conosco!</p><div style="text-align: center; margin-top: 30px;"><a href="{{profile_url}}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: bold;">Completar Meu Perfil</a></div></div></body></html>',
  '["user_name", "platform_name", "profile_url", "year"]'::jsonb,
  true
) ON CONFLICT (template_key) DO NOTHING;

-- Template: Recuperação de Senha
INSERT INTO public.email_templates (template_key, name, category, subject, html_content, variables, is_active)
VALUES (
  'password_reset',
  'Recuperação de Senha',
  'auth',
  'Redefinir sua senha - {{platform_name}}',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;"><div style="background: #16213e; padding: 30px; border-radius: 16px; color: white;"><h1 style="color: #667eea; margin-top: 0;">🔐 Redefinir Senha</h1><p style="font-size: 16px;">Olá, <strong>{{user_name}}</strong>!</p><p>Recebemos uma solicitação para redefinir a senha da sua conta.</p><div style="text-align: center; margin: 30px 0;"><a href="{{reset_url}}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: bold;">Redefinir Minha Senha</a></div><p style="color: #999; font-size: 14px;">Este link expira em 1 hora.</p></div></body></html>',
  '["user_name", "platform_name", "reset_url"]'::jsonb,
  true
) ON CONFLICT (template_key) DO NOTHING;

-- Template: Novo Match
INSERT INTO public.email_templates (template_key, name, category, subject, html_content, variables, is_active)
VALUES (
  'new_match',
  'Notificação de Novo Match',
  'social',
  '💕 Você tem um novo match, {{user_name}}!',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;"><div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); padding: 30px; border-radius: 16px; text-align: center;"><h1 style="color: white; margin: 0;">💕 Novo Match!</h1></div><div style="background: #16213e; padding: 30px; border-radius: 16px; margin-top: 20px; color: white; text-align: center;"><img src="{{match_avatar}}" alt="{{match_name}}" style="width: 100px; height: 100px; border-radius: 50%; border: 4px solid #ff6b6b; margin-bottom: 15px;"><h2 style="margin: 10px 0;">{{match_name}}</h2><p style="color: #999;">Vocês combinaram! Comece uma conversa agora.</p><div style="margin-top: 25px;"><a href="{{chat_url}}" style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: bold;">Iniciar Conversa</a></div></div></body></html>',
  '["user_name", "match_name", "match_avatar", "chat_url"]'::jsonb,
  true
) ON CONFLICT (template_key) DO NOTHING;

-- Template: Novo Seguidor
INSERT INTO public.email_templates (template_key, name, category, subject, html_content, variables, is_active)
VALUES (
  'new_follower',
  'Alerta de Novo Seguidor',
  'social',
  '👤 {{follower_name}} começou a te seguir!',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;"><div style="background: #16213e; padding: 30px; border-radius: 16px; color: white; text-align: center;"><h1 style="color: #667eea; margin-top: 0;">👤 Novo Seguidor!</h1><img src="{{follower_avatar}}" alt="{{follower_name}}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid #667eea; margin: 20px 0;"><h2 style="margin: 10px 0;">{{follower_name}}</h2><p style="color: #999;">Começou a seguir seu perfil.</p><div style="margin-top: 25px;"><a href="{{profile_url}}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; font-weight: bold;">Ver Perfil</a></div></div></body></html>',
  '["user_name", "follower_name", "follower_avatar", "profile_url"]'::jsonb,
  true
) ON CONFLICT (template_key) DO NOTHING;

-- Template: Confirmação de Evento
INSERT INTO public.email_templates (template_key, name, category, subject, html_content, variables, is_active)
VALUES (
  'event_confirmation',
  'Confirmação de Inscrição em Evento',
  'events',
  '✅ Inscrição confirmada: {{event_name}}',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;"><div style="background: linear-gradient(135deg, #00b894 0%, #00cec9 100%); padding: 30px; border-radius: 16px; text-align: center;"><h1 style="color: white; margin: 0;">✅ Inscrição Confirmada!</h1></div><div style="background: #16213e; padding: 30px; border-radius: 16px; margin-top: 20px; color: white;"><h2 style="color: #00b894;">{{event_name}}</h2><p><strong>📅 Data:</strong> {{event_date}}</p><p><strong>📍 Local:</strong> {{event_location}}</p><p><strong>🎟️ Código:</strong> {{ticket_code}}</p><div style="text-align: center; margin-top: 25px;"><a href="{{event_url}}" style="background: linear-gradient(135deg, #00b894 0%, #00cec9 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; font-weight: bold;">Ver Detalhes do Evento</a></div></div></body></html>',
  '["user_name", "event_name", "event_date", "event_location", "ticket_code", "event_url"]'::jsonb,
  true
) ON CONFLICT (template_key) DO NOTHING;

-- Template: Lembrete de Evento
INSERT INTO public.email_templates (template_key, name, category, subject, html_content, variables, is_active)
VALUES (
  'event_reminder',
  'Lembrete de Evento - 24h',
  'events',
  '⏰ Lembrete: {{event_name}} é amanhã!',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;"><div style="background: linear-gradient(135deg, #f39c12 0%, #e74c3c 100%); padding: 30px; border-radius: 16px; text-align: center;"><h1 style="color: white; margin: 0;">⏰ É Amanhã!</h1></div><div style="background: #16213e; padding: 30px; border-radius: 16px; margin-top: 20px; color: white;"><p>Olá, <strong>{{user_name}}</strong>!</p><h2 style="color: #f39c12;">{{event_name}}</h2><p><strong>📅</strong> {{event_date}}</p><p><strong>📍</strong> {{event_location}}</p><div style="text-align: center; margin-top: 25px;"><a href="{{event_url}}" style="background: linear-gradient(135deg, #f39c12 0%, #e74c3c 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; font-weight: bold;">Ver Evento</a></div></div></body></html>',
  '["user_name", "event_name", "event_date", "event_location", "event_url"]'::jsonb,
  true
) ON CONFLICT (template_key) DO NOTHING;

-- Template: Lance Superado (Leilão)
INSERT INTO public.email_templates (template_key, name, category, subject, html_content, variables, is_active)
VALUES (
  'auction_outbid',
  'Você foi Superado no Leilão',
  'auction',
  '⚡ Você foi superado! Lance agora para não perder "{{auction_title}}"',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;"><div style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); padding: 30px; border-radius: 16px; text-align: center;"><h1 style="color: white; margin: 0;">⚡ SUPERADO!</h1></div><div style="background: #16213e; padding: 30px; border-radius: 16px; margin-top: 20px; color: white; text-align: center;"><p style="font-size: 18px;">Seu lance de <strong style="color: #e74c3c;">R$ {{your_bid}}</strong> foi superado!</p><h2 style="color: #667eea;">{{auction_title}}</h2><div style="background: #0f3460; padding: 20px; border-radius: 12px; margin: 20px 0;"><p style="margin: 0; color: #999;">Lance atual:</p><p style="font-size: 32px; color: #00b894; margin: 10px 0; font-weight: bold;">R$ {{current_bid}}</p><p style="margin: 0; color: #f39c12;">⏰ Termina em: {{time_remaining}}</p></div><a href="{{auction_url}}" style="display: inline-block; background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">DAR NOVO LANCE</a></div></body></html>',
  '["user_name", "auction_title", "your_bid", "current_bid", "time_remaining", "auction_url"]'::jsonb,
  true
) ON CONFLICT (template_key) DO NOTHING;

-- Template: Vencedor do Leilão
INSERT INTO public.email_templates (template_key, name, category, subject, html_content, variables, is_active)
VALUES (
  'auction_won',
  'Parabéns! Você Venceu o Leilão',
  'auction',
  '🏆 Parabéns! Você venceu o leilão "{{auction_title}}"!',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;"><div style="background: linear-gradient(135deg, #f1c40f 0%, #f39c12 100%); padding: 30px; border-radius: 16px; text-align: center;"><h1 style="color: #1a1a2e; margin: 0;">🏆 VOCÊ VENCEU!</h1></div><div style="background: #16213e; padding: 30px; border-radius: 16px; margin-top: 20px; color: white; text-align: center;"><p style="font-size: 18px;">Parabéns, <strong>{{user_name}}</strong>!</p><h2 style="color: #f1c40f;">{{auction_title}}</h2><div style="background: #0f3460; padding: 20px; border-radius: 12px; margin: 20px 0;"><p style="margin: 0; color: #999;">Valor pago:</p><p style="font-size: 32px; color: #00b894; margin: 10px 0; font-weight: bold;">R$ {{winning_bid}}</p></div><p>O conteúdo exclusivo já está disponível no seu Vault!</p><a href="{{vault_url}}" style="display: inline-block; background: linear-gradient(135deg, #f1c40f 0%, #f39c12 100%); color: #1a1a2e; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: bold;">ACESSAR MEU CONTEÚDO</a></div></body></html>',
  '["user_name", "auction_title", "winning_bid", "vault_url", "creator_name"]'::jsonb,
  true
) ON CONFLICT (template_key) DO NOTHING;

-- Template: Leilão Encerrado (Perdedor)
INSERT INTO public.email_templates (template_key, name, category, subject, html_content, variables, is_active)
VALUES (
  'auction_ended_loser',
  'Leilão Encerrado - Você não venceu',
  'auction',
  '⏰ Leilão encerrado: "{{auction_title}}"',
  '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e;"><div style="background: #16213e; padding: 30px; border-radius: 16px; color: white; text-align: center;"><h1 style="color: #667eea; margin-top: 0;">⏰ Leilão Encerrado</h1><h2>{{auction_title}}</h2><p style="color: #999;">Infelizmente você não venceu desta vez.</p><div style="background: #0f3460; padding: 15px; border-radius: 10px; margin: 20px 0;"><p style="margin: 0;">Lance vencedor: <strong style="color: #00b894;">R$ {{winning_bid}}</strong></p></div><p>Confira outros leilões ativos:</p><a href="{{auctions_url}}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; font-weight: bold;">VER LEILÕES ATIVOS</a></div></body></html>',
  '["user_name", "auction_title", "winning_bid", "auctions_url"]'::jsonb,
  true
) ON CONFLICT (template_key) DO NOTHING;

-- =====================================================
-- 3. CONFIGURAÇÃO STRIPE NA SYSTEM_SETTINGS
-- =====================================================
INSERT INTO public.system_settings (key, value, description, updated_by)
VALUES 
  ('stripe_configured', 'false', 'Se o Stripe está configurado', NULL),
  ('stripe_sandbox_mode', 'true', 'Modo sandbox do Stripe', NULL)
ON CONFLICT (key) DO NOTHING;