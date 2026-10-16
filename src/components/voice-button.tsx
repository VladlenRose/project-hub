import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { transcribeVoice } from "@/lib/voice.functions";

export function VoiceButton({ onText, disabled }: { onText: (t: string) => void; disabled?: boolean }) {
  const transcribe = useServerFn(transcribeVoice);
  const [state, setState] = useState<"idle" | "rec" | "busy">("idle");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        if (!blob.size) { setState("idle"); return; }
        setState("busy");
        try {
          const audio = await new Promise<string>((ok, fail) => {
            const r = new FileReader();
            r.onload = () => ok(String(r.result));
            r.onerror = fail;
            r.readAsDataURL(blob);
          });
          const { text } = await transcribe({ data: { audio } });
          if (text) onText(text); else toast.error("Речь не распознана");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Не удалось распознать речь");
        } finally {
          setState("idle");
        }
      };
      mr.start();
      rec.current = mr;
      setState("rec");
    } catch {
      toast.error("Нет доступа к микрофону");
    }
  }

  return (
    <Button
      variant={state === "rec" ? "destructive" : "outline"}
      disabled={disabled || state === "busy"}
      onClick={() => (state === "rec" ? rec.current?.stop() : void start())}
    >
      {state === "busy" ? <Loader2 className="size-4 animate-spin" /> : state === "rec" ? <Square className="size-4" /> : <Mic className="size-4" />}
      {state === "busy" ? "Распознаю…" : state === "rec" ? "Остановить" : "Голосом"}
    </Button>
  );
}
