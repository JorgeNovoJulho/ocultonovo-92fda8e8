-- ============================================================
-- APP OCULTO — Schema SQL Estendido (Todas as Tabelas Restantes)
-- Execute APÓS o SCHEMA_CORE.sql
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- LEILÕES
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

CREATE POLICY "Users can view own cards" ON public.bidder_cards FOR SELECT USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own cards" ON public.bidder_cards FOR INSERT WITH CHECK (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own cards" ON public.bidder_cards FOR UPDATE USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- ══════════════════════════════════════════════════════════════
-- BROADCASTS (Mensagens em Massa)
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

CREATE POLICY "Creators can view own broadcasts" ON public.broadcasts FOR SELECT USING (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Creators can create broadcasts" ON public.broadcasts FOR INSERT WITH CHECK (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Creators can update own broadcasts" ON public.broadcasts FOR UPDATE USING (creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

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
-- ÁLBUNS COM TEMPO (Time-Locked)
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

-- ══════════════════════════════════════════════════════════════
-- STORIES
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- ENQUETES (Polls)
-- ══════════════════════════════════════════════════════════════

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
-- GAMIFICAÇÃO (Badges, Achievements, Levels)
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

-- ══════════════════════════════════════════════════════════════
-- WAITLIST
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

-- ══════════════════════════════════════════════════════════════
-- WISHLIST
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wishlist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  item_id uuid NOT NULL,
  notify_on_sale boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- SAQUES / WITHDRAWAL
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO DE CASAIS
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- DENÚNCIAS DE CONTEÚDO
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- PUSH NOTIFICATIONS
-- ══════════════════════════════════════════════════════════════

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

CREATE POLICY "Users can manage own push subs" ON public.push_subscriptions FOR ALL USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- A/B TESTING
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- SITE SECTIONS (CMS Landing Page)
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- CONVERSION EVENTS (Analytics)
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- ADMIN / AUDIT / ANALYTICS
-- ══════════════════════════════════════════════════════════════

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

CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_date date NOT NULL,
  metric_type text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- CAMPANHAS E ADS
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

-- ══════════════════════════════════════════════════════════════
-- EVENTOS
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

-- ══════════════════════════════════════════════════════════════
-- CUPONS
-- ══════════════════════════════════════════════════════════════

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
-- EARLY BIRD
-- ══════════════════════════════════════════════════════════════

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
-- CREATOR REFERRAL (Madrinha/Afilhada)
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- CREATOR FOUNDERS
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
-- GOALS (Metas de Criadores)
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- GIFTS (Presentes)
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

-- ══════════════════════════════════════════════════════════════
-- DAILY SPINS (Roleta Diária)
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- BACKUP SYSTEM
-- ══════════════════════════════════════════════════════════════

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
  created_at timestamptz DEFAULT now() -- Added missing comma in original, fixed here
);
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- EMAIL SYSTEM
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- INVOICES
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- HERO SETTINGS (Landing Page Config)
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- CHECKOUT MONITORING
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- FEEDBACK SYSTEM
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- COOKIE CONSENT (LGPD)
-- ══════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════
-- DISCIPLINA / MODERAÇÃO
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.discipline_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL,
  action_type text NOT NULL,
  admin_id uuid NOT NULL,
  reason text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.discipline_history ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- FUNÇÕES AUXILIARES IMPORTANTES
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.add_to_balance(p_user_id uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE profiles SET balance = COALESCE(balance, 0) + p_amount WHERE id = p_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.add_to_waitlist(p_email text, p_name text DEFAULT NULL, p_source text DEFAULT 'signup')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id UUID; v_position INTEGER; v_existing RECORD;
BEGIN
  SELECT * INTO v_existing FROM waitlist WHERE email = LOWER(TRIM(p_email));
  IF v_existing.id IS NOT NULL THEN
    SELECT COUNT(*) + 1 INTO v_position FROM waitlist WHERE status = 'waiting' AND created_at < v_existing.created_at;
    RETURN jsonb_build_object('success', true, 'already_registered', true, 'position', v_position, 'id', v_existing.id);
  END IF;
  INSERT INTO waitlist (email, name, source) VALUES (LOWER(TRIM(p_email)), p_name, p_source) RETURNING id INTO v_id;
  SELECT COUNT(*) INTO v_position FROM waitlist WHERE status = 'waiting';
  RETURN jsonb_build_object('success', true, 'already_registered', false, 'position', v_position, 'id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.award_achievement(p_user_id uuid, p_achievement_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_achievement_id uuid; v_xp_reward integer;
BEGIN
  SELECT id, xp_reward INTO v_achievement_id, v_xp_reward FROM achievements WHERE code = p_achievement_code AND is_active = true;
  IF v_achievement_id IS NULL THEN RETURN false; END IF;
  INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user_id, v_achievement_id) ON CONFLICT DO NOTHING;
  IF v_xp_reward > 0 THEN UPDATE profiles SET total_xp = COALESCE(total_xp, 0) + v_xp_reward WHERE id = p_user_id; END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.award_badge(p_user_id uuid, p_badge_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_badge_id uuid;
BEGIN
  SELECT id INTO v_badge_id FROM badges WHERE code = p_badge_code;
  IF v_badge_id IS NULL THEN RETURN false; END IF;
  INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id) ON CONFLICT DO NOTHING;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.check_media_access(p_user_id uuid, p_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE has_access boolean; post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM posts WHERE id = p_post_id;
  IF post_owner = p_user_id THEN RETURN true; END IF;
  SELECT EXISTS(SELECT 1 FROM media_access WHERE user_id = p_user_id AND post_id = p_post_id) INTO has_access;
  RETURN has_access;
END; $$;

CREATE OR REPLACE FUNCTION public.end_auction(p_auction_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_auction RECORD; v_winner RECORD; v_creator RECORD;
BEGIN
  SELECT * INTO v_auction FROM auctions WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Leilao nao encontrado'); END IF;
  IF v_auction.status != 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'Leilao ja encerrado'); END IF;
  IF v_auction.current_bidder_id IS NOT NULL THEN
    SELECT * INTO v_winner FROM profiles WHERE id = v_auction.current_bidder_id;
    UPDATE auctions SET status = 'ended', winner_id = v_auction.current_bidder_id, updated_at = now() WHERE id = p_auction_id;
    SELECT * INTO v_creator FROM profiles WHERE id = v_auction.creator_id;
    INSERT INTO notifications (user_id, type, title, body, data) VALUES
      (v_winner.user_id, 'auction', '🎉 Voce venceu!', 'Lance de R$ ' || v_auction.current_bid, jsonb_build_object('auction_id', p_auction_id)),
      (v_creator.user_id, 'auction', '💰 Leilao arrematado!', v_auction.title || ' por R$ ' || v_auction.current_bid, jsonb_build_object('auction_id', p_auction_id));
    RETURN jsonb_build_object('success', true, 'winner_id', v_auction.current_bidder_id, 'winning_amount', v_auction.current_bid);
  ELSE
    UPDATE auctions SET status = 'ended', updated_at = now() WHERE id = p_auction_id;
    RETURN jsonb_build_object('success', true, 'winner_id', null, 'message', 'Sem lances');
  END IF;
END; $$;

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
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_user_plan(p_profile_id uuid, p_plan_type text, p_payment_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  UPDATE profiles SET plan_type = p_plan_type, payment_status = p_payment_status, updated_at = now() WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
  RETURN true;
END; $$;

-- Trigger: Antispam em comentários
CREATE OR REPLACE FUNCTION public.fn_antispam_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_profile RECORD; v_last_comment_at TIMESTAMPTZ; v_recent_content TEXT; v_similarity FLOAT; v_recent_count INT;
BEGIN
  SELECT is_verified, plan_type, is_seed, is_test_account INTO v_profile FROM profiles WHERE id = NEW.user_id;
  IF v_profile.is_seed = TRUE OR v_profile.is_test_account = TRUE THEN
    NEW.is_hidden := TRUE; NEW.spam_reason := 'bot_account'; NEW.spam_score := 100; RETURN NEW;
  END IF;
  IF v_profile.is_verified IS DISTINCT FROM TRUE AND v_profile.plan_type NOT IN ('vip', 'premium') THEN
    SELECT MAX(created_at) INTO v_last_comment_at FROM post_comments WHERE user_id = NEW.user_id AND is_hidden = FALSE;
    IF v_last_comment_at IS NOT NULL AND (EXTRACT(EPOCH FROM (NOW() - v_last_comment_at))) < 30 THEN
      NEW.is_hidden := TRUE; NEW.spam_reason := 'rate_limit'; NEW.spam_score := 80; RETURN NEW;
    END IF;
  END IF;
  IF v_profile.plan_type NOT IN ('vip', 'premium') THEN
    SELECT COUNT(*) INTO v_recent_count FROM post_comments WHERE user_id = NEW.user_id AND created_at > NOW() - INTERVAL '5 minutes' AND is_hidden = FALSE;
    IF v_recent_count >= 5 THEN NEW.is_hidden := TRUE; NEW.spam_reason := 'flood_detected'; NEW.spam_score := 90; RETURN NEW; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_antispam_comment BEFORE INSERT ON public.post_comments FOR EACH ROW EXECUTE FUNCTION fn_antispam_comment();

-- Trigger: Log de mudança de plano
CREATE OR REPLACE FUNCTION public.fn_log_plan_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.plan_type IS DISTINCT FROM NEW.plan_type THEN
    INSERT INTO plan_change_logs (user_id, old_plan, new_plan, change_type, source)
    VALUES (NEW.id, COALESCE(OLD.plan_type, 'free'), COALESCE(NEW.plan_type, 'free'),
      CASE WHEN NEW.plan_type = 'vip' THEN 'upgrade'
           WHEN NEW.plan_type = 'premium' AND COALESCE(OLD.plan_type, 'free') = 'free' THEN 'upgrade'
           WHEN NEW.plan_type = 'premium' AND OLD.plan_type = 'vip' THEN 'downgrade'
           WHEN COALESCE(NEW.plan_type, 'free') = 'free' THEN 'cancellation'
           ELSE 'change' END, 'system');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_plan_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION fn_log_plan_change();

-- ══════════════════════════════════════════════════════════════
-- FIM DO SCHEMA ESTENDIDO
-- Total: ~150+ tabelas cobertas entre SCHEMA_CORE + SCHEMA_EXTENDED
-- ══════════════════════════════════════════════════════════════
