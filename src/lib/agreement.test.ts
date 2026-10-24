// @ts-expect-error Bun provides runtime test types.
import { expect, test } from "bun:test";
import { agreementPercent, agreementZone, conditionPercent, TOLERANCES } from "./agreement";
import { emptyParams } from "./bargain";
import { acceptCondition, humansAgreed, initialNegotiation, type NegotiationSnapshot } from "./negotiation";
import { canBargain } from "./request-similarity";

function pending(key: "price" | "qty" | "term" | "warranty" | "payment", own: string, value: string, numericValue?: number): NegotiationSnapshot {
  const buyer = emptyParams(), seller = emptyParams();
  buyer[key] = { ...buyer[key], min: own, max: own, value: own };
  seller[key] = { ...seller[key], min: own, max: own, value: own };
  return { buyer, seller, conditions: [{ key, buyerAccepted: false, sellerAccepted: false, log: [], term: { key, value, ...(numericValue === undefined ? {} : { numericValue }), buyerOk: false, sellerOk: false, note: "" } }] };
}
test("цена и количество: 20% расхождения дают 0%, 10% дают 50%", () => {
  expect(TOLERANCES.price).toBe(0.2); expect(TOLERANCES.qty).toBe(0.2);
  for (const key of ["price", "qty"] as const) { expect(agreementPercent(pending(key, "100", "120", 120))).toBe(0); expect(agreementPercent(pending(key, "100", "110", 110))).toBe(50); }
});
test("срок: 7 дней дают 0%", () => { expect(TOLERANCES.term).toBe(7); expect(agreementPercent(pending("term", "10", "17", 17))).toBe(0); });
test("гарантия: 3 месяца дают 0%", () => { expect(TOLERANCES.warranty).toBe(3); expect(agreementPercent(pending("warranty", "12 мес", "9 мес"))).toBe(0); });
test("текст: два шага дают 0%, один шаг 50%", () => { expect(TOLERANCES.text).toBe(2); expect(agreementPercent(pending("payment", "постоплата", "предоплата"))).toBe(0); expect(agreementPercent(pending("payment", "постоплата", "50/50"))).toBe(50); });
test("границы светофора: 30 жёлтый, 80 зелёный", () => { expect(agreementZone(29)).toBe("red"); expect(agreementZone(30)).toBe("yellow"); expect(agreementZone(79)).toBe("yellow"); expect(agreementZone(80)).toBe("green"); expect(agreementZone(100)).toBe("green"); });
test("100% ботов не разрешают договор без подтверждений обоих людей", () => {
  const b = emptyParams(), s = emptyParams(); b.price.min = s.price.min = "100"; b.price.max = s.price.max = "200";
  const state = initialNegotiation(b,s); expect(agreementPercent(state)).toBe(100); expect(humansAgreed(state)).toBe(false);
  const one = acceptCondition(state,"buyer","price"); expect(humansAgreed(one)).toBe(false); expect(humansAgreed(acceptCondition(one,"seller","price"))).toBe(true);
});
test("только согласованные пункты могут дать ровно 100%", () => { const state = pending("price", "100", "100", 100); const c = state.conditions[0]; if (!c) throw new Error("Missing condition"); expect(conditionPercent(state,c)).toBe(99); });
test("товары менее 50% сходства не запускают торг", () => { expect(canBargain(0.49)).toBe(false); expect(canBargain(0.5)).toBe(true); });
test("высокий приоритет удерживает текстовое условие, выгодное принимается", () => {
 const b = emptyParams(), s = emptyParams(); b.payment.value="постоплата"; s.payment.value="предоплата"; b.payment.priority=s.payment.priority=100;
 const c = initialNegotiation(b,s).conditions.find(c=>c.key==="payment"); expect(c?.term?.buyerOk).toBe(false); expect(c?.term?.sellerOk).toBe(false);
 s.payment.value="постоплата"; expect(initialNegotiation(b,s).conditions.find(c=>c.key==="payment")?.term?.buyerOk).toBe(true);
});