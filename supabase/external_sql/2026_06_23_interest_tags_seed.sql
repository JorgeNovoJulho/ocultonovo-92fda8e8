-- =====================================================================
-- Seed inicial de Tags de Interesse (Social + +18)
-- Idempotente — pode rodar várias vezes. ON CONFLICT por (kind, name).
-- Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- Garante unicidade lógica (kind + name) para o upsert
CREATE UNIQUE INDEX IF NOT EXISTS oculto_interest_tags_kind_name_uq
  ON public.oculto_interest_tags (kind, lower(name));

-- ---------- SOCIAL ----------
INSERT INTO public.oculto_interest_tags (kind, name, icon, position, is_active) VALUES
  ('social','Rock','🎸',10,true),
  ('social','Futebol','⚽',20,true),
  ('social','Filmes de Terror','🎃',30,true),
  ('social','Academia','💪',40,true),
  ('social','Viagens','✈️',50,true),
  ('social','Gastronomia','🍽️',60,true),
  ('social','Games','🎮',70,true),
  ('social','Anime','🌸',80,true),
  ('social','Cerveja Artesanal','🍺',90,true),
  ('social','Vinho','🍷',100,true),
  ('social','Praia','🏖️',110,true),
  ('social','Acampar','⛺',120,true),
  ('social','Fotografia','📷',130,true),
  ('social','Tatuagem','🖋️',140,true),
  ('social','Signos','♈',150,true),
  ('social','Café','☕',160,true),
  ('social','Séries','📺',170,true),
  ('social','Literatura','📚',180,true),
  ('social','Yoga','🧘',190,true),
  ('social','Pet Friendly','🐾',200,true),
  ('social','Festas','🎉',210,true),
  ('social','Poker','♠️',220,true),
  ('social','Skate','🛹',230,true),
  ('social','Meditação','🕯️',240,true),
  ('social','Trilhas','🥾',250,true),
  ('social','Tecnologia','💻',260,true),
  ('social','Dança','💃',270,true),
  ('social','Podcast','🎙️',280,true),
  ('social','Idiomas','🌍',290,true),
  ('social','Pintura','🎨',300,true)
ON CONFLICT (kind, lower(name)) DO UPDATE
  SET icon = EXCLUDED.icon,
      position = EXCLUDED.position,
      is_active = true;

-- ---------- ADULT (+18) ----------
INSERT INTO public.oculto_interest_tags (kind, name, icon, position, is_active) VALUES
  ('adult','Anal','🔥',10,true),
  ('adult','DP (Dupla)','🔥',20,true),
  ('adult','Sadomasoquismo','⛓️',30,true),
  ('adult','Oral','💋',40,true),
  ('adult','Bi Feminino','🌈',50,true),
  ('adult','Bi Masculino','🌈',60,true),
  ('adult','Menage','👥',70,true),
  ('adult','Menage Masculino','👥',80,true),
  ('adult','Menage Feminino','👥',90,true),
  ('adult','Gang Bang','🔞',100,true),
  ('adult','Gozo Facial','💦',110,true),
  ('adult','Cuckold','👀',120,true),
  ('adult','BDSM','⛓️',130,true),
  ('adult','Dominação','👑',140,true),
  ('adult','Submissão','🔒',150,true),
  ('adult','Fetiche por Pés','🦶',160,true),
  ('adult','Roleplay','🎭',170,true),
  ('adult','Voyeurismo','👁️',180,true),
  ('adult','Exibicionismo','✨',190,true),
  ('adult','Squirt','💦',200,true),
  ('adult','Deepthroat','💋',210,true),
  ('adult','Bondage','🪢',220,true),
  ('adult','Swing','🔄',230,true),
  ('adult','Golden Shower','🌧️',240,true),
  ('adult','Spanking','🖐️',250,true),
  ('adult','Pegging','🔥',260,true),
  ('adult','Creampie','💦',270,true),
  ('adult','Milf/Dilf','💎',280,true),
  ('adult','Massagem Erótica','💆',290,true),
  ('adult','Fantasias','🎭',300,true),
  ('adult','Brinquedos','🧸',310,true),
  ('adult','Orgia','🔞',320,true),
  ('adult','Trans','🏳️‍⚧️',330,true),
  ('adult','Cross','👗',340,true),
  ('adult','Gay','🌈',350,true),
  ('adult','2 Homens','👬',360,true),
  ('adult','2 Mulheres','👭',370,true),
  ('adult','Hot Wife','🔥',380,true),
  ('adult','BBW','💖',390,true),
  ('adult','Negros','🖤',400,true),
  ('adult','Brancos','🤍',410,true),
  ('adult','Asiáticos','🌸',420,true),
  ('adult','Novidades','🆕',430,true)
ON CONFLICT (kind, lower(name)) DO UPDATE
  SET icon = EXCLUDED.icon,
      position = EXCLUDED.position,
      is_active = true;

NOTIFY pgrst, 'reload schema';
