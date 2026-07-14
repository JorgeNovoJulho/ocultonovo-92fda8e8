-- =====================================================
-- PHASE 3: SOCIAL, CHAT & ENGAGEMENT
-- =====================================================

-- 1. BADGES SYSTEM
-- =====================================================
CREATE TABLE IF NOT EXISTS public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'Award',
  color text DEFAULT 'primary',
  category text DEFAULT 'general' CHECK (category IN ('general', 'engagement', 'verification', 'achievement', 'special')),
  points integer DEFAULT 10,
  is_automatic boolean DEFAULT true,
  criteria jsonb,
  created_at timestamptz DEFAULT now()
);

-- User badges (earned badges)
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  metadata jsonb,
  UNIQUE(user_id, badge_id)
);

-- 2. TRUST SCORE SYSTEM
-- =====================================================
CREATE TABLE IF NOT EXISTS public.user_trust_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  score integer DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  verification_points integer DEFAULT 0,
  profile_completion_points integer DEFAULT 0,
  activity_points integer DEFAULT 0,
  response_rate_points integer DEFAULT 0,
  report_penalty integer DEFAULT 0,
  last_calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. VOICE BIO SYSTEM
-- =====================================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS voice_bio_url text,
ADD COLUMN IF NOT EXISTS voice_bio_duration integer;

-- 4. CHAT ENHANCEMENTS
-- =====================================================

-- Screenshot alerts
CREATE TABLE IF NOT EXISTS public.screenshot_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL,
  detected_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notified_user uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Message translations
CREATE TABLE IF NOT EXISTS public.message_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  original_lang text,
  target_lang text NOT NULL,
  translated_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Unsend requests (soft delete tracking)
CREATE TABLE IF NOT EXISTS public.message_unsend_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  unsent_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_content text,
  unsent_at timestamptz DEFAULT now()
);

-- 5. TIME-LOCKED ALBUMS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.time_locked_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  unlock_type text DEFAULT 'scheduled' CHECK (unlock_type IN ('scheduled', 'timer', 'event')),
  unlock_at timestamptz,
  expires_at timestamptz,
  unlock_duration_hours integer,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.album_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.time_locked_albums(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.album_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.time_locked_albums(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  accessed_at timestamptz DEFAULT now()
);

-- 6. ICE BREAKERS (AI Suggestions)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ice_breaker_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  suggestion_text text NOT NULL,
  based_on text, -- 'interests', 'location', 'activity'
  was_used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 7. LUCKY MATCH HISTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS public.lucky_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  matched_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  compatibility_score integer,
  was_contacted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- ENABLE RLS
-- =====================================================
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trust_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenshot_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_unsend_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_locked_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ice_breaker_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucky_matches ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Badges (public read)
CREATE POLICY "Badges are viewable by everyone" ON public.badges FOR SELECT USING (true);
CREATE POLICY "Only admins can manage badges" ON public.badges FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- User badges
CREATE POLICY "User badges are viewable by everyone" ON public.user_badges FOR SELECT USING (true);
CREATE POLICY "System can grant badges" ON public.user_badges FOR INSERT 
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Trust scores (public read, self update)
CREATE POLICY "Trust scores are viewable by everyone" ON public.user_trust_scores FOR SELECT USING (true);
CREATE POLICY "Users can view their own trust score details" ON public.user_trust_scores FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "System can create trust scores" ON public.user_trust_scores FOR INSERT WITH CHECK (user_id = auth.uid());

-- Screenshot alerts (participants only)
CREATE POLICY "Users see their screenshot alerts" ON public.screenshot_alerts FOR SELECT 
  USING (detected_by = auth.uid() OR notified_user = auth.uid());
CREATE POLICY "Users can create screenshot alerts" ON public.screenshot_alerts FOR INSERT 
  WITH CHECK (detected_by = auth.uid());

-- Message translations (message participants)
CREATE POLICY "Translations visible to authenticated users" ON public.message_translations FOR SELECT 
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can create translations" ON public.message_translations FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

-- Unsend logs (self only)
CREATE POLICY "Users see their unsend logs" ON public.message_unsend_logs FOR SELECT USING (unsent_by = auth.uid());
CREATE POLICY "Users can create unsend logs" ON public.message_unsend_logs FOR INSERT WITH CHECK (unsent_by = auth.uid());

-- Time-locked albums
CREATE POLICY "Album owners manage their albums" ON public.time_locked_albums FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Active albums are viewable" ON public.time_locked_albums FOR SELECT 
  USING (is_active = true AND (unlock_at IS NULL OR unlock_at <= now()) AND (expires_at IS NULL OR expires_at > now()));

-- Album items (album owner or unlocked viewers)
CREATE POLICY "Album items visible to owner" ON public.album_items FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.time_locked_albums WHERE id = album_id AND user_id = auth.uid()));
CREATE POLICY "Album items visible when unlocked" ON public.album_items FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.time_locked_albums 
    WHERE id = album_id AND is_active = true 
    AND (unlock_at IS NULL OR unlock_at <= now()) 
    AND (expires_at IS NULL OR expires_at > now())
  ));

-- Album access logs
CREATE POLICY "Album owners see access logs" ON public.album_access_logs FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.time_locked_albums WHERE id = album_id AND user_id = auth.uid()));
CREATE POLICY "Viewers can log access" ON public.album_access_logs FOR INSERT WITH CHECK (viewer_id = auth.uid());

-- Ice breaker suggestions (self only)
CREATE POLICY "Users see their ice breaker suggestions" ON public.ice_breaker_suggestions FOR ALL USING (user_id = auth.uid());

-- Lucky matches (self only)
CREATE POLICY "Users see their lucky matches" ON public.lucky_matches FOR ALL USING (user_id = auth.uid());

-- =====================================================
-- SEED DEFAULT BADGES
-- =====================================================
INSERT INTO public.badges (code, name, description, icon, color, category, points, is_automatic, criteria) VALUES
  ('verified', 'Verificado', 'Perfil verificado com documento', 'BadgeCheck', 'green', 'verification', 25, false, '{"requires": "id_verification"}'),
  ('fast_responder', 'Responde Rápido', 'Responde em menos de 5 minutos', 'Zap', 'yellow', 'engagement', 15, true, '{"avg_response_time_minutes": 5}'),
  ('top_fan', 'Top Fã', 'Entre os maiores apoiadores', 'Heart', 'red', 'achievement', 30, true, '{"min_tips": 500}'),
  ('early_adopter', 'Early Adopter', 'Membro desde o início', 'Rocket', 'purple', 'special', 20, false, '{"joined_before": "2025-06-01"}'),
  ('complete_profile', 'Perfil Completo', 'Todas as informações preenchidas', 'UserCheck', 'blue', 'general', 10, true, '{"profile_completion": 100}'),
  ('active_daily', 'Ativo Diariamente', 'Acessa todos os dias da semana', 'Calendar', 'orange', 'engagement', 15, true, '{"consecutive_days": 7}'),
  ('generous_tipper', 'Gorjeteiro Generoso', 'Enviou mais de R$100 em gorjetas', 'Gift', 'pink', 'achievement', 25, true, '{"total_tips": 100}'),
  ('trusted_member', 'Membro Confiável', 'Score de confiança acima de 80', 'Shield', 'emerald', 'verification', 20, true, '{"trust_score": 80}')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_user_trust_scores_updated_at
  BEFORE UPDATE ON public.user_trust_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_time_locked_albums_updated_at
  BEFORE UPDATE ON public.time_locked_albums
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();