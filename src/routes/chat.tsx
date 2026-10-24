import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Handshake, Loader2, Send, User } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { NegotiationCards } from "@/components/negotiation-cards";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { negotiate } from "@/lib/ai.functions";
import {


  withDefaults,
  type TradeRequest,
} from "@/lib/bargain";
import { AgreementBadge } from "@/components/agreement-badge";
import { agreementPercent } from "@/lib/agreement";
import { canBargain, requestSimilarity } from "@/lib/request-similarity";
import type { NegotiationSnapshot } from "@/lib/negotiation";
import { cn } from "@/lib/utils";

const TITLE = "Переговоры ИИ-агентов по заявкам — AI-Mall";
const DESCRIPTION =
  "Выберите свою заявку: агенты найдут встречные заявки, проведут торг по приоритетам и предложат условия обеим сторонам.";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Chat,
});

type Mode = "bots" | "agent";

async function loadRequests(): Promise<TradeRequest[]> {
  const { data, error } = await supabase
    .from("trade_requests")
    .select("id, owner_id, kind, title, params, product_id, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, kind: r.kind as TradeRequest["kind"], params: withDefaults(r.params as never) }));
}

const kindLabel = (k: string) => (k === "buy" ? "Покупка" : "Продажа");

function Chat() {
  const { user } = useAuth();
  const [myId, setMyId] = useState<string | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("bots");

  const reqQuery = useQuery({ queryKey: ["trade_requests_all"], queryFn: loadRequests, enabled: !!user });
  const all = reqQuery.data ?? [];
  const mine = all.filter((r) => r.owner_id === user?.id);
  const my = mine.find((r) => r.id === myId) ?? null;

  const saved = useQuery({ queryKey: ["chat-negotiation-results", user?.id], enabled: !!user, refetchInterval: 10000, queryFn: async () => {
    const { data, error } = await supabase.from("request_negotiations").select("buyer_request_id,seller_request_id,snapshot");
    if (error) throw error;
    return data ?? [];
  } });
  const similarities = useQuery({ queryKey: ["chat-similarities", my?.product_id, all.map(r => r.product_id)], enabled: !!my?.product_id, queryFn: async () => {
    if (!my?.product_id) return {} as Record<string, number>;
    const ids = all.flatMap(r => r.product_id ? [r.product_id] : []);
    const { data, error } = await supabase.rpc("product_pair_similarity", { _ref: my.product_id, _ids: ids });
    if (error) throw error;
    return Object.fromEntries((data ?? []).map(r => [r.product_id, r.similarity]));
  } });
  const matches = useMemo(() => {
    if (!my) return [];
    return all
      .filter((r) => r.kind !== my.kind && r.owner_id !== my.owner_id)
      .filter(r => canBargain(requestSimilarity(my, r, r.product_id ? similarities.data?.[r.product_id] : undefined)))
      .map((r) => ({ r, result: saved.data?.find(n => n.buyer_request_id === (my.kind === "buy" ? my.id : r.id) && n.seller_request_id === (my.kind === "sell" ? my.id : r.id)) }));
  }, [all, my, saved.data, similarities.data]);
  const other = matches.find((m) => m.r.id === otherId)?.r ?? null;

  return (
    <AppShell title="Чат-переговоры">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1. мои заявки */}
        <aside className="glass-panel h-fit overflow-hidden rounded-2xl">
          <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-dim">Мои заявки</div>
          {reqQuery.isLoading ? (
            <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-brand" /></div>
          ) : mine.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-dim">
              У вас нет заявок. <Link to="/requests" className="text-brand underline">Создайте заявку</Link>.
            </p>
          ) : (
            mine.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setMyId(r.id); setOtherId(null); }}
                className={cn(
                  "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left last:border-0",
                  r.id === myId ? "bg-brand/6" : "hover:bg-foreground/4",
                )}
              >
                <span className="truncate text-sm font-medium text-ink">{r.title}</span>
                <span className="text-xs text-dim">{kindLabel(r.kind)}</span>
              </button>
            ))
          )}
        </aside>

        {/* 2. соответствия */}
        <aside className="glass-panel h-fit overflow-hidden rounded-2xl">
          <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-dim">
            {my ? (my.kind === "buy" ? "Подходящие продавцы" : "Подходящие покупатели") : "Соответствия"}
          </div>
          {!my ? (
            <p className="px-4 py-8 text-center text-sm text-dim">Выберите свою заявку слева.</p>
          ) : matches.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-dim">Встречных заявок пока нет.</p>
          ) : (
            matches.map(({ r, result }) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setOtherId(r.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b border-border px-4 py-3 text-left last:border-0",
                  r.id === otherId ? "bg-brand/6" : "hover:bg-foreground/4",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                  <span className="text-xs text-dim">{kindLabel(r.kind)}</span>
                </span>
                <span className="shrink-0">{result ? <AgreementBadge percent={agreementPercent(result.snapshot as unknown as NegotiationSnapshot)} /> : <span className="text-xs text-dim">Торг не начат</span>}</span>
              </button>
            ))
          )}
        </aside>

        {/* 3. переговоры */}
        <section className="flex min-h-[70vh] min-w-0 flex-col overflow-hidden border-t border-border sm:col-span-2">
          {!my || !other ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-dim">
              Выберите свою заявку и встречную — агенты проведут торг по вашим приоритетам.
            </div>
          ) : (
            <>
              <header className="border-b border-border px-6 py-4">
                <div className="text-sm font-semibold text-ink">{my.title} ⇄ {other.title}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ModeBtn active={mode === "bots"} onClick={() => setMode("bots")} icon={Handshake}>Торг ботов</ModeBtn>
                  <ModeBtn active={mode === "agent"} onClick={() => setMode("agent")} icon={Bot}>Написать агенту</ModeBtn>
                  <ModeBtn active={false} disabled icon={User}>Написать человеку · скоро</ModeBtn>
                </div>
              </header>
              {mode === "bots" ? (
                <NegotiationCards key={my.id + other.id} my={my} other={other} />
              ) : (
                <AgentChat key={my.id + other.id + "a"} my={my} other={other} />
              )}
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ModeBtn({ active, onClick, disabled, icon: Icon, children }: {
  active: boolean; onClick?: () => void; disabled?: boolean; icon: typeof Bot; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs transition-colors disabled:opacity-50",
        active ? "bg-brand text-brand-foreground" : "text-dim hover:text-ink",
      )}
    >
      <Icon className="size-3.5" /> {children}
    </button>
  );
}

