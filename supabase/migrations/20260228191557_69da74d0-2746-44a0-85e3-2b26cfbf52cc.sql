
-- Converter views restantes para SECURITY INVOKER
ALTER VIEW public.user_referral_children SET (security_invoker = on);
ALTER VIEW public.engagement_heatmap SET (security_invoker = on);
ALTER VIEW public.cart_recovery_metrics SET (security_invoker = on);
ALTER VIEW public.promotion_analytics SET (security_invoker = on);
ALTER VIEW public.promotion_period_stats SET (security_invoker = on);
ALTER VIEW public.share_click_stats SET (security_invoker = on);
ALTER VIEW public.referral_network_stats SET (security_invoker = on);
ALTER VIEW public.founder_vagas_status SET (security_invoker = on);
