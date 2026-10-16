import { expect, test } from "bun:test";
import { bargain, emptyParams } from "./bargain";

test("при равных ценовых диапазонах и равном приоритете цена посередине общей зоны", () => {
  const b = emptyParams(), s = emptyParams();
  b.price = { ...b.price, min: "100", max: "200" };
  s.price = { ...s.price, min: "100", max: "200" };
  const t = bargain(b, s).terms.find((x) => x.key === "price")!;
  expect(t.value).toBe("150 ₽");
  expect(t.buyerOk && t.sellerOk).toBe(true);
});

test("в споре по значению уступает сторона с меньшим приоритетом", () => {
  const b = emptyParams(), s = emptyParams();
  b.payment = { ...b.payment, value: "постоплата", priority: 80 };
  s.payment = { ...s.payment, value: "100% предоплата", priority: 30 };
  expect(bargain(b, s).terms.find((x) => x.key === "payment")!.value).toBe("постоплата");
});

test("непересекающиеся цены требуют согласия людей", () => {
  const b = emptyParams(), s = emptyParams();
  b.price = { ...b.price, min: "50", max: "90" };
  s.price = { ...s.price, min: "100", max: "150" };
  const r = bargain(b, s);
  expect(r.agreed).toBe(false);
});
