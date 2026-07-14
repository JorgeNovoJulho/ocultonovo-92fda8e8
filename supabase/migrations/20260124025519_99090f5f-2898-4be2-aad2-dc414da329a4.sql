-- Tabela para armazenar templates de email personalizáveis
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  category TEXT DEFAULT 'payment',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - apenas admins podem gerenciar
CREATE POLICY "Admins can view email templates"
  ON public.email_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin_master', 'admin_support')
    )
  );

CREATE POLICY "Admin master can manage email templates"
  ON public.email_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin_master'
    )
  );

-- Trigger para updated_at
CREATE TRIGGER update_email_templates_timestamp
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_timestamp();

-- Inserir templates padrão
INSERT INTO public.email_templates (template_key, name, description, subject, html_content, variables, category) VALUES
(
  'payment_reminder_day1',
  'Lembrete Dia 1',
  'Email enviado no primeiro dia de atraso do pagamento',
  '💳 Lembrete: Pagamento Pendente - Oculto',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .info-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; }
    .btn { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>💳 Lembrete de Pagamento</h1>
    <p style="margin: 0; opacity: 0.9;">Identificamos um pagamento pendente</p>
  </div>
  <div class="content">
    <p>Olá, <strong>{{user_name}}</strong>!</p>
    
    <div class="info-box">
      Identificamos que seu pagamento de <strong>{{amount}}</strong> está pendente.
    </div>
    
    <p>Para continuar aproveitando todos os recursos exclusivos da plataforma, por favor regularize sua situação.</p>
    
    <p style="text-align: center; margin: 30px 0;">
      <a href="{{payment_url}}" class="btn">Pagar Agora</a>
    </p>
    
    <p style="color: #6b7280; font-size: 14px;">
      Se você já realizou o pagamento, por favor desconsidere este email.
    </p>
  </div>
  <div class="footer">
    <p>{{platform_name}} - Sua plataforma de encontros</p>
  </div>
</body>
</html>',
  '["user_name", "amount", "payment_url", "platform_name"]'::jsonb,
  'payment'
),
(
  'payment_reminder_day3',
  'Lembrete Dia 3',
  'Email enviado no terceiro dia de atraso - tom mais urgente',
  '⏰ Lembrete de Pagamento Pendente - Oculto',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .warning-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
    .btn { display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⏰ Lembrete de Pagamento</h1>
    <p style="margin: 0; opacity: 0.9;">Seu acesso pode ser limitado em breve</p>
  </div>
  <div class="content">
    <p>Olá, <strong>{{user_name}}</strong>!</p>
    
    <div class="warning-box">
      Identificamos que seu pagamento de <strong>{{amount}}</strong> está pendente há 3 dias.
    </div>
    
    <p>Para continuar aproveitando todos os recursos da plataforma, regularize sua situação:</p>
    
    <p style="text-align: center; margin: 30px 0;">
      <a href="{{payment_url}}" class="btn">Pagar Agora</a>
    </p>
    
    <p style="color: #6b7280; font-size: 14px;">
      Se você já realizou o pagamento, por favor desconsidere este email.
    </p>
  </div>
  <div class="footer">
    <p>{{platform_name}} - Sua plataforma de encontros</p>
  </div>
</body>
</html>',
  '["user_name", "amount", "payment_url", "platform_name"]'::jsonb,
  'payment'
),
(
  'payment_reminder_day7',
  'Última Chance (Dia 7)',
  'Email urgente antes da suspensão da conta',
  '⚠️ Última Chance - Sua conta será suspensa',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .danger-box { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
    .btn { display: inline-block; background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚠️ Última Chance</h1>
    <p style="margin: 0; opacity: 0.9;">Sua conta será suspensa em breve</p>
  </div>
  <div class="content">
    <p>Olá, <strong>{{user_name}}</strong>!</p>
    
    <div class="danger-box">
      <strong>ATENÇÃO:</strong> Seu pagamento de <strong>{{amount}}</strong> está pendente há 7 dias. 
      Sua conta será suspensa nas próximas horas se não regularizada.
    </div>
    
    <p>Ao ter sua conta suspensa, você perderá:</p>
    <ul>
      <li>Acesso ao radar e matches</li>
      <li>Visualização de stories e posts</li>
      <li>Envio e recebimento de mensagens</li>
      <li>Acesso a eventos exclusivos</li>
    </ul>
    
    <p style="text-align: center; margin: 30px 0;">
      <a href="{{payment_url}}" class="btn">Regularizar Agora</a>
    </p>
  </div>
  <div class="footer">
    <p>{{platform_name}} - Sua plataforma de encontros</p>
  </div>
</body>
</html>',
  '["user_name", "amount", "payment_url", "platform_name"]'::jsonb,
  'payment'
),
(
  'account_suspended',
  'Conta Suspensa',
  'Email enviado quando a conta é suspensa por inadimplência',
  '🚫 Sua conta foi suspensa - Oculto',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .warning-box { background: #fef3f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
    .btn { display: inline-block; background: #7c3aed; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚫 Conta Suspensa</h1>
    <p style="margin: 0; opacity: 0.9;">Seu acesso foi temporariamente limitado</p>
  </div>
  <div class="content">
    <p>Olá, <strong>{{user_name}}</strong>!</p>
    
    <div class="warning-box">
      <strong>Sua conta foi suspensa</strong> devido ao pagamento de <strong>{{amount}}</strong> pendente há mais de 7 dias.
    </div>
    
    <p>Enquanto sua conta estiver suspensa, você não terá acesso a:</p>
    <ul>
      <li>❌ Radar e busca de usuários</li>
      <li>❌ Envio e recebimento de mensagens</li>
      <li>❌ Visualização de stories e posts</li>
      <li>❌ Participação em eventos</li>
    </ul>
    
    <p><strong>Boas notícias:</strong> Ao regularizar seu pagamento, seu acesso será restaurado imediatamente!</p>
    
    <p style="text-align: center; margin: 30px 0;">
      <a href="{{payment_url}}" class="btn">Regularizar e Voltar</a>
    </p>
  </div>
  <div class="footer">
    <p>{{platform_name}} - Sua plataforma de encontros</p>
  </div>
</body>
</html>',
  '["user_name", "amount", "payment_url", "platform_name"]'::jsonb,
  'payment'
),
(
  'payment_confirmed',
  'Pagamento Confirmado',
  'Email enviado quando o pagamento é regularizado',
  '✅ Pagamento Confirmado! - Oculto',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
    .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .success-box { background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
    .btn { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>✅ Pagamento Confirmado!</h1>
    <p style="margin: 0; opacity: 0.9;">Sua conta está regularizada</p>
  </div>
  <div class="content">
    <p>Olá, <strong>{{user_name}}</strong>!</p>
    
    <div class="success-box">
      <strong>Ótima notícia!</strong> Seu pagamento foi confirmado e sua conta está totalmente regularizada.
    </div>
    
    <p>Agora você tem acesso completo a todos os recursos:</p>
    <ul>
      <li>✅ Radar e busca ilimitada</li>
      <li>✅ Mensagens sem restrições</li>
      <li>✅ Stories e posts exclusivos</li>
      <li>✅ Todos os eventos</li>
    </ul>
    
    <p style="text-align: center; margin: 30px 0;">
      <a href="{{app_url}}" class="btn">Acessar Plataforma</a>
    </p>
    
    <p>Obrigado por continuar conosco! 💜</p>
  </div>
  <div class="footer">
    <p>{{platform_name}} - Sua plataforma de encontros</p>
  </div>
</body>
</html>',
  '["user_name", "app_url", "platform_name"]'::jsonb,
  'payment'
);