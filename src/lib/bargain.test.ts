// @ts-expect-error — bun:test types are provided by the bun runtime (run: bun test)
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

test("в споре по значению приоритет определяет меру уступки: 80 против 30 — середина шкалы", () => {
  const b = emptyParams(), s = emptyParams();
  b.payment = { ...b.payment, value: "постоплата", priority: 80 };
  s.payment = { ...s.payment, value: "100% предоплата", priority: 30 };
  expect(bargain(b, s).terms.find((x) => x.key === "payment")!.value).toBe("50/50");
});

test("предложение выгоднее собственного принимается автоматически даже при высоком приоритете", () => {
  const b = emptyParams(), s = emptyParams();
  b.payment = { ...b.payment, value: "100% предоплата", priority: 90 };
  s.payment = { ...s.payment, value: "постоплата", priority: 10 };
  const t = bargain(b, s).terms.find((x) => x.key === "payment")!;
  expect(t.value).toBe("постоплата");
  expect(t.buyerOk && t.sellerOk).toBe(true);
});

test("количество: высокий приоритет покупателя сдвигает объём к верхнему краю общей зоны", () => {
  const b = emptyParams(), s = emptyParams();
  b.qty = { ...b.qty, min: "10", max: "100", priority: 90 };
  s.qty = { ...s.qty, min: "50", max: "200", priority: 10 };
  expect(bargain(b, s).terms.find((x) => x.key === "qty")!.value).toBe("95");
});

test("непересекающиеся цены требуют согласия людей", () => {
  const b = emptyParams(), s = emptyParams();
  b.price = { ...b.price, min: "50", max: "90" };
  s.price = { ...s.price, min: "100", max: "150" };
  const r = bargain(b, s);
  expect(r.agreed).toBe(false);
});
