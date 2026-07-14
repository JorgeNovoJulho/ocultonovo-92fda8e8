-- ============================================================
-- APP OCULTO — SCRIPT SQL COMPLETO PARA REPLICAÇÃO
-- Banco de origem: bpmeahyvubewqmmdxsll (Lovable Cloud)
-- Gerado em: 2026-03-02
-- 
-- INSTRUÇÕES:
-- 1. Crie um novo projeto Supabase
-- 2. Abra o SQL Editor
-- 3. Cole e execute este script inteiro
-- 4. Configure as Edge Functions separadamente via CLI
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- PARTE 1: FUNÇÕES AUXILIARES (executar PRIMEIRO)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid() AND is_active = true)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin_master','admin_regional','moderator'))
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id uuid, check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = conv_id AND user_id = check_user_id);
$$;

CREATE OR REPLACE FUNCTION public.calculate_priority_score(p_is_verified boolean, p_is_verified_couple boolean, p_plan_type text, p_is_creator boolean)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE score INTEGER := 0;
BEGIN
  IF p_plan_type = 'vip' THEN score := score + 100;
  ELSIF p_plan_type = 'premium' THEN score := score + 50; END IF;
  IF p_is_verified THEN score := score + 30; END IF;
  IF p_is_verified_couple THEN score := score + 20; END IF;
  IF p_is_creator THEN score := score + 10; END IF;
  RETURN score;
END; $$;

-- ══════════════════════════════════════════════════════════════
-- PARTE 2: TABELAS AUXILIARES (referenciadas por RLS)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_staff (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  is_active boolean DEFAULT true,
  permissions jsonb,
  region text,
  last_active timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.admin_staff ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- PARTE 3: PROFILES (Tabela principal de usuários)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  username text UNIQUE,
  avatar_url text,
  cover_image_url text,
  bio text,
  birth_date date,
  gender text,
  gender_other text,
  phone_number text,
  
  -- Plano e Status
  plan_type text DEFAULT 'free',
  is_creator boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  is_verified_couple boolean DEFAULT false,
  is_vip boolean,
  vip_tier text DEFAULT 'none',
  is_lifetime boolean NOT NULL DEFAULT false,
  is_pioneiro boolean DEFAULT false,
  payment_status text DEFAULT 'active',
  payment_due_date timestamptz,
  subscription_amount numeric DEFAULT 0,
  stripe_customer_id text,
  
  -- Monetização
  balance numeric DEFAULT 0,
  pending_balance numeric DEFAULT 0,
  balance_frozen boolean DEFAULT false,
  balance_frozen_reason text,
  balance_frozen_at timestamptz,
  balance_frozen_by uuid,
  asaas_wallet_id text,
  pix_key_type text,
  pix_key text,
  cpf_cnpj text,
  
  -- Localização
  location_lat double precision,
  location_lng double precision,
  show_on_radar boolean DEFAULT true,
  
  -- Presença
  is_online boolean DEFAULT false,
  last_seen timestamptz DEFAULT now(),
  last_activity_at timestamptz DEFAULT now(),
  is_looking_now boolean DEFAULT false,
  looking_now_since timestamptz,
  
  -- Privacidade
  is_private boolean DEFAULT false,
  is_invisible boolean DEFAULT false,
  show_online_status boolean DEFAULT true,
  hide_age boolean DEFAULT false,
  hide_location boolean DEFAULT false,
  has_ghost_mode boolean DEFAULT false,
  is_ghost_active boolean DEFAULT false,
  dm_setting text DEFAULT 'all',
  ranking_anonymity boolean DEFAULT false,
  show_fan_ranking boolean DEFAULT true,
  two_factor_enabled boolean DEFAULT false,
  connection_mode boolean DEFAULT false,
  
  -- Super DM
  accept_super_dm boolean DEFAULT true,
  min_super_dm_price numeric DEFAULT 5,
  super_dm_earnings numeric DEFAULT 0,
  super_dm_auto_reply_enabled boolean DEFAULT false,
  super_dm_auto_reply_message text DEFAULT 'Obrigado pelo Super DM! 💫 Vou responder o mais breve possível.',
  super_dm_estimated_response_hours integer DEFAULT 24,
  
  -- Moderação
  account_status text DEFAULT 'active',
  warning_count integer DEFAULT 0,
  frozen_until timestamptz,
  banned_at timestamptz,
  banned_by uuid,
  ban_reason text,
  is_shadowbanned boolean DEFAULT false,
  shadowbanned_at timestamptz,
  shadowbanned_by uuid,
  shadowban_reason text,
  
  -- Verificação
  partner1_doc_verified boolean DEFAULT false,
  partner2_doc_verified boolean DEFAULT false,
  partner1_selfie_verified boolean DEFAULT false,
  partner2_selfie_verified boolean DEFAULT false,
  partner1_name text,
  partner2_name text,
  partner2_birth_date date,
  verification_deadline timestamptz,
  verification_reminder_sent boolean DEFAULT false,
  is_oculto_verified boolean NOT NULL DEFAULT false,
  kyc_type text,
  kyc_document_url text,
  kyc_selfie_url text,
  kyc_submitted_at timestamptz,
  
  -- Referral
  creator_referral_code text,
  referred_by_creator_id uuid,
  creator_referral_expires_at timestamptz,
  referred_by_share_code text,
  external_clicks_count integer DEFAULT 0,
  
  -- Mídia
  voice_bio_url text,
  voice_bio_duration integer,
  pair_photos text[] DEFAULT '{}',
  pair_bio text DEFAULT '',
  
  -- Tags
  tags_social text[] DEFAULT '{}',
  tags_adult text[] DEFAULT '{}',
  
  -- Endereço
  address_street text, address_number text, address_complement text,
  address_neighborhood text, address_city text, address_state text,
  address_cep text, address_lat double precision, address_lng double precision,
  address_verified boolean DEFAULT false,
  
  -- Config
  profile_type text DEFAULT 'single',
  device_settings jsonb DEFAULT '{}',
  notification_preferences jsonb DEFAULT '{"likes":true,"visits":true,"follows":true,"unlocks":true,"messages":true,"push_enabled":true}',
  whatsapp_promotions_opt_in boolean DEFAULT true,
  is_seed boolean DEFAULT false,
  is_test_account boolean DEFAULT false,
  is_anonymized boolean DEFAULT false,
  payment_reminder_count integer DEFAULT 0,
  last_payment_reminder_at timestamptz,
  founder_terms_accepted_at timestamptz,
  total_xp integer DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users see own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Authenticated users see public profiles" ON public.profiles FOR SELECT USING (
  account_status = 'active' AND (is_anonymized IS NULL OR is_anonymized = false) AND (is_shadowbanned IS NULL OR is_shadowbanned = false)
);
CREATE POLICY "Only admins can delete profiles" ON public.profiles FOR DELETE USING (has_role(auth.uid(), 'admin_master'));

-- ══════════════════════════════════════════════════════════════
-- PARTE 4: POSTS (Conteúdo)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  content_text text,
  media_url text,
  media_urls text[],
  media_type text DEFAULT 'image',
  privacy_level text DEFAULT 'public',
  is_locked boolean DEFAULT false,
  is_paid boolean DEFAULT false,
  paid_price numeric DEFAULT 0,
  likes_count integer DEFAULT 0,
  dislikes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  post_type text DEFAULT 'standard',
  is_flash boolean DEFAULT false,
  is_seed boolean DEFAULT false,
  is_hidden boolean DEFAULT false,
  hidden_reason text,
  hidden_at timestamptz,
  hidden_by uuid,
  allow_sharing boolean DEFAULT true,
  share_link text,
  file_size_bytes bigint,
  file_type text,
  original_filename text,
  video_duration_seconds integer,
  video_master_url text,
  video_preview_url text,
  video_hls_url text,
  video_processing_status text DEFAULT 'none',
  thumbnail_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;

CREATE POLICY "Users can create their own posts" ON public.posts FOR INSERT WITH CHECK (
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update their own posts" ON public.posts FOR UPDATE USING (
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete their own posts" ON public.posts FOR DELETE USING (
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Posts viewable with shadowban filter" ON public.posts FOR SELECT USING (
  (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  OR (privacy_level = 'public' AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = posts.user_id AND is_shadowbanned = true))
  OR (privacy_level = 'vip' AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = posts.user_id AND is_shadowbanned = true)
      AND EXISTS (SELECT 1 FROM subscriptions WHERE subscriber_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) AND creator_id = posts.user_id AND status = 'active'))
);

