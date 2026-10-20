-- Restore legacy base schema on newly connected Cloud before dependent migrations.
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  name TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  inn TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  supplier TEXT,
  category TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  rating NUMERIC NOT NULL DEFAULT 0,
  image_id TEXT,
  status TEXT NOT NULL DEFAULT 'Активен',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Owners create products" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update products" ON public.products FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete products" ON public.products FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TABLE public.threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID NOT NULL,
  seller_id UUID,
  product_id UUID,
  company TEXT,
  stage TEXT NOT NULL DEFAULT 'Торг идёт',
  preview TEXT,
  last_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.threads TO authenticated;
GRANT ALL ON public.threads TO service_role;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view threads" ON public.threads FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Buyers create threads" ON public.threads FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Participants update threads" ON public.threads FOR UPDATE TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id) WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Buyers delete threads" ON public.threads FOR DELETE TO authenticated USING (auth.uid() = buyer_id);

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'me',
  text TEXT,
  offer_price TEXT,
  offer_term TEXT,
  offer_conditions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view messages" ON public.messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_id AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())));
CREATE POLICY "Participants add messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_id AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid())));

CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  thread_id UUID,
  title TEXT NOT NULL,
  counterparty TEXT,
  status TEXT NOT NULL DEFAULT 'Черновик',
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own documents" ON public.documents FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Anyone can view product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Authenticated users upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Owners manage their product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND auth.uid() = owner);
CREATE POLICY "Owners delete their product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND auth.uid() = owner);
CREATE TABLE public.trade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('buy','sell')),
  title text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra text,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_requests TO authenticated;
GRANT ALL ON public.trade_requests TO service_role;
ALTER TABLE public.trade_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in view requests" ON public.trade_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners create requests" ON public.trade_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update requests" ON public.trade_requests FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete requests" ON public.trade_requests FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE INDEX trade_requests_kind_idx ON public.trade_requests(kind, created_at DESC);
ALTER TABLE public.trade_requests ADD COLUMN response_to uuid REFERENCES public.trade_requests(id) ON DELETE SET NULL;
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users view own role, admins view all" ON public.user_roles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Current user's role (defaults to 'user')
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role FROM public.user_roles WHERE user_id = auth.uid()), 'user'::public.app_role)
$$;

-- First admin bootstrap: only works while no admin exists
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN RETURN false; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
$$;

-- Admin: list users with roles
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id uuid, email text, name text, company text, role public.app_role)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT p.user_id, p.email, p.name, p.company,
         COALESCE(r.role, 'user'::public.app_role)
  FROM public.profiles p LEFT JOIN public.user_roles r ON r.user_id = p.user_id
  ORDER BY p.created_at;
END $$;

-- Admin: assign role
CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _user_id = auth.uid() AND _role <> 'admin' THEN RAISE EXCEPTION 'Нельзя снять роль администратора с самого себя'; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END $$;

REVOKE EXECUTE ON FUNCTION public.claim_first_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_first_admin(), public.admin_list_users(), public.admin_set_role(uuid, public.app_role), public.my_role(), public.admin_exists() TO authenticated;

DROP POLICY IF EXISTS "Owners update requests" ON public.trade_requests;
DROP POLICY IF EXISTS "Owners delete requests" ON public.trade_requests;
CREATE POLICY "Owners or admins update requests" ON public.trade_requests
FOR UPDATE TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners or admins delete requests" ON public.trade_requests
FOR DELETE TO authenticated
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_role() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_exists() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
ALTER TABLE public.trade_requests
  ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN product_snapshot jsonb;
CREATE INDEX trade_requests_product_id_idx ON public.trade_requests(product_id);

CREATE OR REPLACE FUNCTION public.trade_request_snapshot_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.product_id IS DISTINCT FROM OLD.product_id) THEN
    SELECT jsonb_build_object('title', p.title, 'description', p.description,
             'category', p.category, 'unit', p.unit, 'supplier', p.supplier,
             'captured_at', now())
      INTO NEW.product_snapshot FROM public.products p WHERE p.id = NEW.product_id;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.product_snapshot := OLD.product_snapshot;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trade_requests_snapshot BEFORE INSERT OR UPDATE ON public.trade_requests
  FOR EACH ROW EXECUTE FUNCTION public.trade_request_snapshot_product();

CREATE OR REPLACE FUNCTION public.products_lock_after_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.title, NEW.description, NEW.category, NEW.unit, NEW.supplier)
       IS DISTINCT FROM (OLD.title, OLD.description, OLD.category, OLD.unit, OLD.supplier)
     AND EXISTS (SELECT 1 FROM public.trade_requests r WHERE r.product_id = OLD.id) THEN
    RAISE EXCEPTION 'PRODUCT_LOCKED: по товару уже есть заявки — название и характеристики изменить нельзя';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_lock BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_lock_after_request();

CREATE OR REPLACE FUNCTION public.product_request_counts(_ids uuid[])
RETURNS TABLE(product_id uuid, cnt bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.product_id, count(*) FROM public.trade_requests r WHERE r.product_id = ANY(_ids) GROUP BY r.product_id
$$;
REVOKE EXECUTE ON FUNCTION public.product_request_counts(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.product_request_counts(uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trade_request_snapshot_product() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.products_lock_after_request() FROM anon, public, authenticated;