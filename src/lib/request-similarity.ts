import { titleSimilarity, type TradeRequest } from "./bargain";

export const canBargain = (similarity: number) => similarity >= 0.5;

export function requestSimilarity(a: TradeRequest, b: TradeRequest, semantic?: number) {
  if (a.product_id && a.product_id === b.product_id) return 1;
  if (semantic !== undefined && Number.isFinite(semantic)) return semantic;
  return titleSimilarity(a, b);
}