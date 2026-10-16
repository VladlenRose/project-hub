import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Голосовой ввод: распознавание речи через Groq Whisper тем же ключом, что и OCR.
export const transcribeVoice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      audio: z.string().regex(/^data:audio\/[a-z0-9.+-]+(;[^,]*)?;base64,/i).max(20_000_000),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ text: string }> => {
    const key1 = process.env["GROQ_API_KEY1"];
    const key2 = process.env["GROQ_API_KEY2"];
    if (!key1 || !key2) throw new Error("Не заданы GROQ_API_KEY1 или GROQ_API_KEY2");

    const [head = "", b64 = ""] = data.audio.split(",");
    const mime = head.slice(5).split(";")[0] || "audio/webm";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), `voice.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "ru");
    form.append("response_format", "json");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key1 + key2}` },
      body: form,
    });
    if (!res.ok) {
      let msg = "";
      try { msg = (await res.json())?.error?.message ?? ""; } catch { /* ignore */ }
      if (res.status === 429) throw new Error("Слишком много запросов, попробуйте через минуту");
      throw new Error(msg || `Сервис распознавания речи недоступен (${res.status})`);
    }
    const json = await res.json();
    return { text: String(json?.text ?? "").trim() };
  });
