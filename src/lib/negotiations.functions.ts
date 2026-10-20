import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withDefaults } from "./bargain";
import { acceptCondition, conditionValuesSchema, initialNegotiation, paramKeySchema, proposeCondition, type NegotiationSnapshot } from "./negotiation";
import type { Json } from "@/integrations/supabase/types";

const pairSchema = z.object({ buyerId: z.string().uuid(), sellerId: z.string().uuid() });
export const openNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pairSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("trade_requests").select("id,owner_id,kind,params").in("id", [data.buyerId, data.sellerId]);
    if (error) throw new Error("Не удалось прочитать заявки.");
    const buyer = rows?.find((r) => r.id === data.buyerId && r.kind === "buy");
    const seller = rows?.find((r) => r.id === data.sellerId && r.kind === "sell");
    if (!buyer || !seller || buyer.owner_id === seller.owner_id || ![buyer.owner_id, seller.owner_id].includes(context.userId)) throw new Error("Нет доступа к этим переговорам.");
    // Atomic cross-participant write; actor is verified above, never taken from client input.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: writeError } = await supabaseAdmin.rpc("open_request_negotiation", {
      _buyer: buyer.id, _seller: seller.id, _actor: context.userId,
      _snapshot: initialNegotiation(withDefaults(buyer.params as never), withDefaults(seller.params as never)) as unknown as Json,
    });
    if (writeError || !row) throw new Error("Не удалось открыть переговоры.");
    return row;
  });

export const changeNegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), version: z.number().int().positive(), action: z.enum(["propose", "accept"]), key: paramKeySchema, values: conditionValuesSchema.optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("request_negotiations").select("*").eq("id", data.id).single();
    if (error || !row || ![row.buyer_id, row.seller_id].includes(context.userId)) throw new Error("Нет доступа к переговорам.");
    if (row.version !== data.version) throw new Error("Условия уже изменились. Обновите переговоры и проверьте новую версию.");
    const snapshot = row.snapshot as unknown as NegotiationSnapshot;
    const side = row.buyer_id === context.userId ? "buyer" : "seller";
    if (data.action === "propose" && !data.values) throw new Error("Укажите условие.");
    const next = data.action === "propose" && data.values ? proposeCondition(snapshot, side, data.key, data.values) : acceptCondition(snapshot, side, data.key);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error: writeError } = await supabaseAdmin.rpc("commit_request_negotiation", { _id: row.id, _expected: data.version, _actor: context.userId, _action: data.action, _key: data.key, _snapshot: next as unknown as Json });
    if (writeError || !saved) throw new Error("Условия могли измениться. Обновите переговоры перед отправкой.");
    return saved;
  });