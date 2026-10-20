// @ts-expect-error Bun provides test types at runtime.
import { expect, test } from "bun:test";
import { emptyParams } from "./bargain";
import { acceptCondition, humansAgreed, initialNegotiation, proposeCondition } from "./negotiation";

function setup() {
  const b = emptyParams(), s = emptyParams();
  b.price = { ...b.price, min: "100", max: "200", priority: 80 };
  s.price = { ...s.price, min: "100", max: "200", priority: 20 };
  b.payment.value = s.payment.value = "постоплата";
  return initialNegotiation(b, s);
}
test("приоритет 80 против 20 сдвигает цену общей зоны 100–200 к покупателю: 120", () => {
  expect(setup().conditions.find((c) => c.key === "price")?.term?.value).toBe("120 ₽");
});
test("встречное условие меняет только выбранный параметр, сохраняет приоритет и остальные согласия", () => {
  const initial = acceptCondition(setup(), "buyer", "payment");
  const next = proposeCondition(initial, "buyer", "price", { min: "110", max: "150", unit: "", value: "" });
  expect(next.buyer.price.priority).toBe(80);
  expect(next.buyer.price.max).toBe("150");
  expect(next.seller).toEqual(initial.seller);
  expect(next.conditions.find((c) => c.key === "payment")).toEqual(initial.conditions.find((c) => c.key === "payment"));
  expect(next.conditions.find((c) => c.key === "price")?.term?.value).toBe("118 ₽");
});
test("новое предложение сбрасывает согласие обеих сторон только по изменённому пункту", () => {
  let state = acceptCondition(acceptCondition(setup(), "buyer", "price"), "seller", "price");
  state = proposeCondition(state, "seller", "price", { min: "120", max: "200", unit: "", value: "" });
  const c = state.conditions.find((item) => item.key === "price");
  expect(c?.buyerAccepted).toBe(false);
  expect(c?.sellerAccepted).toBe(false);
});
test("боты не дают согласие за людей; подтверждение одной стороны не означает согласие обеих", () => {
  let state = setup();
  expect(humansAgreed(state)).toBe(false);
  for (const key of ["price", "payment"] as const) state = acceptCondition(state, "buyer", key);
  expect(humansAgreed(state)).toBe(false);
  for (const key of ["price", "payment"] as const) state = acceptCondition(state, "seller", key);
  expect(humansAgreed(state)).toBe(true);
});
test("невалидный диапазон не отправляется", () => {
  expect(() => proposeCondition(setup(), "buyer", "price", { min: "200", max: "100", unit: "", value: "" })).toThrow();
});