-- ══════════════════════════════════════════════════════════════
-- PARTE 5: SUBSCRIPTIONS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  status text DEFAULT 'active',
  price numeric DEFAULT 0,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their subscriptions" ON public.subscriptions FOR SELECT USING (
  subscriber_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create subscriptions" ON public.subscriptions FOR INSERT WITH CHECK (
  subscriber_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update their subscriptions" ON public.subscriptions FOR UPDATE USING (
  subscriber_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- ══════════════════════════════════════════════════════════════
-- PARTE 6: TRANSACTIONS (Financeiro)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  seller_id uuid,
  affiliate_id uuid,
  amount numeric NOT NULL,
  type text NOT NULL,
  category text,
  status text DEFAULT 'pending',
  description text,
  external_id text,
  provider text,
  metadata jsonb DEFAULT '{}',
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create their own transactions" ON public.transactions FOR INSERT WITH CHECK (
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Creators can view their sales" ON public.transactions FOR SELECT USING (
  seller_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR user_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- ══════════════════════════════════════════════════════════════
-- PARTE 7: CONVERSATIONS + MESSAGES (Chat)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz DEFAULT now(),
  is_archived boolean DEFAULT false,
  has_unread_priority boolean DEFAULT false,
  total_priority_amount numeric DEFAULT 0,
  priority_responded boolean DEFAULT false
);
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender_id uuid NOT NULL,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  media_url text,
  media_type text,
  is_locked boolean DEFAULT false,
  unlock_price numeric,
  unlocked_by uuid[] DEFAULT '{}',
  story_reply_id uuid,
  broadcast_id uuid,
  is_priority boolean DEFAULT false,
  priority_amount numeric DEFAULT 0,
  priority_paid_at timestamptz,
  is_auto_reply boolean DEFAULT false,
  deleted_for_everyone boolean NOT NULL DEFAULT false,
  deleted_by uuid[] NOT NULL DEFAULT '{}',
  encrypted_content text,
  encryption_iv text,
  is_encrypted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "Users can send messages to their conversations" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "Senders can update their messages" ON public.messages FOR UPDATE USING (sender_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- PARTE 8: NOTIFICATIONS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb,
  is_read boolean DEFAULT false,
  actor_id uuid,
  post_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Authenticated users can create notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ══════════════════════════════════════════════════════════════
-- PARTE 9: ENGAGEMENT (Likes, Comments, Follows)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.post_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  is_seed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.post_dislikes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.post_dislikes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  parent_id uuid,
  mentioned_users uuid[] DEFAULT '{}',
  depth integer DEFAULT 0,
  likes_count integer DEFAULT 0,
  is_seed boolean DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  spam_reason text,
  spam_score smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.comment_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(comment_id, user_id)
);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.comment_edit_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  old_content text NOT NULL,
  edited_at timestamptz DEFAULT now()
);
ALTER TABLE public.comment_edit_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.follows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.blocked_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  blocked_user_id uuid NOT NULL,
  block_type text NOT NULL DEFAULT 'blocked',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.blocked_contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profile_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  liker_id uuid NOT NULL,
  liked_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(liker_id, liked_id)
);
ALTER TABLE public.profile_likes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profile_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id uuid NOT NULL,
  visited_id uuid NOT NULL,
  visited_at timestamptz DEFAULT now()
);
ALTER TABLE public.profile_visits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.saved_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 10: MONETIZAÇÃO (Marketplace, Splits, PIX, Wallet)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.marketplace_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  icon text DEFAULT 'Package',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.marketplace_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.marketplace_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  price numeric NOT NULL,
  original_price numeric,
  item_type text NOT NULL DEFAULT 'single',
  content_type text NOT NULL DEFAULT 'image',
  media_urls text[] DEFAULT '{}',
  preview_url text,
  thumbnail_url text,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  stock_limit integer,
  sold_count integer DEFAULT 0,
  tags text[] DEFAULT '{}',
  category_id uuid,
  release_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.marketplace_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES marketplace_items(id),
  price_paid numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'balance',
  transaction_id uuid,
  status text NOT NULL DEFAULT 'completed',
  downloaded boolean DEFAULT false,
  download_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.bundle_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bundle_id uuid NOT NULL REFERENCES marketplace_items(id),
  item_id uuid NOT NULL REFERENCES marketplace_items(id),
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.bundle_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.marketplace_featured (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES marketplace_items(id),
  position integer DEFAULT 0,
  featured_until timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.marketplace_featured ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.marketplace_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_splits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_external_id text NOT NULL,
  total_amount numeric NOT NULL,
  platform_fee numeric NOT NULL,
  creator_amount numeric NOT NULL,
  platform_fee_percent numeric NOT NULL,
  creator_id uuid,
  processed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.payment_splits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.transaction_split_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id text,
  payment_external_id text,
  flow_type text NOT NULL,
  gross_amount numeric(10,2) NOT NULL,
  tax_amount numeric(10,2) NOT NULL,
  tax_rate numeric(5,4) NOT NULL,
  base_amount numeric(10,2) NOT NULL,
  platform_amount numeric(10,2) NOT NULL,
  platform_rate numeric(5,4) NOT NULL,
  affiliate_amount numeric(10,2) DEFAULT 0,
  affiliate_rate numeric(5,4) DEFAULT 0,
  creator_amount numeric(10,2) DEFAULT 0,
  creator_id uuid,
  affiliate_id uuid,
  provider text DEFAULT 'platform',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.transaction_split_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pending_balance_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  source_type text NOT NULL,
  release_at timestamptz NOT NULL,
  status text DEFAULT 'pending',
  released_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.pending_balance_releases ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_balances (
  user_id uuid PRIMARY KEY,
  balance_amount decimal(12,2) DEFAULT 0.00,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own balance" ON public.user_balances FOR SELECT USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.transaction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text,
  user_id uuid,
  amount_bruto decimal(12,2),
  amount_imposto decimal(12,2),
  amount_taxa_casa decimal(12,2),
  amount_taxa_afiliado decimal(12,2),
  amount_liquido_criador decimal(12,2),
  transaction_type text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.transaction_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pix_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  transaction_id text,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  pix_key text,
  pix_qr_code text,
  pix_copy_paste text,
  expires_at timestamptz,
  paid_at timestamptz,
  processing_time_ms integer,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pix_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pix_gateway_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gateway_name text NOT NULL,
  api_key_encrypted text,
  webhook_url text,
  is_active boolean DEFAULT true,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.pix_gateway_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_payment_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  card_holder_name text NOT NULL,
  card_last_four text NOT NULL,
  card_brand text,
  card_expiry_month integer NOT NULL,
  card_expiry_year integer NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_payment_cards ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  amount numeric,
  provider text,
  status text,
  event_type text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  reminder_type text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  channel text DEFAULT 'push',
  metadata jsonb DEFAULT '{}'
);
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chargeback_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id uuid,
  user_id uuid,
  amount numeric,
  reason text,
  status text DEFAULT 'pending',
  provider text,
  external_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.chargeback_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  platform_fee numeric NOT NULL,
  net_amount numeric NOT NULL,
  pix_key_type text NOT NULL,
  pix_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  asaas_transfer_id text,
  asaas_transfer_status text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_requests FOR SELECT USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can create own withdrawals" ON public.withdrawal_requests FOR INSERT WITH CHECK (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.creator_pricing_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL UNIQUE,
  subscription_monthly numeric DEFAULT 29.90,
  subscription_annual numeric DEFAULT 299.90,
  subscription_lifetime numeric DEFAULT 999.90,
  subscription_enabled boolean DEFAULT true,
  price_per_photo numeric DEFAULT 9.90,
  price_per_video numeric DEFAULT 19.90,
  price_per_message numeric DEFAULT 4.90,
  super_dm_enabled boolean DEFAULT true,
  super_dm_min_price numeric DEFAULT 9.90,
  auction_starting_price numeric DEFAULT 19.90,
  auction_min_increment numeric DEFAULT 5.00,
  platform_fee_pct numeric DEFAULT 20.00,
  tax_reserve_pct numeric DEFAULT 6.00,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.creator_pricing_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.plan_content_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL,
  post_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_content_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.media_unlocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_unlocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.media_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  post_id uuid NOT NULL,
  granted_at timestamptz DEFAULT now(),
  UNIQUE(user_id, post_id)
);
ALTER TABLE public.media_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.media_vault (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL,
  media_url text NOT NULL,
  media_type text DEFAULT 'image',
  title text,
  tags text[] DEFAULT '{}',
  file_size_bytes bigint,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.media_vault ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.media_share_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL,
  shared_by uuid NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz,
  views_count integer DEFAULT 0,
  max_views integer,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.media_share_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.presale_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES marketplace_items(id),
  buyer_id uuid NOT NULL,
  price_locked numeric NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.presale_orders ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 11: LEILÕES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.auctions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  media_url text NOT NULL,
  media_type text DEFAULT 'image',
  starting_price numeric NOT NULL DEFAULT 10,
  min_increment numeric NOT NULL DEFAULT 5,
  current_bid numeric DEFAULT 0,
  current_bidder_id uuid,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz NOT NULL,
  original_end_at timestamptz NOT NULL,
  status text DEFAULT 'active',
  winner_id uuid,
  winner_charged boolean DEFAULT false,
  content_delivered boolean DEFAULT false,
  total_bids integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active auctions" ON public.auctions FOR SELECT USING (status = 'active' OR creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Creators can create auctions" ON public.auctions FOR INSERT WITH CHECK (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Creators can update own auctions" ON public.auctions FOR UPDATE USING (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.auction_bids (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auction_id uuid NOT NULL REFERENCES auctions(id),
  bidder_id uuid NOT NULL,
  amount numeric NOT NULL,
  is_winning boolean DEFAULT false,
  outbid_at timestamptz,
  notified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view bids" ON public.auction_bids FOR SELECT USING (true);
CREATE POLICY "Users can place bids" ON public.auction_bids FOR INSERT WITH CHECK (bidder_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.bidder_cards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  stripe_payment_method_id text NOT NULL,
  card_last_four text,
  card_brand text,
  is_valid boolean DEFAULT true,
  verified_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.bidder_cards ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 12: BROADCASTS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL,
  content text,
  media_url text,
  media_type text,
  is_ppv boolean DEFAULT false,
  ppv_price numeric DEFAULT 0,
  audience_type text NOT NULL,
  total_recipients integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  read_count integer DEFAULT 0,
  unlock_count integer DEFAULT 0,
  total_revenue numeric DEFAULT 0,
  status text DEFAULT 'pending',
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  scheduled_for timestamptz,
  is_scheduled boolean DEFAULT false
);
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.broadcast_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id),
  recipient_id uuid NOT NULL,
  message_id uuid,
  status text DEFAULT 'pending',
  error_message text,
  delivered_at timestamptz,
  read_at timestamptz,
  unlocked_at timestamptz,
  paid_amount numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.broadcast_deliveries ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 13: ÁLBUNS, STORIES, POLLS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.time_locked_albums (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  unlock_type text DEFAULT 'scheduled',
  unlock_at timestamptz,
  expires_at timestamptz,
  unlock_duration_hours integer,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.time_locked_albums ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.album_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id uuid NOT NULL REFERENCES time_locked_albums(id),
  media_url text NOT NULL,
  media_type text DEFAULT 'image',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.album_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.album_access_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id uuid NOT NULL REFERENCES time_locked_albums(id),
  viewer_id uuid NOT NULL,
  accessed_at timestamptz DEFAULT now()
);
ALTER TABLE public.album_access_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  media_url text NOT NULL,
  media_type text DEFAULT 'image',
  caption text,
  poll_question text,
  poll_options jsonb,
  poll_votes jsonb DEFAULT '{}',
  views_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.story_views (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id uuid NOT NULL REFERENCES stories(id),
  viewer_id uuid NOT NULL,
  viewed_at timestamptz DEFAULT now()
);
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.polls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid,
  creator_id uuid NOT NULL,
  question text NOT NULL,
  entry_cost numeric DEFAULT 0,
  allow_multiple_votes boolean DEFAULT false,
  show_results_before_vote boolean DEFAULT false,
  closes_at timestamptz,
  total_votes integer DEFAULT 0,
  total_revenue numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.poll_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id uuid NOT NULL REFERENCES polls(id),
  option_text text NOT NULL,
  votes_count integer DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id uuid NOT NULL,
  option_id uuid NOT NULL,
  voter_id uuid NOT NULL,
  amount_paid numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 14: GAMIFICAÇÃO
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.badges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'Award',
  color text DEFAULT 'primary',
  category text DEFAULT 'general',
  points integer DEFAULT 10,
  is_automatic boolean DEFAULT true,
  criteria jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges are viewable by everyone" ON public.badges FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES badges(id),
  earned_at timestamptz DEFAULT now(),
  metadata jsonb,
  UNIQUE(user_id, badge_id)
);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text DEFAULT 'trophy',
  color text DEFAULT '#FFD700',
  category text DEFAULT 'general',
  xp_reward integer DEFAULT 50,
  is_secret boolean DEFAULT false,
  is_active boolean DEFAULT true,
  criteria jsonb,
  rarity text DEFAULT 'common',
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL REFERENCES achievements(id),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  progress integer DEFAULT 100,
  notified boolean DEFAULT false,
  UNIQUE(user_id, achievement_id)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.level_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level_number integer NOT NULL UNIQUE,
  name text NOT NULL,
  xp_required integer NOT NULL,
  icon text DEFAULT 'star',
  color text DEFAULT '#FFD700',
  perks jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.level_definitions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  action_type text NOT NULL,
  description text,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.daily_spins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  spin_date date NOT NULL DEFAULT CURRENT_DATE,
  prize_id uuid,
  prize_type text NOT NULL,
  prize_value numeric DEFAULT 0,
  prize_code text,
  streak_days integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, spin_date)
);
ALTER TABLE public.daily_spins ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  period_type text NOT NULL,
  period_start date NOT NULL,
  category text NOT NULL DEFAULT 'general',
  score numeric NOT NULL DEFAULT 0,
  rank_position integer,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 15: SOCIAL FEATURES (Gifts, Goals, Pings, Perfect Pairs)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.gift_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  amount numeric NOT NULL,
  credits_used numeric NOT NULL,
  message_id uuid,
  conversation_id uuid,
  thank_you_type text,
  thank_you_sent_at timestamptz,
  is_visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.gift_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.gift_thank_you (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gift_id uuid NOT NULL REFERENCES gift_history(id),
  creator_id uuid NOT NULL,
  thank_you_type text NOT NULL DEFAULT 'text',
  content text,
  media_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.gift_thank_you ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.creator_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  target_amount numeric NOT NULL DEFAULT 1000,
  current_amount numeric NOT NULL DEFAULT 0,
  contributors_count integer DEFAULT 0,
  media_url text,
  media_type text DEFAULT 'image',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_goals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.goal_contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id uuid NOT NULL REFERENCES creator_goals(id),
  contributor_id uuid NOT NULL,
  amount numeric NOT NULL,
  message text,
  is_anonymous boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'wink',
  message text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.pings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.perfect_pairs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id uuid NOT NULL,
  user2_id uuid NOT NULL,
  compatibility_score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  matched_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.perfect_pairs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.perfect_pair_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pair_id uuid NOT NULL REFERENCES perfect_pairs(id),
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.perfect_pair_actions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.looking_now_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id uuid NOT NULL,
  user2_id uuid NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.looking_now_matches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.lucky_matches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id uuid NOT NULL,
  user2_id uuid NOT NULL,
  matched_at timestamptz DEFAULT now(),
  ice_breaker text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.lucky_matches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ice_breaker_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  text_content text NOT NULL,
  category text DEFAULT 'general',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ice_breaker_suggestions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pair_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  show_pair_photos boolean DEFAULT true,
  relationship_type text DEFAULT 'couple',
  custom_label text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.pair_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.custom_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tag_name text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'social',
  usage_count integer DEFAULT 0,
  is_approved boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.custom_tags ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 16: ADMIN & ANALYTICS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb,
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_impersonation_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_user_name text,
  target_user_plan text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE public.admin_impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.impersonation_access_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL,
  admin_user_id uuid NOT NULL,
  action_type text NOT NULL,
  resource_type text,
  resource_id text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.impersonation_access_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid NOT NULL,
  action_type text NOT NULL,
  target_resource text,
  target_id text,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name text NOT NULL,
  metric_type text NOT NULL,
  metric_value numeric DEFAULT 0,
  snapshot_date date NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  metric_type text NOT NULL,
  condition_type text NOT NULL,
  threshold_value numeric NOT NULL,
  comparison_period text,
  notification_channels text[],
  is_active boolean DEFAULT true,
  last_triggered_at timestamptz,
  description text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.analytics_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics_alert_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id uuid REFERENCES analytics_alerts(id),
  triggered_value numeric NOT NULL,
  threshold_value numeric NOT NULL,
  message text,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.analytics_alert_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  metric_type text NOT NULL,
  target_value numeric NOT NULL,
  current_value numeric DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  period_type text DEFAULT 'monthly',
  status text DEFAULT 'active',
  description text,
  achieved_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.analytics_goals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_date date NOT NULL,
  metric_type text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.custom_dashboards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  layout jsonb NOT NULL DEFAULT '[]',
  is_default boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.custom_dashboards ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cohort_data (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_date date NOT NULL,
  cohort_type text NOT NULL DEFAULT 'monthly',
  period_index integer NOT NULL,
  total_users integer NOT NULL DEFAULT 0,
  active_users integer NOT NULL DEFAULT 0,
  retention_rate numeric DEFAULT 0,
  revenue numeric DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.cohort_data ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.growth_predictions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_type text NOT NULL,
  prediction_date date NOT NULL,
  predicted_value numeric NOT NULL,
  confidence_lower numeric,
  confidence_upper numeric,
  model_type text DEFAULT 'linear',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.growth_predictions ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 17: CAMPANHAS, ADS, PROMOÇÕES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  image_url text NOT NULL,
  target_url text,
  cta_text text,
  placement text NOT NULL DEFAULT 'feed',
  priority integer DEFAULT 0,
  is_active boolean DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  impressions_count integer DEFAULT 0,
  clicks_count integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ad_interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_id uuid NOT NULL REFERENCES ad_campaigns(id),
  user_id uuid,
  interaction_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ad_interactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'banner',
  reward_type text DEFAULT 'discount',
  reward_value numeric DEFAULT 0,
  target_audience text DEFAULT 'all',
  is_active boolean DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  max_claims integer,
  current_claims integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.promotion_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  promotion_id uuid NOT NULL REFERENCES promotions(id),
  user_id uuid,
  event_type text NOT NULL,
  time_period text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.promotion_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.promotion_whatsapp_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  promotion_id uuid REFERENCES promotions(id),
  phone_number text NOT NULL,
  message_content text,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.promotion_whatsapp_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'email',
  status text DEFAULT 'draft',
  target_segment jsonb DEFAULT '{}',
  content jsonb DEFAULT '{}',
  scheduled_at timestamptz,
  sent_at timestamptz,
  total_recipients integer DEFAULT 0,
  opens_count integer DEFAULT 0,
  clicks_count integer DEFAULT 0,
  conversions_count integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.campaign_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  channel text NOT NULL,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  converted_at timestamptz,
  error_message text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.campaign_executions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL,
  campaign_name text NOT NULL,
  code text NOT NULL UNIQUE,
  discount integer NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  max_uses integer,
  current_uses integer DEFAULT 0,
  is_active boolean DEFAULT true,
  platform_source text DEFAULT 'other',
  clicks_count integer DEFAULT 0,
  conversions_count integer DEFAULT 0,
  total_revenue_generated numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 18: EVENTOS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  location text NOT NULL,
  event_date date NOT NULL,
  event_time time NOT NULL,
  image_url text,
  max_attendees integer,
  price text,
  tags text[],
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id),
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  mute_notifications boolean DEFAULT false,
  UNIQUE(event_id, user_id)
);
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id),
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id),
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.event_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id),
  user_id uuid NOT NULL,
  photo_url text NOT NULL,
  caption text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id),
  user_id uuid NOT NULL,
  rating integer NOT NULL,
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);
ALTER TABLE public.event_ratings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.event_checkins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id),
  user_id uuid NOT NULL,
  checked_in_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);
