-- Add Stripe configuration settings
INSERT INTO system_settings (key, value, description) VALUES 
  ('stripe_publishable_key', '""', 'Chave pública do Stripe (pk_live_ ou pk_test_)'),
  ('stripe_sandbox_mode', '"true"', 'Se está usando modo teste do Stripe')
ON CONFLICT (key) DO NOTHING;