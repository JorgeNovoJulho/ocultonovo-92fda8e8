-- =====================================================================
-- Salas Sociais Especiais — Configuração total para o Admin Master
-- Backend externo (rvybbrkzmboqbhcemqar). 100% idempotente.
--
-- O que faz:
--   1) Estende oculto_special_cycle_definitions com colunas de config
--      avançada (capacidade máx., dias da semana, janela horária,
--      XP por rodada, multiplicador de presentes, couple_only,
--      glow_intensity, sort_order).
--   2) Cria policies de escrita restritas ao Admin Master.
--   3) Faz seed (upsert) de todas as salas especiais previstas
--      (horário, dia da semana, clima, sazonais, energia, VIP).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Colunas adicionais
-- ---------------------------------------------------------------------
ALTER TABLE public.oculto_special_cycle_definitions
  ADD COLUMN IF NOT EXISTS max_members           int     NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS hour_start            int     NULL,
  ADD COLUMN IF NOT EXISTS hour_end              int     NULL,
  ADD COLUMN IF NOT EXISTS days_of_week          int[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS date_month            int     NULL,
  ADD COLUMN IF NOT EXISTS date_day              int     NULL,
  ADD COLUMN IF NOT EXISTS xp_round_amount       int     NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS xp_max_winners        int     NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS xp_round_cooldown_sec int     NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS gift_xp_multiplier    numeric(4,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS couple_only           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS glow_intensity        smallint NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS sort_order            smallint NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS category              text    NOT NULL DEFAULT 'time';
-- category: time | weekday | weather | season | energy | vip

-- ---------------------------------------------------------------------
-- 2) Policies de escrita (Admin Master only)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "scd_master_insert" ON public.oculto_special_cycle_definitions;
CREATE POLICY "scd_master_insert" ON public.oculto_special_cycle_definitions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

DROP POLICY IF EXISTS "scd_master_update" ON public.oculto_special_cycle_definitions;
CREATE POLICY "scd_master_update" ON public.oculto_special_cycle_definitions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

DROP POLICY IF EXISTS "scd_master_delete" ON public.oculto_special_cycle_definitions;
CREATE POLICY "scd_master_delete" ON public.oculto_special_cycle_definitions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'));

-- ---------------------------------------------------------------------
-- 3) Seed — catálogo completo de salas especiais (idempotente)
-- ---------------------------------------------------------------------
INSERT INTO public.oculto_special_cycle_definitions
  (key, label, emoji, hue, room_slug, weather_kinds, day_parts,
   min_temp, max_temp, min_aura_level, min_social_score, min_prestige_xp,
   required_plan, requires_kyc, max_duration_minutes, active, description,
   max_members, hour_start, hour_end, days_of_week, date_month, date_day,
   xp_round_amount, xp_max_winners, xp_round_cooldown_sec, gift_xp_multiplier,
   couple_only, glow_intensity, sort_order, category)