ALTER TABLE public.event_checkins ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 19: REFERRALS & EARLY BIRD
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  is_active boolean DEFAULT true,
  started_at timestamptz DEFAULT now(),
  commission_ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.referral_affiliates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  referral_code text NOT NULL UNIQUE,
  total_referrals integer DEFAULT 0,
  total_earnings numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.referral_affiliates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL,
  referral_code text,
  converted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.referral_tree (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id uuid NOT NULL,
  child_id uuid NOT NULL UNIQUE,
  level integer DEFAULT 1,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.referral_tree ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.share_click_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id uuid NOT NULL,
  platform text,
  converted boolean DEFAULT false,
  conversion_type text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.share_click_tracking ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.creator_referrals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  madrinha_id uuid NOT NULL,
  afilhada_id uuid NOT NULL,
  referral_code text NOT NULL,
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  total_commission_earned numeric DEFAULT 0,
  last_commission_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.creator_referrals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.creator_referral_commissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_id uuid NOT NULL REFERENCES creator_referrals(id),
  transaction_id uuid,
  gross_amount numeric NOT NULL,
  platform_fee_original numeric NOT NULL,
  commission_amount numeric NOT NULL,
  platform_fee_net numeric NOT NULL,
  creator_amount numeric NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.creator_referral_commissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.early_bird_counters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  counter_type text NOT NULL UNIQUE,
  current_count integer NOT NULL DEFAULT 0,
  max_count integer NOT NULL DEFAULT 1000,
  bonus_months integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.early_bird_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.early_bird_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  counter_type text NOT NULL,
  bonus_months integer NOT NULL,
  subscription_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.early_bird_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.early_bird_claim_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  counter_id uuid,
  counter_type text NOT NULL,
  user_id uuid NOT NULL,
  claimed_at timestamptz DEFAULT now(),
  position integer NOT NULL,
  bonus_months integer NOT NULL
);
ALTER TABLE public.early_bird_claim_history ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 20: CREATOR FOUNDERS
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.creator_founder_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  social_links jsonb NOT NULL DEFAULT '{}',
  career_description text NOT NULL,
  photo_url text,
  video_url text,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  applicant_name text,
  applicant_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_founder_applications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.creator_founders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  application_id uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  free_period_ends timestamptz NOT NULL DEFAULT (now() + interval '365 days'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.creator_founders ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 21: MISC TABLES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  source text DEFAULT 'signup',
  referral_code text,
  priority_score integer DEFAULT 0,
  status text DEFAULT 'waiting',
  invited_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.wishlist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  item_id uuid NOT NULL,
  notify_on_sale boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.couple_verification_docs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL,
  partner_number integer NOT NULL,
  document_type text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  needs_admin_review boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.couple_verification_docs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid,
  story_id uuid,
  reported_user_id uuid,
  reporter_id uuid NOT NULL,
  category text NOT NULL,
  priority_level text NOT NULL DEFAULT 'normal',
  description text,
  evidence_urls text[],
  status text NOT NULL DEFAULT 'pending',
  sla_deadline timestamptz,
  content_hidden boolean DEFAULT false,
  hidden_at timestamptz,
  hidden_by uuid,
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.anonymous_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_hash text,
  reporter_session_id text,
  target_type text NOT NULL,
  target_id uuid,
  target_user_id uuid,
  category text NOT NULL,
  severity text DEFAULT 'medium',
  description text,
  evidence_urls text[],
  status text DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  resolution_notes text,
  action_taken text,
  is_urgent boolean DEFAULT false,
  auto_flagged boolean DEFAULT false,
  priority_score integer DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.anonymous_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,
  event_type text NOT NULL,
  event_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.webhook_event_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text DEFAULT 'general',
  payload_schema jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.webhook_event_types ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  device_name text,
  browser text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text DEFAULT 'web',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name varchar NOT NULL,
  title varchar NOT NULL,
  body text NOT NULL,
  url varchar,
  icon varchar,
  category varchar,
  variables jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  usage_count integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.push_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  icon text,
  target_audience text DEFAULT 'all',
  target_filter jsonb DEFAULT '{}',
  status text DEFAULT 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  total_sent integer DEFAULT 0,
  total_opened integer DEFAULT 0,
  total_clicked integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.push_campaigns ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_campaign_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES push_campaigns(id),
  user_id uuid NOT NULL,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.push_campaign_deliveries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_automations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  trigger_event text NOT NULL,
  template_id uuid REFERENCES push_templates(id),
  delay_minutes integer DEFAULT 0,
  is_active boolean DEFAULT true,
  conditions jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.push_automations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  push_enabled boolean DEFAULT true,
  email_enabled boolean DEFAULT true,
  push_likes boolean DEFAULT true,
  push_comments boolean DEFAULT true,
  push_follows boolean DEFAULT true,
  push_messages boolean DEFAULT true,
  push_payments boolean DEFAULT true,
  push_system boolean DEFAULT true,
  email_marketing boolean DEFAULT false,
  quiet_hours_start text,
  quiet_hours_end text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notification_dispatch_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  channel text NOT NULL DEFAULT 'push',
  status text DEFAULT 'sent',
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notification_dispatch_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.engagement_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  event_type text NOT NULL,
  hour_of_day integer,
  day_of_week integer,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.conversion_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  plan_type text,
  user_id uuid,
  session_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.public_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid,
  target_creator_id uuid,
  activity_type text NOT NULL,
  actor_name text NOT NULL,
  actor_avatar_url text,
  target_creator_name text NOT NULL,
  amount numeric,
  is_anonymous boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  is_seed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.public_activities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.priority_message_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  message_id uuid,
  amount numeric NOT NULL,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.priority_message_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.message_translations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL,
  language text NOT NULL,
  translated_content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.message_translations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.message_unsend_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  original_content text,
  unsent_at timestamptz DEFAULT now()
);
ALTER TABLE public.message_unsend_logs ENABLE ROW LEVEL SECURITY;

