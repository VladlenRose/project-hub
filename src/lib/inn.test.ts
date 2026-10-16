import { expect, test } from "bun:test";
import { isValidInn } from "./inn";

test("валидный ИНН юрлица (Сбербанк)", () => expect(isValidInn("7707083893")).toBe(true));
test("валидный ИНН из 12 цифр", () => expect(isValidInn("500100732259")).toBe(true));
test("неверная контрольная цифра", () => expect(isValidInn("7707083894")).toBe(false));
test("неверная длина", () => expect(isValidInn("12345")).toBe(false));