VALUES
  -- ===== HORÁRIO =====
  ('despertar_oculto','Despertar Oculto','🌅', 30,'ciclo-despertar','{}','{}',
   NULL,NULL,1,0,0,NULL,false,180,true,'Sala matinal cedo, energia leve.',
   50,5,8,'{}',NULL,NULL,40,5,300,1.00,false,60,10,'time'),
  ('cafe_discreto','Café Discreto','☕', 25,'ciclo-cafe','{}','{}',
   NULL,NULL,1,0,0,NULL,false,180,true,'Conversa de café, social e calma.',
   50,8,11,'{}',NULL,NULL,40,5,300,1.00,false,60,11,'time'),
  ('almoco_safado','Hora do Almoço Safado','🍴',340,'ciclo-almoco','{}','{}',
   NULL,NULL,2,0,0,NULL,false,180,true,'Pausa do almoço com clima quente.',
   50,12,14,'{}',NULL,NULL,50,5,300,1.10,false,70,12,'time'),
  ('tarde_languida','Tarde Lânguida','🌇',300,'ciclo-tarde','{}','{}',
   NULL,NULL,2,50,0,NULL,false,180,true,'Tarde lenta, conexões profundas.',
   60,14,17,'{}',NULL,NULL,50,5,300,1.10,false,70,13,'time'),
  ('happy_hour_oculto','Happy Hour Oculto','🍷',280,'ciclo-happy-hour','{}','{}',
   NULL,NULL,2,0,0,NULL,false,180,true,'Decompressão pós-trabalho.',
   80,17,20,'{}',NULL,NULL,60,5,240,1.20,false,75,14,'time'),
  ('noite_quente','Noite Quente','🔥',350,'ciclo-noite-quente','{}','{}',
   NULL,NULL,3,100,0,NULL,false,180,true,'Auge da noite, pico social.',
   100,20,23,'{}',NULL,NULL,80,5,240,1.30,false,90,15,'time'),
  ('madrugada_proibida','Madrugada Proibida','🌙',260,'ciclo-madrugada-proibida','{}','{}',
   NULL,NULL,3,0,200,NULL,true,180,true,'Madrugada exclusiva, KYC obrigatório.',
   40,23,3,'{}',NULL,NULL,100,5,300,1.50,false,95,16,'time'),
  ('insonia_secreta','Insônia Secreta','🌑',240,'ciclo-insonia','{}','{}',
   NULL,NULL,4,0,0,'vip',false,180,true,'Para quem não dorme — íntima e rara.',
   30,3,5,'{}',NULL,NULL,120,5,300,1.50,false,100,17,'time'),

  -- ===== DIA DA SEMANA ===== (days_of_week: 0=Dom..6=Sáb)
  ('segunda_sem_vergonha','Segunda Sem Vergonha','😈',320,'ciclo-segunda','{}','{}',
   NULL,NULL,2,0,0,NULL,false,180,true,'Começa a semana com ousadia.',
   80,20,0,'{1}',NULL,NULL,60,5,300,1.20,false,80,20,'weekday'),
  ('terca_do_desejo','Terça do Desejo','💜',290,'ciclo-terca','{}','{}',
   NULL,NULL,2,0,0,NULL,false,180,true,'Terça-feira, energia rosa.',
   80,21,1,'{2}',NULL,NULL,60,5,300,1.20,false,80,21,'weekday'),
  ('quarta_molhada','Quarta Molhada','💦',210,'ciclo-quarta','{}','{}',
   NULL,NULL,2,0,0,NULL,false,180,true,'Meio de semana, vibe livre.',
   80,20,0,'{3}',NULL,NULL,60,5,300,1.20,false,80,22,'weekday'),
  ('quinta_selvagem','Quinta Selvagem','🐆',20,'ciclo-quinta','{}','{}',
   NULL,NULL,3,0,0,NULL,false,180,true,'Pré-sexta, intensa.',
   90,21,2,'{4}',NULL,NULL,80,5,240,1.30,false,90,23,'weekday'),
  ('sexta_liberada','Sexta Liberada','🎉',0,'ciclo-sexta','{}','{}',
   NULL,NULL,2,0,0,NULL,false,240,true,'Início do fim de semana.',
   120,19,4,'{5}',NULL,NULL,80,7,240,1.40,false,95,24,'weekday'),
  ('sabado_hot','Sábado Hot','🌶️',355,'ciclo-sabado','{}','{}',
   NULL,NULL,2,0,0,NULL,false,240,true,'Pico do fim de semana.',
   150,18,5,'{6}',NULL,NULL,80,7,240,1.40,false,95,25,'weekday'),
  ('domingo_preguicoso','Domingo Preguiçoso','🛏️',180,'ciclo-domingo','{}','{}',
   NULL,NULL,1,0,0,NULL,false,180,true,'Sem pressa, conversa solta.',
   80,10,23,'{0}',NULL,NULL,40,5,300,1.00,false,55,26,'weekday'),

  -- ===== CLIMA =====
  ('chuva_la_fora','Chuva Lá Fora','🌧️',200,'ciclo-aconchego-chuvoso','{rain,thunderstorm,drizzle}','{}',
   NULL,NULL,2,0,0,NULL,false,180,true,'Aberta quando chove na cidade.',
   60,NULL,NULL,'{}',NULL,NULL,60,5,300,1.20,false,70,30,'weather'),
  ('calor_insuportavel','Calor Insuportável','🥵', 15,'ciclo-calor','{clear}','{}',
   30,NULL,2,0,0,NULL,false,180,true,'Quando a temperatura passa de 30°C.',
   60,NULL,NULL,'{}',NULL,NULL,60,5,300,1.20,false,80,31,'weather'),
  ('frio_conchego','Frio de Conchego','❄️',210,'ciclo-esquenta-clima','{clouds,clear}','{}',
   NULL,15,2,0,0,NULL,false,180,true,'Aberta quando a temperatura cai abaixo de 15°C.',
   60,NULL,NULL,'{}',NULL,NULL,60,5,300,1.20,false,70,32,'weather'),
  ('lua_cheia','Lua Cheia','🌕',270,'ciclo-lua-cheia','{lunar_full}','{}',
   NULL,NULL,3,0,300,NULL,false,180,true,'Apenas em noites de lua cheia.',
   80,18,4,'{}',NULL,NULL,100,5,300,1.40,false,95,33,'weather'),

  -- ===== SAZONAIS =====
  ('reveillon_oculto','Réveillon Oculto','🎆',45,'ciclo-reveillon','{}','{}',
   NULL,NULL,3,0,0,NULL,true,600,true,'Virada de ano, 31/12 noite.',
   200,20,6,'{}',12,31,150,7,180,2.00,false,100,40,'season'),
  ('carnaval_sem_limites','Carnaval Sem Limites','🎭',330,'ciclo-carnaval','{}','{}',
   NULL,NULL,2,0,0,NULL,false,360,true,'Período de carnaval.',
   150,0,23,'{}',NULL,NULL,100,7,240,1.50,false,90,41,'season'),
  ('dia_dos_namorados','Dia dos Namorados','❤️',355,'ciclo-namorados','{}','{}',
   NULL,NULL,2,0,0,NULL,false,360,true,'12 de junho, para casais e solteiros.',
   150,0,23,'{}',6,12,80,5,300,1.30,false,85,42,'season'),
  ('halloween_proibido','Halloween Proibido','🎃',25,'ciclo-halloween','{}','{}',
   NULL,NULL,3,0,0,NULL,false,360,true,'31 de outubro, vibe sombria.',
   120,18,2,'{}',10,31,120,5,240,1.50,false,95,43,'season'),

  -- ===== ENERGIA / DINÂMICAS =====
  ('onda_quente_detectada','Onda Quente Detectada','⚡',12,'ciclo-onda-quente','{}','{}',
   NULL,NULL,2,0,0,NULL,false,120,true,'Abre quando há pico social na rede.',
   80,NULL,NULL,'{}',NULL,NULL,80,5,240,1.30,false,90,50,'energy'),
  ('pico_magnetismo','Pico de Magnetismo','🧲',285,'ciclo-magnetismo','{}','{}',
   NULL,NULL,3,0,0,NULL,false,120,true,'Score médio da rede em alta.',
   60,NULL,NULL,'{}',NULL,NULL,90,5,240,1.40,false,95,51,'energy'),
  ('silencio_sedutor','Silêncio Sedutor','🤫',250,'ciclo-silencio','{}','{}',
   NULL,NULL,4,0,500,NULL,false,90,true,'Aberta em horários de baixa atividade.',
   20,NULL,NULL,'{}',NULL,NULL,60,3,300,1.20,false,55,52,'energy'),

  -- ===== EXCLUSIVAS =====
  ('salao_dourado_vip','Salão Dourado VIP','👑',45,'ciclo-salao-dourado','{}','{}',
   NULL,NULL,4,0,0,'vip',false,240,true,'Exclusivo do plano VIP.',
   40,NULL,NULL,'{}',NULL,NULL,150,5,240,2.00,false,100,60,'vip'),
  ('founders_club','Founder''s Club','💎',265,'ciclo-founders','{}','{}',
   NULL,NULL,3,0,0,'founder',false,300,true,'Somente Founders Beta.',
   30,NULL,NULL,'{}',NULL,NULL,200,5,240,2.50,false,100,61,'vip'),
  ('encontro_casais_verificados','Encontro de Casais Verificados','💞',330,'ciclo-casais-vip','{}','{}',
   NULL,NULL,3,0,0,'premium',true,240,true,'Couple Mode + KYC duplo.',
   30,NULL,NULL,'{}',NULL,NULL,120,5,240,1.50,true,90,62,'vip')
ON CONFLICT (key) DO UPDATE SET
  label              = EXCLUDED.label,
  emoji              = EXCLUDED.emoji,
  hue                = EXCLUDED.hue,
  room_slug          = EXCLUDED.room_slug,
  description        = EXCLUDED.description,
  category           = EXCLUDED.category,
  sort_order         = EXCLUDED.sort_order,
  -- não sobrescreve toggles/parâmetros já editados pelo admin:
  -- (active, max_members, etc.) ficam preservados se já existirem
  updated_at         = now();

-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