-- Backup, Email, Invoice, Hero, Checkout, Feedback, Cookie, Discipline tables
-- (All included in SCHEMA_EXTENDED sections above)

CREATE TABLE IF NOT EXISTS public.backup_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  frequency text NOT NULL,
  time_of_day text DEFAULT '03:00',
  day_of_week integer,
  day_of_month integer,
  include_media boolean DEFAULT false,
  include_messages boolean DEFAULT true,
  retention_days integer DEFAULT 30,
  is_active boolean DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.backup_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_type text NOT NULL,
  schedule_id uuid REFERENCES backup_schedules(id),
  status text DEFAULT 'pending',
  storage_path text,
  file_size_bytes bigint,
  tables_included jsonb,
  media_included boolean DEFAULT false,
  media_count integer,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.backup_restorations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_id uuid NOT NULL REFERENCES backup_history(id),
  status text DEFAULT 'pending',
  tables_restored jsonb,
  records_restored integer,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.backup_restorations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.backup_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  subject text NOT NULL,
  html_content text NOT NULL,
  variables jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  category text DEFAULT 'payment',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key text NOT NULL,
  recipient_email text NOT NULL,
  recipient_user_id uuid,
  subject text,
  status text DEFAULT 'sent',
  resend_message_id text,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  bounce_reason text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.generated_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id uuid,
  invoice_number text NOT NULL UNIQUE,
  generated_by uuid,
  html_content text,
  pdf_url text,
  status text DEFAULT 'generated',
  sent_at timestamptz,
  sent_to_email text,
  download_count integer DEFAULT 0,
  last_downloaded_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.generated_invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invoice_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  template_key text NOT NULL UNIQUE,
  html_content text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invoice_send_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES generated_invoices(id),
  sent_to text NOT NULL,
  channel text DEFAULT 'email',
  status text DEFAULT 'sent',
  error_message text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.invoice_send_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.hero_advanced_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  background_type text DEFAULT 'gradient',
  background_image_url text,
  background_video_url text,
  audio_enabled boolean DEFAULT false,
  audio_track_day text,
  audio_track_night text,
  audio_default_volume numeric DEFAULT 0.30,
  audio_visualizer_enabled boolean DEFAULT true,
  day_start_hour integer DEFAULT 6,
  night_start_hour integer DEFAULT 18,
  texts_day jsonb DEFAULT '{}',
  texts_night jsonb DEFAULT '{}',
  parallax_moon_speed numeric DEFAULT 0.15,
  parallax_stars_speed numeric DEFAULT 0.08,
  parallax_city_speed numeric DEFAULT 0.05,
  stars_count integer DEFAULT 80,
  enable_floating_particles boolean DEFAULT true,
  moon_glow_intensity numeric DEFAULT 0.80,
  moon_size integer DEFAULT 550,
  moon_position_x integer DEFAULT 50,
  moon_position_y integer DEFAULT 15,
  rotating_words jsonb DEFAULT '["Ocultas", "Proibidas", "Secretas", "Íntimas"]',
  typewriter_speed_ms integer DEFAULT 100,
  typewriter_pause_ms integer DEFAULT 2000,
  enable_geo_replacement boolean DEFAULT true,
  geo_fallback_city text DEFAULT 'sua cidade',
  ab_test_enabled boolean DEFAULT false,
  ab_test_variant_b jsonb DEFAULT '{}',
  trust_indicators jsonb DEFAULT '{}',
  show_scroll_indicator boolean DEFAULT true,
  scroll_indicator_delay_ms integer DEFAULT 5000,
  show_signups_today boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.hero_advanced_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.landing_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.landing_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.site_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key text NOT NULL UNIQUE,
  section_name text NOT NULL,
  section_type text NOT NULL DEFAULT 'content',
  content jsonb NOT NULL DEFAULT '{}',
  is_visible boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.site_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view visible sections" ON public.site_sections FOR SELECT USING (is_visible = true);
