CREATE TABLE public.request_negotiations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_request_id uuid NOT NULL REFERENCES public.trade_requests(id), seller_request_id uuid NOT NULL REFERENCES public.trade_requests(id), buyer_id uuid NOT NULL, seller_id uuid NOT NULL, version integer NOT NULL DEFAULT 1, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(buyer_request_id,seller_request_id), CHECK(buyer_id <> seller_id)
);
GRANT SELECT ON public.request_negotiations TO authenticated;
GRANT ALL ON public.request_negotiations TO service_role;
ALTER TABLE public.request_negotiations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read negotiations" ON public.request_negotiations FOR SELECT TO authenticated USING(auth.uid() IN (buyer_id,seller_id));
CREATE TABLE public.negotiation_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), negotiation_id uuid NOT NULL REFERENCES public.request_negotiations(id), version integer NOT NULL, actor_id uuid NOT NULL, action text NOT NULL, param_key text, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(negotiation_id,version)
);
GRANT SELECT ON public.negotiation_versions TO authenticated;
GRANT ALL ON public.negotiation_versions TO service_role;
ALTER TABLE public.negotiation_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read versions" ON public.negotiation_versions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.request_negotiations n WHERE n.id=negotiation_id AND auth.uid() IN(n.buyer_id,n.seller_id)));
CREATE FUNCTION public.open_request_negotiation(_buyer uuid,_seller uuid,_actor uuid,_snapshot jsonb) RETURNS public.request_negotiations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.trade_requests; s public.trade_requests; n public.request_negotiations;
BEGIN
 SELECT * INTO b FROM public.trade_requests WHERE id=_buyer;
 SELECT * INTO s FROM public.trade_requests WHERE id=_seller;
 IF b.kind IS DISTINCT FROM 'buy' OR s.kind IS DISTINCT FROM 'sell' OR b.owner_id=s.owner_id OR _actor NOT IN(b.owner_id,s.owner_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 INSERT INTO public.request_negotiations(buyer_request_id,seller_request_id,buyer_id,seller_id,snapshot) VALUES(_buyer,_seller,b.owner_id,s.owner_id,_snapshot) ON CONFLICT(buyer_request_id,seller_request_id) DO NOTHING RETURNING * INTO n;
 IF n.id IS NOT NULL THEN INSERT INTO public.negotiation_versions(negotiation_id,version,actor_id,action,snapshot) VALUES(n.id,1,_actor,'start',_snapshot); ELSE SELECT * INTO n FROM public.request_negotiations WHERE buyer_request_id=_buyer AND seller_request_id=_seller; END IF;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.open_request_negotiation(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_request_negotiation(uuid,uuid,uuid,jsonb) TO service_role;
CREATE FUNCTION public.commit_request_negotiation(_id uuid,_expected integer,_actor uuid,_action text,_key text,_snapshot jsonb) RETURNS public.request_negotiations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n public.request_negotiations;
BEGIN
 SELECT * INTO n FROM public.request_negotiations WHERE id=_id FOR UPDATE;
 IF n.id IS NULL OR _actor NOT IN(n.buyer_id,n.seller_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF n.version<>_expected THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 UPDATE public.request_negotiations SET snapshot=_snapshot,version=version+1,updated_at=now() WHERE id=_id RETURNING * INTO n;
 INSERT INTO public.negotiation_versions(negotiation_id,version,actor_id,action,param_key,snapshot) VALUES(n.id,n.version,_actor,_action,_key,_snapshot);
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.commit_request_negotiation(uuid,integer,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_request_negotiation(uuid,integer,uuid,text,text,jsonb) TO service_role;