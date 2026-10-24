ALTER TABLE public.documents ADD COLUMN negotiation_id uuid REFERENCES public.request_negotiations(id), ADD COLUMN negotiation_version integer;
CREATE UNIQUE INDEX documents_negotiation_owner_version ON public.documents(negotiation_id,owner_id,negotiation_version);
CREATE OR REPLACE FUNCTION public.create_negotiation_contract(_id uuid, _expected integer, _actor uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n public.request_negotiations; d uuid; body_text text;
BEGIN
 SELECT * INTO n FROM public.request_negotiations WHERE id=_id FOR UPDATE;
 IF n.id IS NULL OR _actor NOT IN(n.buyer_id,n.seller_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF n.version<>_expected THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(n.snapshot->'conditions') c WHERE c->'term'<>'null'::jsonb) OR EXISTS(SELECT 1 FROM jsonb_array_elements(n.snapshot->'conditions') c WHERE c->'term'<>'null'::jsonb AND (COALESCE((c->>'buyerAccepted')::boolean,false)=false OR COALESCE((c->>'sellerAccepted')::boolean,false)=false)) THEN RAISE EXCEPTION 'NOT_AGREED'; END IF;
 SELECT 'ЧЕРНОВИК ДОГОВОРА — НЕ ПОДПИСАН' || E'\nПереговоры: ' || n.id || E'\nВерсия: ' || n.version || E'\nПокупатель: ' || n.buyer_id || E'\nПродавец: ' || n.seller_id || E'\n\nСогласованные условия:\n' || string_agg((c->>'key') || ': ' || (c->'term'->>'value'), E'\n') INTO body_text FROM jsonb_array_elements(n.snapshot->'conditions') c WHERE c->'term'<>'null'::jsonb;
 INSERT INTO public.documents(owner_id,title,counterparty,status,body,negotiation_id,negotiation_version) SELECT u,'Договор · версия '||n.version,CASE WHEN u=n.buyer_id THEN n.seller_id::text ELSE n.buyer_id::text END,'Черновик',body_text,n.id,n.version FROM unnest(ARRAY[n.buyer_id,n.seller_id]) u ON CONFLICT(negotiation_id,owner_id,negotiation_version) DO NOTHING;
 SELECT id INTO d FROM public.documents WHERE negotiation_id=n.id AND owner_id=_actor AND negotiation_version=n.version;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.create_negotiation_contract(uuid,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_negotiation_contract(uuid,integer,uuid) TO service_role;