CREATE POLICY "Admins can manage sections" ON public.site_sections FOR ALL USING (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.cart_abandonment (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  plan_type text NOT NULL,
  amount numeric NOT NULL,
  coupon_code text,
  ghost_mode boolean DEFAULT false,
  creator_id uuid,
  phone_number text NOT NULL,
  user_name text,
  user_email text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  scheduled_send_at timestamptz,
  sent_at timestamptz,
  recovered_at timestamptz,
  clicked_at timestamptz,
  magic_link_token uuid DEFAULT gen_random_uuid(),
  magic_link_expires_at timestamptz,
  attempts_count integer DEFAULT 0,
  last_error text,
  whatsapp_message_id text
);
ALTER TABLE public.cart_abandonment ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.churn_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  checkout_started_at timestamptz NOT NULL DEFAULT now(),
  abandoned_at timestamptz,
  recovery_sent_at timestamptz,
  recovered_at timestamptz,
  product_type text NOT NULL,
  product_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  recovery_channel text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.churn_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.checkout_health_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  check_type text NOT NULL,
  status text NOT NULL,
  response_time_ms integer,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.checkout_health_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.checkout_incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  severity text DEFAULT 'medium',
  status text DEFAULT 'open',
  affected_users integer DEFAULT 0,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.checkout_incidents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.feature_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  title text NOT NULL,
  description text NOT NULL,
  category text DEFAULT 'general',
  status text NOT NULL DEFAULT 'pending',
  priority text DEFAULT 'medium',
  votes_count integer NOT NULL DEFAULT 0,
  admin_response text,
  responded_by uuid,
  responded_at timestamptz,
  estimated_release text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.feature_request_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES feature_requests(id),
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(request_id, user_id)
);
ALTER TABLE public.feature_request_votes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.feedback_forms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  form_type text NOT NULL DEFAULT 'general',
  fields jsonb NOT NULL DEFAULT '[]',
  thank_you_message text DEFAULT 'Obrigado pelo seu feedback!',
  is_active boolean NOT NULL DEFAULT true,
  responses_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_forms ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.feedback_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id uuid NOT NULL REFERENCES feedback_forms(id),
  user_id uuid,
  responses jsonb NOT NULL DEFAULT '{}',
  rating integer,
  sentiment text,
  status text NOT NULL DEFAULT 'new',
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.nps_surveys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  target_audience text DEFAULT 'all',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.nps_surveys ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.nps_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id uuid REFERENCES nps_surveys(id),
  user_id uuid,
  score integer NOT NULL,
  feedback text,
  category text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cookie_consents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  session_id text,
  essential boolean NOT NULL DEFAULT true,
  analytics boolean NOT NULL DEFAULT false,
  personalization boolean NOT NULL DEFAULT false,
  marketing boolean NOT NULL DEFAULT false,
  consented_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.discipline_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid,
  user_id uuid,
  action_type text,
  action text,
  admin_id uuid,
  reason text,
  details jsonb,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.discipline_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.plan_change_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL,
  old_plan text,
  new_plan text,
  changed_by text DEFAULT 'system',
  reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.plan_change_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.reengagement_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  trigger_type text NOT NULL,
  conditions jsonb DEFAULT '{}',
  action_type text NOT NULL,
  action_config jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  executions_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.reengagement_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  description text,
  permissions text[],
  rate_limit integer DEFAULT 100,
  is_active boolean DEFAULT true,
  usage_count integer DEFAULT 0,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id uuid REFERENCES api_keys(id),
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer,
  response_time_ms integer,
  request_body jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ab_test_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  traffic_percentage integer DEFAULT 50,
  metric_key text,
  variants jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ab_test_configs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ab_experiments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  hypothesis text,
  metric_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  traffic_percentage integer NOT NULL DEFAULT 100,
  target_sample_size integer,
  start_date timestamptz,
  end_date timestamptz,
  winner_variant_id uuid,
  statistical_significance numeric,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ab_experiments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ab_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES ab_experiments(id),
  name text NOT NULL,
  description text,
  is_control boolean NOT NULL DEFAULT false,
  config jsonb DEFAULT '{}',
  weight integer NOT NULL DEFAULT 50,
  impressions integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  conversion_rate numeric,
  revenue numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ab_variants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ab_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES ab_experiments(id),
  variant_id uuid NOT NULL REFERENCES ab_variants(id),
  user_id uuid,
  session_id text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz,
  conversion_value numeric,
  metadata jsonb DEFAULT '{}'
);
ALTER TABLE public.ab_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ab_conversions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES ab_experiments(id),
  variant_id uuid NOT NULL REFERENCES ab_variants(id),
  assignment_id uuid NOT NULL REFERENCES ab_assignments(id),
  conversion_type text NOT NULL,
  value numeric,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ab_conversions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.qa_checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_name text NOT NULL,
  test_description text NOT NULL,
  status text DEFAULT 'pending',
  tested_by uuid,
  tested_at timestamptz,
  notes text,
  priority text DEFAULT 'medium',
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.qa_checklists ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- PARTE 22: FUNÇÕES CRÍTICAS (RPC)
-- ══════════════════════════════════════════════════════════════

