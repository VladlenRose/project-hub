import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Check, Handshake, Loader2, MessageCircle, Send, User, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { describeDeal, negotiate } from "@/lib/ai.functions";
import {
  bargain,
  LABELS,
  matchScore,
  titleSimilarity,
  withDefaults,
  type BargainResult,
  type TradeRequest,
} from "@/lib/bargain";
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

  const matches = useMemo(() => {
    if (!my) return [];
    return all
      .filter((r) => r.kind !== my.kind && r.owner_id !== my.owner_id)
      .map((r) => ({ r, score: matchScore(my.params, r.params, titleSimilarity(my, r)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [all, my]);
  const other = matches.find((m) => m.r.id === otherId)?.r ?? null;

  return (
    <AppShell title="Чат-переговоры">
      <div className="grid gap-4 lg:grid-cols-[280px_300px_minmax(0,1fr)]">
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
            matches.map(({ r, score }) => (
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
                <span className="shrink-0 font-mono text-xs text-ink">{Math.round(score * 100)}%</span>
              </button>
            ))
          )}
        </aside>

        {/* 3. переговоры */}
        <section className="glass-panel flex min-h-[70vh] flex-col overflow-hidden rounded-2xl">
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
                <BotsDeal key={my.id + other.id} my={my} other={other} />
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

function BotsDeal({ my, other }: { my: TradeRequest; other: TradeRequest }) {
  const buyer = my.kind === "buy" ? my : other;
  const seller = my.kind === "sell" ? my : other;
  const iAm = my.kind === "buy" ? "buyer" : "seller";
  const result: BargainResult = useMemo(() => bargain(buyer.params, seller.params), [buyer, seller]);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const explain = useServerFn(describeDeal);
  const summary = useMutation({
    mutationFn: () =>
      explain({
        data: {
          title: `${buyer.title} / ${seller.title}`,
          agreed: result.agreed,
          terms: result.terms.map((t) => ({ label: LABELS[t.key], value: t.value, note: t.note })),
        },
      }),
    onError: () => toast.error("ИИ сейчас недоступен"),
  });

  const sideName = (s: string) => (s === "buyer" ? "Бот покупателя" : s === "seller" ? "Бот продавца" : "Система");

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-dim">Лог переговоров</div>
        <div className="space-y-1.5 rounded-xl bg-foreground/4 p-4 font-mono text-xs leading-relaxed">
          {result.log.map((l, i) => (
            <div key={i} className={cn(l.side === "system" ? "text-dim" : "text-ink")}>
              <span className={cn("font-semibold", l.side === iAm && "text-brand")}>{sideName(l.side)}:</span> {l.text}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-dim">Предложение обеим сторонам</div>
        <div className="overflow-hidden rounded-xl border border-border">
          {result.terms.length === 0 && <div className="p-4 text-sm text-dim">В заявках не заполнены условия.</div>}
          {result.terms.map((t) => (
            <div key={t.key} className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-4 py-3 text-sm last:border-0">
              <div>
                <div className="text-dim">{LABELS[t.key]}</div>
                <div className="font-medium text-ink">{t.value}</div>
                <div className="text-xs text-dim">{t.note}</div>
              </div>
              <div className="flex items-start gap-1 text-xs">
                <Badge ok={t.buyerOk}>Покуп.</Badge>
                <Badge ok={t.sellerOk}>Прод.</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      {summary.data?.text && (
        <div className="rounded-xl bg-brand/6 p-4 text-sm leading-relaxed text-ink">{summary.data.text}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={summary.isPending} onClick={() => summary.mutate()}>
          {summary.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
          Пересказать по-человечески
        </Button>
        {accepted === null ? (
          <>
            <Button variant="hero" onClick={() => setAccepted(true)}><Check className="size-4" />Меня устраивает</Button>
            <Button variant="outline" onClick={() => setAccepted(false)}><X className="size-4" />Не устраивает</Button>
          </>
        ) : (
          <span className="self-center text-sm text-dim">
            {accepted
              ? "Ваше согласие отмечено. Ждём ответ второй стороны."
              : "Измените приоритеты или условия в своей заявке — боты пересчитают торг."}
          </span>
        )}
      </div>
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5", ok ? "bg-brand/10 text-brand" : "bg-destructive/10 text-destructive")}>
      {children} {ok ? "✓" : "✕"}
    </span>
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
