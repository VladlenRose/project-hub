import { scaleRank, warrantyMonths, type Param, type ParamKey, type Term } from "./bargain";
import type { Condition, NegotiationSnapshot } from "./negotiation";

export const TOLERANCES = { price: 0.2, qty: 0.2, term: 7, warranty: 3, text: 2 } as const;
export const agreementZone = (percent: number) => percent >= 80 ? "green" : percent >= 30 ? "yellow" : "red";

function closeness(key: ParamKey, p: Param, term: Term): number {
  if (p.ignore) return 100;
  let distance: number, tolerance: number;
  if (["price", "qty", "term"].includes(key)) {
    const value = term.numericValue;
    const lo = Number(p.min || p.max), hi = Number(p.max || p.min);
    if (value === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) return 0;
    const edge = value < lo ? lo : hi;
    distance = Math.abs(value - edge);
    tolerance = key === "term" ? TOLERANCES.term : Math.abs(edge) * TOLERANCES[key === "price" ? "price" : "qty"];
  } else if (key === "warranty") {
    const own = warrantyMonths(p.value), value = warrantyMonths(term.value);
    if (own === null || value === null) return 0;
    distance = Math.abs(own - value); tolerance = TOLERANCES.warranty;
  } else {
    const own = scaleRank(key, p.value), value = scaleRank(key, term.value);
    if (!own || !value) return 0;
    distance = Math.abs(own.rank - value.rank); tolerance = TOLERANCES.text;
  }
  // Tolerances measure proximity only; never authorize crossing a hard bound.
  return tolerance > 0 ? Math.min(99, Math.max(0, 100 * (1 - distance / tolerance))) : 0;
}

export function conditionPercent(snapshot: NegotiationSnapshot, c: Condition): number | null {
  if (!c.term) return null;
  const buyer = c.buyerAccepted || c.term.buyerOk ? 100 : closeness(c.key, snapshot.buyer[c.key], c.term);
  const seller = c.sellerAccepted || c.term.sellerOk ? 100 : closeness(c.key, snapshot.seller[c.key], c.term);
  return Math.floor(Math.min(buyer, seller));
}

export function agreementPercent(snapshot: NegotiationSnapshot): number {
  const scores = snapshot.conditions.flatMap(c => { const score = conditionPercent(snapshot, c); return score === null ? [] : [score]; });
  return scores.length ? Math.floor(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
}