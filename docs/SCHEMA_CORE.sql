-- ============================================================
-- APP OCULTO — Schema SQL Completo (Tabelas Core)
-- Executar no SQL Editor do Supabase para replicar o banco
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- FUNÇÕES AUXILIARES (devem ser criadas ANTES das tabelas/RLS)
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
-- TABELAS AUXILIARES (referenciadas por RLS)
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
-- TABELA: PROFILES (Usuários)
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
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS: Profiles
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users see own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Authenticated users see public profiles" ON public.profiles FOR SELECT USING (
  account_status = 'active' AND (is_anonymized IS NULL OR is_anonymized = false) AND (is_shadowbanned IS NULL OR is_shadowbanned = false)
);
CREATE POLICY "Only admins can delete profiles" ON public.profiles FOR DELETE USING (has_role(auth.uid(), 'admin_master'));

-- ══════════════════════════════════════════════════════════════
-- TABELA: POSTS (Conteúdo)
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

-- Realtime para feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;

-- RLS: Posts
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
-- TABELA: SUBSCRIPTIONS (Assinaturas de Criadores)
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
-- TABELA: TRANSACTIONS (Financeiro)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  seller_id uuid,
  amount numeric NOT NULL,
  type text NOT NULL,
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
-- TABELA: CONVERSATIONS + MESSAGES (Chat)
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

-- RLS: Messages
CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "Users can send messages to their conversations" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid())
);
CREATE POLICY "Senders can update their messages" ON public.messages FOR UPDATE USING (sender_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- TABELA: NOTIFICATIONS
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
-- TABELAS: ENGAGEMENT (Likes, Comments, Follows)
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

-- ══════════════════════════════════════════════════════════════
-- TABELAS: MONETIZAÇÃO (Marketplace, Splits, PIX)
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- FUNÇÃO ATÔMICA: COMPRA NO MARKETPLACE
-- ══════════════════════════════════════════════════════════════

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
END; $$;

-- ══════════════════════════════════════════════════════════════
-- TRIGGER: Protege usuários lifetime de alterações automáticas
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_protect_lifetime_users()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_lifetime = true AND NEW.plan_type != OLD.plan_type THEN
    NEW.plan_type := OLD.plan_type;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_protect_lifetime_users
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION trg_protect_lifetime_users();

-- ══════════════════════════════════════════════════════════════
-- FIM DO SCHEMA CORE
-- Para o schema COMPLETO com todas as 150+ tabelas, execute
-- as migrações em supabase/migrations/ via: supabase db push
-- ══════════════════════════════════════════════════════════════
