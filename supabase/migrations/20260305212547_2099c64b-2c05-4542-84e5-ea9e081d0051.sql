
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS address_street text,
ADD COLUMN IF NOT EXISTS address_number text,
ADD COLUMN IF NOT EXISTS address_complement text,
ADD COLUMN IF NOT EXISTS address_neighborhood text,
ADD COLUMN IF NOT EXISTS address_city text,
ADD COLUMN IF NOT EXISTS address_state text,
ADD COLUMN IF NOT EXISTS address_cep text,
ADD COLUMN IF NOT EXISTS address_lat double precision,
ADD COLUMN IF NOT EXISTS address_lng double precision,
ADD COLUMN IF NOT EXISTS address_verified boolean DEFAULT false;