function AgentChat({ my, other }: { my: TradeRequest; other: TradeRequest }) {
  const run = useServerFn(negotiate);
  const [msgs, setMsgs] = useState<{ author: "me" | "agent"; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const price = Number(other.params.price.max || other.params.price.min || 0);
  const send = useMutation({
    mutationFn: async (text: string) => {
      const history = [...msgs, { author: "me" as const, text }];
      setMsgs(history);
      const reply = await run({
        data: { product: other.title, supplier: `агент заявки «${other.title}»`, price, stage: "Торг идёт", history },
      });
      setMsgs([...history, { author: "agent", text: reply.text }]);
    },
    onError: () => toast.error("Агент недоступен, попробуйте ещё раз"),
  });
  const submit = () => {
    const t = draft.trim();
    if (!t || send.isPending) return;
    setDraft("");
    send.mutate(t);
  };
  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto p-6">
        <p className="text-xs text-dim">
          Вы общаетесь с ИИ-агентом владельца заявки «{other.title}» ({kindLabel(other.kind).toLowerCase()}). Ваша заявка: «{my.title}».
        </p>
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.author === "me" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", m.author === "me" ? "bg-brand text-brand-foreground" : "bg-foreground/5 text-ink")}>
              {m.text}
            </div>
          </div>
        ))}
        {send.isPending && <div className="flex items-center gap-2 text-xs text-dim"><Loader2 className="size-3.5 animate-spin" /> Агент печатает…</div>}
      </div>
      <div className="flex items-center gap-2 border-t border-border p-4">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Напишите агенту…" className="h-11 rounded-full" />
        <Button variant="hero" size="icon" className="size-11 shrink-0" aria-label="Отправить" onClick={submit} disabled={send.isPending}>
          <Send className="size-4" />
        </Button>
      </div>
    </>
  );
}
