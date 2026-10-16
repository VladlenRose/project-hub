import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isValidInn } from "./inn";

export type InnCheck =
  | { status: "invalid" }
  | { status: "not_found" }
  | { status: "unchecked" } // онлайн-сервис не подключён или недоступен
  | { status: "found"; name: string; active: boolean };

// Онлайн-проверка ИНН через DaData (бесплатный тариф). Без ключа — только контрольная сумма.
export const checkInn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ inn: z.string().trim().max(12) }).parse(d))
  .handler(async ({ data }): Promise<InnCheck> => {
    if (!isValidInn(data.inn)) return { status: "invalid" };
    const key = process.env["DADATA_API_KEY"];
    if (!key) return { status: "unchecked" };
    try {
      const res = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party", {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: data.inn }),
      });
      if (!res.ok) {
        console.error("DaData", res.status, await res.text());
        return { status: "unchecked" };
      }
      const s = (await res.json())?.suggestions?.[0];
      if (!s) return { status: "not_found" };
      return { status: "found", name: String(s.value ?? ""), active: s.data?.state?.status === "ACTIVE" };
    } catch (e) {
      console.error("DaData", e);
      return { status: "unchecked" };
    }
  });
