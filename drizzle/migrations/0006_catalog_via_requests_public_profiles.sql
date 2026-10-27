DROP POLICY IF EXISTS "Owners create products" ON public.products;

CREATE OR REPLACE FUNCTION public.public_profiles(_ids uuid[])
RETURNS TABLE(user_id uuid, name text, company text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id, p.name, p.company FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.user_id = ANY(_ids)
$$;
REVOKE EXECUTE ON FUNCTION public.public_profiles(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.public_profiles(uuid[]) TO authenticated;