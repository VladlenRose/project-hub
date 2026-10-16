import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  product: z.string().default("товар"),
  supplier: z.string().default("поставщик"),
  price: z.number().default(0),
  stage: z.string().default("Торг идёт"),
  history: z
    .array(z.object({ author: z.enum(["me", "agent"]), text: z.string() }))
    .max(30)
    .default([]),
});

export type AgentReply = {
  text: string;
  stage: "Торг идёт" | "Согласовано" | "Документы готовы";
  offer?: { price: string; term: string; conditions: string } | null;
};

/** ИИ-агент продавца: ведёт торг и формирует предложение. */
export const negotiate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<AgentReply> => {
    
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const system = `Ты — ИИ-агент продавца на B2B-маркетплейсе AI-Mall.
Товар: ${data.product}. Поставщик: ${data.supplier}. Базовая цена: ${data.price} ₽.
Текущий статус переговоров: ${data.stage}.
Веди деловой торг по-русски, кратко (1-3 предложения). Можешь давать скидку до 12% при объёме.
Верни СТРОГО JSON без markdown:
{"text": "ответ покупателю", "stage": "Торг идёт" | "Согласовано" | "Документы готовы", "offer": {"price":"...","term":"...","conditions":"..."} | null}
Ставь stage "Согласовано", только когда условия действительно приняты обеими сторонами.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          ...data.history.map((m) => ({
            role: m.author === "me" ? ("user" as const) : ("assistant" as const),
            content: m.text,
          })),
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`AI gateway error ${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned) as AgentReply;
      return {
        text: parsed.text || "Уточняю условия у поставщика.",
        stage: parsed.stage ?? "Торг идёт",
        offer: parsed.offer ?? null,
      };
    } catch {
      return { text: cleaned || "Уточняю условия у поставщика.", stage: "Торг идёт", offer: null };
    }
  });

/** ИИ только пересказывает итог детерминированного торга человеческим языком. */
export const describeDeal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        title: z.string().max(300),
        agreed: z.boolean(),
        terms: z.array(z.object({ label: z.string(), value: z.string(), note: z.string() })).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const list = data.terms.map((t) => `- ${t.label}: ${t.value} (${t.note})`).join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Ты — деловой ассистент B2B-площадки. Перескажи итог переговоров ботов покупателя и продавца по-русски, 2-4 предложения, без markdown. Не меняй цифры и условия.",
          },
          {
            role: "user",
            content: `Сделка: ${data.title}\nСтатус: ${data.agreed ? "все условия устраивают обе стороны" : "есть пункты, требующие согласия"}\n${list}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { text: json.choices?.[0]?.message?.content?.trim() ?? "" };
  });