-- Handle New User (Trigger on auth.users)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_username TEXT;
  v_base_username TEXT;
  v_counter INTEGER := 0;
BEGIN
  v_base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
  );
  IF length(v_base_username) < 3 THEN
    v_base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;
  v_username := v_base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_counter := v_counter + 1;
    v_username := v_base_username || '_' || v_counter;
    IF v_counter > 100 THEN
      v_username := v_base_username || '_' || substr(extensions.gen_random_uuid()::text, 1, 6);
      EXIT;
    END IF;
  END LOOP;
  INSERT INTO public.profiles (user_id, name, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    v_username,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user failed for %: % %', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- Get Or Create Conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(p_user1_id uuid, p_user2_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  IF p_user1_id IS NULL OR p_user2_id IS NULL THEN RAISE EXCEPTION 'Both user IDs are required'; END IF;
  IF p_user1_id = p_user2_id THEN RAISE EXCEPTION 'Cannot create conversation with yourself'; END IF;
  SELECT cp1.conversation_id INTO v_conversation_id
  FROM conversation_participants cp1
  INNER JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = p_user1_id AND cp2.user_id = p_user2_id LIMIT 1;
  IF v_conversation_id IS NOT NULL THEN RETURN v_conversation_id; END IF;
  INSERT INTO conversations DEFAULT VALUES RETURNING id INTO v_conversation_id;
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES (v_conversation_id, p_user1_id), (v_conversation_id, p_user2_id);
  RETURN v_conversation_id;
END;
$$;

-- Balance Functions
CREATE OR REPLACE FUNCTION public.add_to_balance(p_user_id uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN UPDATE profiles SET balance = COALESCE(balance, 0) + p_amount WHERE id = p_user_id; END; $$;

CREATE OR REPLACE FUNCTION public.add_to_pending_balance(p_user_id uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN UPDATE profiles SET pending_balance = COALESCE(pending_balance, 0) + p_amount WHERE id = p_user_id; END; $$;

CREATE OR REPLACE FUNCTION public.debit_balance(p_user_id uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN UPDATE profiles SET balance = COALESCE(balance, 0) - p_amount WHERE id = p_user_id; END; $$;

-- Record Profile Visit (Hardened)
CREATE OR REPLACE FUNCTION public.record_profile_visit(p_visitor_id uuid, p_visited_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE visitor_user_id UUID;
BEGIN
  IF p_visitor_id = p_visited_id THEN RETURN; END IF;
  SELECT user_id INTO visitor_user_id FROM profiles WHERE id = p_visitor_id;
  IF visitor_user_id IS NULL OR visitor_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Can only record visits as yourself';
  END IF;
  IF EXISTS (SELECT 1 FROM profile_visits WHERE visitor_id = p_visitor_id AND visited_id = p_visited_id AND visited_at > now() - interval '1 hour') THEN RETURN; END IF;
  INSERT INTO profile_visits (visitor_id, visited_id) VALUES (p_visitor_id, p_visited_id);
END;
$$;

-- Payment Split Engine (Oculto)
CREATE OR REPLACE FUNCTION public.process_oculto_payment_split(
  p_payment_id text, p_amount_bruto numeric, p_type text,
  p_creator_id uuid DEFAULT NULL, p_affiliate_id uuid DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_imposto DECIMAL(12,2);
  v_base DECIMAL(12,2);
  v_taxa_casa DECIMAL(12,2);
  v_taxa_afiliado DECIMAL(12,2);
  v_liquido_criador DECIMAL(12,2);
  v_result JSON;
BEGIN
  v_imposto := ROUND(p_amount_bruto * 0.06, 2);
  v_base := p_amount_bruto - v_imposto;

  IF p_type = 'platform_plan' THEN
    IF p_affiliate_id IS NOT NULL THEN
      v_taxa_afiliado := ROUND(v_base * 0.05, 2);
      v_taxa_casa := v_base - v_taxa_afiliado;
    ELSE
      v_taxa_afiliado := 0.00;
      v_taxa_casa := v_base;
    END IF;
    v_liquido_criador := 0.00;

  ELSIF p_type = 'creator_content' THEN
    v_taxa_casa := ROUND(v_base * 0.20, 2);
    IF p_affiliate_id IS NOT NULL THEN
      v_taxa_afiliado := ROUND(v_base * 0.05, 2);
    ELSE
      v_taxa_afiliado := 0.00;
    END IF;
    v_liquido_criador := v_base - v_taxa_casa - v_taxa_afiliado;

    IF p_creator_id IS NOT NULL AND v_liquido_criador > 0 THEN
      INSERT INTO public.user_balances (user_id, balance_amount, updated_at)
      VALUES (p_creator_id, v_liquido_criador, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET balance_amount = user_balances.balance_amount + v_liquido_criador, updated_at = NOW();
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de transação inválido: %', p_type;
  END IF;

  IF p_affiliate_id IS NOT NULL AND v_taxa_afiliado > 0 THEN
    INSERT INTO public.user_balances (user_id, balance_amount, updated_at)
    VALUES (p_affiliate_id, v_taxa_afiliado, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET balance_amount = user_balances.balance_amount + v_taxa_afiliado, updated_at = NOW();
  END IF;

  INSERT INTO public.transaction_logs (
    payment_id, user_id, amount_bruto, amount_imposto,
    amount_taxa_casa, amount_taxa_afiliado, amount_liquido_criador, transaction_type
  ) VALUES (
    p_payment_id, COALESCE(p_creator_id, p_affiliate_id),
    p_amount_bruto, v_imposto, v_taxa_casa, v_taxa_afiliado, v_liquido_criador, p_type
  );

  v_result := json_build_object(
    'success', true, 'payment_id', p_payment_id,
    'bruto', p_amount_bruto, 'imposto_6pct', v_imposto,
    'base_liquida', v_base, 'taxa_casa', v_taxa_casa,
    'taxa_afiliado', v_taxa_afiliado, 'liquido_criador', v_liquido_criador, 'type', p_type
  );
  RETURN v_result;
END;
$$;

-- Dual Split Engine (process_payment_split)
CREATE OR REPLACE FUNCTION public.process_payment_split(
  p_transaction_id text, p_payment_external_id text, p_flow_type text,
  p_gross_amount numeric, p_creator_id uuid DEFAULT NULL,
  p_affiliate_id uuid DEFAULT NULL, p_provider text DEFAULT 'platform'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tax_rate DECIMAL(5,4) := 0.06;
  v_tax DECIMAL(10,2);
  v_base DECIMAL(10,2);
  v_platform_rate DECIMAL(5,4);
  v_platform DECIMAL(10,2);
  v_affiliate_rate DECIMAL(5,4) := 0.05;
  v_affiliate DECIMAL(10,2) := 0;
  v_creator DECIMAL(10,2) := 0;
  v_result JSONB;
BEGIN
  v_tax := ROUND(p_gross_amount * v_tax_rate, 2);
  v_base := ROUND(p_gross_amount - v_tax, 2);

  IF p_flow_type = 'platform_plan' THEN
    IF p_affiliate_id IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
      v_platform := ROUND(v_base - v_affiliate, 2);
      v_platform_rate := 0.95;
    ELSE
      v_platform := v_base;
      v_platform_rate := 1.00;
    END IF;
    v_creator := 0;

  ELSIF p_flow_type = 'creator_content' THEN
    v_platform_rate := 0.20;
    v_platform := ROUND(v_base * v_platform_rate, 2);
    IF p_affiliate_id IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
    END IF;
    v_creator := ROUND(v_base - v_platform - v_affiliate, 2);
  ELSE
    v_platform := 0; v_creator := 0; v_affiliate := 0; v_platform_rate := 0;
  END IF;

  IF v_creator > 0 AND p_creator_id IS NOT NULL THEN
    UPDATE profiles SET pending_balance = COALESCE(pending_balance, 0) + v_creator WHERE id = p_creator_id;
    INSERT INTO pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_creator_id, v_creator, 'creator_content_income', now() + INTERVAL '7 days', 'pending');
  END IF;

  IF v_affiliate > 0 AND p_affiliate_id IS NOT NULL THEN
    UPDATE profiles SET pending_balance = COALESCE(pending_balance, 0) + v_affiliate WHERE id = p_affiliate_id;
    INSERT INTO pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_affiliate_id, v_affiliate, 'affiliate_commission', now() + INTERVAL '7 days', 'pending');
  END IF;

  INSERT INTO transaction_split_logs (
    transaction_id, payment_external_id, flow_type,
    gross_amount, tax_amount, tax_rate, base_amount,
    platform_amount, platform_rate,
    affiliate_amount, affiliate_rate,
    creator_amount, creator_id, affiliate_id, provider
  ) VALUES (
    p_transaction_id, p_payment_external_id, p_flow_type,
    p_gross_amount, v_tax, v_tax_rate, v_base,
    v_platform, v_platform_rate,
    v_affiliate, v_affiliate_rate,
    v_creator, p_creator_id, p_affiliate_id, p_provider
  );

  v_result := jsonb_build_object(
    'gross', p_gross_amount, 'tax', v_tax, 'base', v_base,
    'platform', v_platform, 'affiliate', v_affiliate,
    'creator', v_creator, 'flow_type', p_flow_type
  );
  RETURN v_result;
END;
$$;

-- Marketplace Purchase
CREATE OR REPLACE FUNCTION public.purchase_marketplace_item(p_item_id uuid, p_payment_method text DEFAULT 'balance')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_buyer_id UUID; v_item RECORD; v_purchase_id UUID;
  v_transaction_id UUID; v_creator_amount DECIMAL; v_platform_fee DECIMAL; v_fee_percent DECIMAL;
BEGIN
  SELECT id INTO v_buyer_id FROM profiles WHERE user_id = auth.uid();
  IF v_buyer_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Perfil não encontrado'); END IF;
  SELECT * INTO v_item FROM marketplace_items WHERE id = p_item_id AND is_active = true;
  IF v_item IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Item não encontrado'); END IF;
  IF EXISTS (SELECT 1 FROM marketplace_purchases WHERE buyer_id = v_buyer_id AND item_id = p_item_id AND status = 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já comprado');
  END IF;
  IF v_item.stock_limit IS NOT NULL AND v_item.sold_count >= v_item.stock_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esgotado');
  END IF;
  SELECT COALESCE((SELECT value::decimal FROM system_settings WHERE key = 'platform_fee_percentage'), 20) INTO v_fee_percent;
  v_platform_fee := v_item.price * (v_fee_percent / 100);
  v_creator_amount := v_item.price - v_platform_fee;
  IF p_payment_method = 'balance' THEN
    IF (SELECT balance FROM profiles WHERE id = v_buyer_id) < v_item.price THEN
      RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente');
    END IF;
    UPDATE profiles SET balance = balance - v_item.price WHERE id = v_buyer_id;
  END IF;
  INSERT INTO transactions (user_id, amount, type, status, description, provider)
  VALUES (v_buyer_id, -v_item.price, 'marketplace_purchase', 'completed', 'Compra: ' || v_item.title, 'platform')
  RETURNING id INTO v_transaction_id;
  INSERT INTO marketplace_purchases (buyer_id, item_id, price_paid, payment_method, transaction_id, status)
  VALUES (v_buyer_id, p_item_id, v_item.price, p_payment_method, v_transaction_id,
    CASE WHEN p_payment_method = 'balance' THEN 'completed' ELSE 'pending' END)
  RETURNING id INTO v_purchase_id;
  IF p_payment_method = 'balance' THEN
    UPDATE profiles SET balance = balance + v_creator_amount WHERE id = v_item.creator_id;
    INSERT INTO transactions (user_id, amount, type, status, description, provider)
    VALUES (v_item.creator_id, v_creator_amount, 'marketplace_sale', 'completed', 'Venda: ' || v_item.title, 'platform');
    INSERT INTO payment_splits (transaction_external_id, total_amount, platform_fee, creator_amount, platform_fee_percent, creator_id)
    VALUES ('mkt_' || v_purchase_id::text, v_item.price, v_platform_fee, v_creator_amount, v_fee_percent, v_item.creator_id);
    UPDATE marketplace_items SET sold_count = sold_count + 1 WHERE id = p_item_id;
  END IF;
  DELETE FROM wishlist WHERE user_id = v_buyer_id AND item_id = p_item_id;
  RETURN jsonb_build_object('success', true, 'purchase_id', v_purchase_id);
END;
$$;

-- Admin Update User Plan
CREATE OR REPLACE FUNCTION public.admin_update_user_plan(p_profile_id uuid, p_plan_type text, p_payment_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  UPDATE profiles SET plan_type = p_plan_type, payment_status = p_payment_status, updated_at = now() WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
  RETURN true;
END;
$$;

-- Delete User Account
CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE profile_id uuid;
BEGIN
  SELECT id INTO profile_id FROM profiles WHERE user_id = target_user_id;
  IF profile_id IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  DELETE FROM posts WHERE user_id = profile_id;
  DELETE FROM blocked_contacts WHERE user_id = profile_id OR blocked_user_id = profile_id;
  DELETE FROM follows WHERE follower_id = profile_id OR following_id = profile_id;
  DELETE FROM notifications WHERE user_id = target_user_id;
  DELETE FROM transactions WHERE user_id = profile_id;
  DELETE FROM subscriptions WHERE subscriber_id = profile_id OR creator_id = profile_id;
  DELETE FROM profiles WHERE id = profile_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- PARTE 23: VIEWS
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.profiles_public AS
SELECT id, user_id, name, username, avatar_url, cover_image_url, bio,
  is_creator, is_verified, plan_type, is_online, show_online_status,
  hide_age, hide_location, partner1_name, partner2_name, gender, gender_other,
  is_verified_couple, tags_social, tags_adult, connection_mode, pair_photos,
  pair_bio, show_on_radar, voice_bio_url, voice_bio_duration,
  is_pioneiro, is_vip, vip_tier, updated_at
FROM profiles
WHERE account_status = 'active' AND (is_anonymized IS NULL OR is_anonymized = false);

CREATE OR REPLACE VIEW public.v_secure_posts AS
SELECT id, user_id, content_text, media_url, privacy_level, is_locked,
  likes_count, comments_count, created_at, updated_at, is_seed, is_flash,
  is_hidden, hidden_reason, hidden_at, hidden_by, allow_sharing, share_link,
  file_size_bytes, file_type, original_filename, dislikes_count, post_type,
  media_type, video_duration_seconds, is_paid, paid_price, video_master_url,
  video_preview_url, video_hls_url, video_processing_status, thumbnail_url
FROM posts p
WHERE NOT EXISTS (SELECT 1 FROM blocked_contacts bc WHERE bc.user_id = p.user_id AND bc.block_type = 'blocked');

CREATE OR REPLACE VIEW public.creator_earnings_summary AS
SELECT p.id AS creator_id, p.name AS creator_name, p.username, p.balance,
  COALESCE(sum(t.amount) FILTER (WHERE t.seller_id = p.id AND t.category = 'creator_content' AND t.type IN ('subscription','tip','deposit') AND t.status IN ('completed','approved')), 0)::numeric(10,2) AS total_bruto,
  COALESCE(sum(t.amount * 0.06) FILTER (WHERE t.seller_id = p.id AND t.category = 'creator_content' AND t.type IN ('subscription','tip','deposit') AND t.status IN ('completed','approved')), 0)::numeric(10,2) AS total_imposto,
  COALESCE(sum(t.amount * 0.94 * 0.20) FILTER (WHERE t.seller_id = p.id AND t.category = 'creator_content' AND t.type IN ('subscription','tip','deposit') AND t.status IN ('completed','approved')), 0)::numeric(10,2) AS total_taxa_plataforma,
  COALESCE(sum(t.amount * 0.94 * 0.05) FILTER (WHERE t.seller_id = p.id AND t.category = 'creator_content' AND t.type IN ('subscription','tip','deposit') AND t.status IN ('completed','approved') AND t.affiliate_id IS NOT NULL), 0)::numeric(10,2) AS total_taxa_afiliado,
  COALESCE(sum(CASE WHEN t.affiliate_id IS NOT NULL THEN t.amount * 0.94 * 0.75 ELSE t.amount * 0.94 * 0.80 END) FILTER (WHERE t.seller_id = p.id AND t.category = 'creator_content' AND t.type IN ('subscription','tip','deposit') AND t.status IN ('completed','approved')), 0)::numeric(10,2) AS total_liquido,
  COALESCE(sum(t.amount) FILTER (WHERE t.seller_id = p.id AND t.category = 'creator_content' AND t.status = 'pending' AND t.type IN ('subscription','tip','deposit')), 0)::numeric(10,2) AS total_pendente,
  COALESCE(sum(abs(t.amount)) FILTER (WHERE t.user_id = p.id AND t.type = 'withdrawal' AND t.status = 'completed'), 0)::numeric(10,2) AS total_sacado,
  COALESCE(sum(CASE WHEN t.affiliate_id IS NOT NULL THEN t.amount * 0.94 * 0.75 ELSE t.amount * 0.94 * 0.80 END) FILTER (WHERE t.seller_id = p.id AND t.category = 'creator_content' AND t.type IN ('subscription','tip','deposit') AND t.status IN ('completed','approved') AND t.created_at >= date_trunc('month', CURRENT_DATE)), 0)::numeric(10,2) AS ganhos_mes_atual,
  count(*) FILTER (WHERE t.seller_id = p.id AND t.category = 'creator_content' AND t.type IN ('subscription','tip','deposit') AND t.status IN ('completed','approved')) AS total_vendas
FROM profiles p
LEFT JOIN transactions t ON t.seller_id = p.id OR t.user_id = p.id
WHERE p.is_creator = true OR p.plan_type = 'vip'
GROUP BY p.id, p.name, p.username, p.balance;

CREATE OR REPLACE VIEW public.vw_extrato_criador AS
SELECT tsl.id, tsl.transaction_id, tsl.flow_type,
  tsl.gross_amount, tsl.tax_amount, tsl.tax_rate, tsl.base_amount,
  tsl.platform_amount, tsl.platform_rate,
  tsl.affiliate_amount, tsl.affiliate_rate,
  tsl.creator_amount, tsl.creator_id AS criador_id, tsl.affiliate_id,
  tsl.provider, tsl.created_at,
  t.type AS transaction_type, t.status AS transaction_status,
  t.description, t.category, t.completed_at, t.user_id AS buyer_id
FROM transaction_split_logs tsl
LEFT JOIN transactions t ON t.id::text = tsl.transaction_id;

CREATE OR REPLACE VIEW public.v_vip_stats AS
SELECT id, user_id, username, name, avatar_url, is_vip, vip_tier, is_verified, is_creator, balance, plan_type, is_invisible,
  (SELECT count(*) FROM profile_visits pv WHERE pv.visited_id = p.id) AS total_visits,
  (SELECT count(*) FROM profile_visits pv WHERE pv.visited_id = p.id AND pv.visited_at > now() - interval '7 days') AS weekly_visits,
  (SELECT count(*) FROM subscriptions s WHERE s.creator_id = p.id AND s.status = 'active') AS active_subscribers,
  (SELECT count(*) FROM post_likes pl JOIN posts po ON po.id = pl.post_id WHERE po.user_id = p.id) AS total_likes_received
FROM profiles p;

CREATE OR REPLACE VIEW public.admin_financial_master_view AS
SELECT
  COALESCE(sum(amount), 0) AS total_revenue,
  COALESCE(sum(amount) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS monthly_revenue,
  COALESCE(sum(amount) FILTER (WHERE created_at >= now() - interval '7 days'), 0) AS weekly_revenue,
  COALESCE(sum(amount) * 0.20, 0) AS platform_profit,
  COALESCE(sum(amount) * 0.20 * 0.15, 0) AS tax_reserve,
  COALESCE(sum(amount) FILTER (WHERE type = 'subscription'), 0) AS subscription_revenue,
  COALESCE(sum(amount) FILTER (WHERE type = 'content_purchase'), 0) AS content_revenue,
  COALESCE(sum(amount) FILTER (WHERE type = 'message_paid'), 0) AS message_revenue,
  COALESCE(sum(amount) FILTER (WHERE type = 'tip'), 0) AS tip_revenue,
  count(*)::integer AS total_transactions,
  count(*) FILTER (WHERE created_at >= date_trunc('month', now()))::integer AS monthly_transactions
FROM transactions t WHERE status = 'completed';

-- ══════════════════════════════════════════════════════════════
-- PARTE 24: TRIGGERS
-- ══════════════════════════════════════════════════════════════

-- Auth trigger (must be created manually in Supabase Dashboard > Database > Triggers)
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
-- FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Profile triggers
CREATE OR REPLACE FUNCTION public.protect_lifetime_users()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_lifetime = true AND NEW.plan_type != OLD.plan_type THEN
    NEW.plan_type := OLD.plan_type;
  END IF;
  RETURN NEW;
END;
$$;

-- NOTE: After running this script, you must manually:
-- 1. Create the auth trigger: on_auth_user_created -> handle_new_user()
-- 2. Configure Storage buckets (post-media, avatars, founder-media)
-- 3. Deploy Edge Functions via Supabase CLI
-- 4. Set up environment variables (STRIPE keys, ASAAS keys, etc.)

-- ══════════════════════════════════════════════════════════════
-- FIM DO SCRIPT COMPLETO
-- Total: ~150+ tabelas, 15+ views, 20+ funções RPC
-- ══════════════════════════════════════════════════════════════
