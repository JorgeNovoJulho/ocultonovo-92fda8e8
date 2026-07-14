-- Tabela de itens do marketplace (conteúdo avulso)
CREATE TABLE IF NOT EXISTS public.marketplace_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  original_price DECIMAL(10,2),
  item_type TEXT NOT NULL DEFAULT 'single' CHECK (item_type IN ('single', 'bundle', 'presale')),
  content_type TEXT NOT NULL DEFAULT 'image' CHECK (content_type IN ('image', 'video', 'audio', 'document', 'mixed')),
  media_urls TEXT[] DEFAULT '{}',
  preview_url TEXT,
  thumbnail_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  stock_limit INTEGER,
  sold_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  release_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de itens em bundles
CREATE TABLE IF NOT EXISTS public.bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(bundle_id, item_id)
);

-- Tabela de compras do marketplace
CREATE TABLE IF NOT EXISTS public.marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  price_paid DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'balance' CHECK (payment_method IN ('balance', 'pix', 'card')),
  transaction_id UUID REFERENCES public.transactions(id),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded', 'cancelled')),
  downloaded BOOLEAN DEFAULT false,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(buyer_id, item_id)
);

-- Tabela de wishlist
CREATE TABLE IF NOT EXISTS public.wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  notify_on_sale BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- Tabela de pré-vendas
CREATE TABLE IF NOT EXISTS public.presale_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  price_paid DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'released', 'refunded', 'cancelled')),
  notified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_marketplace_items_creator ON public.marketplace_items(creator_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_type ON public.marketplace_items(item_type);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_active ON public.marketplace_items(is_active);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_featured ON public.marketplace_items(is_featured);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_buyer ON public.marketplace_purchases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_item ON public.marketplace_purchases(item_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON public.wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_item ON public.wishlist(item_id);
CREATE INDEX IF NOT EXISTS idx_presale_orders_user ON public.presale_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_presale_orders_status ON public.presale_orders(status);

-- RLS
ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presale_orders ENABLE ROW LEVEL SECURITY;

-- Policies para marketplace_items
CREATE POLICY "Anyone can view active items" ON public.marketplace_items
  FOR SELECT USING (is_active = true);

CREATE POLICY "Creators can manage own items" ON public.marketplace_items
  FOR ALL USING (
    creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Policies para bundle_items
CREATE POLICY "Anyone can view bundle items" ON public.bundle_items
  FOR SELECT USING (true);

CREATE POLICY "Creators can manage bundle items" ON public.bundle_items
  FOR ALL USING (
    bundle_id IN (
      SELECT id FROM public.marketplace_items 
      WHERE creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Policies para purchases
CREATE POLICY "Users can view own purchases" ON public.marketplace_purchases
  FOR SELECT USING (
    buyer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Creators can view sales" ON public.marketplace_purchases
  FOR SELECT USING (
    item_id IN (
      SELECT id FROM public.marketplace_items 
      WHERE creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Policies para wishlist
CREATE POLICY "Users can manage own wishlist" ON public.wishlist
  FOR ALL USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Policies para presale
CREATE POLICY "Users can view own presales" ON public.presale_orders
  FOR SELECT USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Creators can view presale orders" ON public.presale_orders
  FOR SELECT USING (
    item_id IN (
      SELECT id FROM public.marketplace_items 
      WHERE creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Função para comprar item do marketplace
CREATE OR REPLACE FUNCTION public.purchase_marketplace_item(
  p_item_id UUID,
  p_payment_method TEXT DEFAULT 'balance'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_id UUID;
  v_item RECORD;
  v_purchase_id UUID;
  v_transaction_id UUID;
  v_creator_amount DECIMAL;
  v_platform_fee DECIMAL;
  v_fee_percent DECIMAL;
BEGIN
  -- Get buyer profile
  SELECT id INTO v_buyer_id 
  FROM profiles 
  WHERE user_id = auth.uid();
  
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil não encontrado');
  END IF;

  -- Get item details
  SELECT * INTO v_item
  FROM marketplace_items
  WHERE id = p_item_id AND is_active = true;
  
  IF v_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item não encontrado ou inativo');
  END IF;

  -- Check if already purchased
  IF EXISTS (SELECT 1 FROM marketplace_purchases WHERE buyer_id = v_buyer_id AND item_id = p_item_id AND status = 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você já comprou este item');
  END IF;

  -- Check stock
  IF v_item.stock_limit IS NOT NULL AND v_item.sold_count >= v_item.stock_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item esgotado');
  END IF;

  -- For balance payment, check and deduct
  IF p_payment_method = 'balance' THEN
    IF (SELECT balance FROM profiles WHERE id = v_buyer_id) < v_item.price THEN
      RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente');
    END IF;
    
    -- Deduct from buyer
    UPDATE profiles SET balance = balance - v_item.price WHERE id = v_buyer_id;
  END IF;

  -- Get platform fee
  SELECT COALESCE((SELECT value::decimal FROM system_settings WHERE key = 'platform_fee_percentage'), 20)
  INTO v_fee_percent;
  
  v_platform_fee := v_item.price * (v_fee_percent / 100);
  v_creator_amount := v_item.price - v_platform_fee;

  -- Create transaction
  INSERT INTO transactions (user_id, amount, type, status, description, provider)
  VALUES (v_buyer_id, -v_item.price, 'marketplace_purchase', 'completed', 'Compra: ' || v_item.title, 'platform')
  RETURNING id INTO v_transaction_id;

  -- Create purchase record
  INSERT INTO marketplace_purchases (buyer_id, item_id, price_paid, payment_method, transaction_id, status)
  VALUES (v_buyer_id, p_item_id, v_item.price, p_payment_method, v_transaction_id, 
    CASE WHEN p_payment_method = 'balance' THEN 'completed' ELSE 'pending' END)
  RETURNING id INTO v_purchase_id;

  -- If paid with balance, credit creator
  IF p_payment_method = 'balance' THEN
    UPDATE profiles SET balance = balance + v_creator_amount WHERE id = v_item.creator_id;
    
    -- Record creator income
    INSERT INTO transactions (user_id, amount, type, status, description, provider)
    VALUES (v_item.creator_id, v_creator_amount, 'marketplace_sale', 'completed', 'Venda: ' || v_item.title, 'platform');
    
    -- Record split
    INSERT INTO payment_splits (transaction_external_id, total_amount, platform_fee, creator_amount, platform_fee_percent, creator_id)
    VALUES ('mkt_' || v_purchase_id::text, v_item.price, v_platform_fee, v_creator_amount, v_fee_percent, v_item.creator_id);
    
    -- Update sold count
    UPDATE marketplace_items SET sold_count = sold_count + 1 WHERE id = p_item_id;
  END IF;

  -- Remove from wishlist
  DELETE FROM wishlist WHERE user_id = v_buyer_id AND item_id = p_item_id;

  RETURN jsonb_build_object(
    'success', true, 
    'purchase_id', v_purchase_id,
    'status', CASE WHEN p_payment_method = 'balance' THEN 'completed' ELSE 'pending' END
  );
END;
$$;

-- Trigger para updated_at
CREATE TRIGGER update_marketplace_items_updated_at
  BEFORE UPDATE ON public.marketplace_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
