import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Check, ChevronDown, History, Loader2, Pencil, RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { BENEFIT, LABELS, type ParamKey, type TradeRequest } from "@/lib/bargain";
import { describeDeal } from "@/lib/ai.functions";
import { changeNegotiation, openNegotiation } from "@/lib/negotiations.functions";
import { humansAgreed, proposeCondition, type ConditionValues, type NegotiationSnapshot } from "@/lib/negotiation";
import { cn } from "@/lib/utils";

type Edit = { key: ParamKey; version: number; values: ConditionValues; preview: NegotiationSnapshot | null };

export function NegotiationCards({ my, other }: { my: TradeRequest; other: TradeRequest }) {
  const buyer = my.kind === "buy" ? my : other;
  const seller = my.kind === "sell" ? my : other;
  const side = my.kind === "buy" ? "buyer" : "seller";
  const open = useServerFn(openNegotiation), change = useServerFn(changeNegotiation), explain = useServerFn(describeDeal);
  const client = useQueryClient();
  const queryKey = ["request-negotiation", buyer.id, seller.id];
  const [edit, setEdit] = useState<Edit | null>(null);
  const [confirmation, setConfirmation] = useState<{ key: ParamKey; version: number; action: "accept" | "propose" } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const query = useQuery({ queryKey, queryFn: () => open({ data: { buyerId: buyer.id, sellerId: seller.id } }), refetchInterval: 10000 });
  const row = query.data;
  const snapshot = row?.snapshot as unknown as NegotiationSnapshot | undefined;
  const history = useQuery({
    queryKey: ["negotiation-history", row?.id, row?.version], enabled: !!row && showHistory,
    queryFn: async () => {
      if (!row) return [];
      const { data, error } = await supabase.from("negotiation_versions").select("id,version,actor_id,action,param_key,snapshot,created_at").eq("negotiation_id", row.id).order("version", { ascending: false }).limit(100);
      if (error) throw new Error("История недоступна.");
      return data ?? [];
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!row || !confirmation) throw new Error("Выберите условие.");
      return change({ data: { id: row.id, version: confirmation.version, action: confirmation.action, key: confirmation.key, ...(confirmation.action === "propose" && edit ? { values: edit.values } : {}) } });
    },
    onSuccess: (saved) => {
      client.setQueryData(queryKey, saved);
      setConfirmation(null); setEdit(null);
      summary.reset();
      toast.success("Отправлено второй стороне");
    },
    onError: (error) => { toast.error(error.message); void query.refetch(); },
  });
  const summary = useMutation({
    mutationFn: async () => {
      if (!snapshot) return { text: "" };
      return explain({ data: { title: `${buyer.title} / ${seller.title}`, agreed: humansAgreed(snapshot), terms: snapshot.conditions.flatMap((c) => c.term ? [{ label: LABELS[c.key], value: c.term.value, note: c.term.note }] : []) } });
    },
    onError: () => toast.error("ИИ сейчас недоступен; условия сохранены."),
  });

  if (query.isPending) return <div className="flex items-center justify-center gap-2 p-10 text-sm text-dim"><Loader2 className="size-4 animate-spin" />Открываем переговоры…</div>;
  if (query.isError || !row || !snapshot) return <div className="space-y-3 p-6 text-sm text-destructive"><p>Не удалось открыть переговоры. Проверьте вход и попробуйте снова.</p><Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="size-4" />Повторить</Button></div>;

  const beginEdit = (key: ParamKey) => {
    const p = snapshot[side][key];
    setEdit({ key, version: row.version, values: { min: p.min, max: p.max, unit: p.unit, value: p.value }, preview: null });
    summary.reset();
  };
  const simulate = () => {
    if (!edit) return;
    try { setEdit({ ...edit, preview: proposeCondition(snapshot, side, edit.key, edit.values) }); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Проверьте значения."); }
  };
  const confirmationCondition = (confirmation?.action === "propose" ? edit?.preview : snapshot)?.conditions.find((c) => c.key === confirmation?.key);
  const stale = !!edit && edit.version !== row.version;
  const lastVersion = row.version;

  return <div className="flex-1 space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4 text-xs text-dim">
      <span>{humansAgreed(snapshot) ? "Оба участника подтвердили все условия" : "Ожидает подтверждений участников"} · Версия {row.version}</span>
      <Button variant="ghost" size="sm" aria-label="Обновить переговоры" onClick={() => void query.refetch()}><RefreshCw className={cn("size-4", query.isFetching && "animate-spin")} /></Button>
    </div>
    {snapshot.conditions.map((c) => {
      const current = edit?.key === c.key ? edit : null;
      const shown = current?.preview?.conditions.find((item) => item.key === c.key) ?? c;
      const p = snapshot[side][c.key];
      const range = ["qty", "price", "term"].includes(c.key);
      const myAccepted = side === "buyer" ? c.buyerAccepted : c.sellerAccepted;
      return <article key={c.key} className="min-w-0 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold text-ink">{LABELS[c.key]}</h3>
          <span className="text-xs text-dim">Приоритет: покупатель {snapshot.buyer[c.key].priority}% · продавец {snapshot.seller[c.key].priority}%</span>
        </div>
        <p className="mt-1 text-xs text-dim">{BENEFIT[c.key]}</p>
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div><div className="text-dim">Покупатель{side === "buyer" ? " · вы" : ""}</div><div className="mt-1 break-words text-ink">{parameterText(snapshot.buyer[c.key], range)}</div></div>
          <div><div className="text-dim">Продавец{side === "seller" ? " · вы" : ""}</div><div className="mt-1 break-words text-ink">{parameterText(snapshot.seller[c.key], range)}</div></div>
        </div>
        <div className="my-3 border-t border-border pt-3">
          <div className="text-xs text-dim">{current?.preview ? "Предварительный результат · не отправлен" : "Предложение ботов"}</div>
          <p className="mt-1 break-words text-base font-semibold text-ink">{shown.term?.value ?? "Не задано"}</p>
          <p className="mt-1 text-xs text-dim">{shown.term?.note ?? "Условия отсутствуют в обеих заявках"}</p>
        </div>
        <details className="mb-3 text-xs">
          <summary className="flex cursor-pointer items-center gap-1.5 text-brand"><Bot className="size-4" />Ответ моего бота и ход торга<ChevronDown className="size-3" /></summary>
          <div className="mt-2 space-y-2 border-l border-border pl-3 leading-relaxed text-dim">
            {shown.log.length === 0 && <p>{shown.term?.note ?? "Бот не предложил условий."}</p>}
            {shown.log.map((line, i) => <p key={i}><span className={cn("font-medium", line.side === side && "text-brand")}>{line.side === "system" ? "Результат" : line.side === side ? "Мой бот" : "Бот второй стороны"}:</span> {line.text}</p>)}
            {shown.term && <p className="text-ink">Мой бот: предлагаю «{shown.term.value}». {!(side === "buyer" ? shown.term.buyerOk : shown.term.sellerOk) && "Нужно ваше согласие на уступку."}</p>}
          </div>
        </details>
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className={c.buyerAccepted ? "text-brand" : "text-dim"}>Покупатель: {c.buyerAccepted ? "подтвердил" : "не подтвердил"}</span>
          <span className={c.sellerAccepted ? "text-brand" : "text-dim"}>Продавец: {c.sellerAccepted ? "подтвердил" : "не подтвердил"}</span>
        </div>
        {current ? <div className="space-y-3 border-t border-border pt-3">
          {stale && <p role="alert" className="text-xs text-destructive">Другая сторона изменила условия. Закройте черновик и проверьте новую версию.</p>}
          {range ? <div className="grid gap-2 sm:grid-cols-3">
            {(["min", "max", "unit"] as const).map((field) => <label key={field} className="min-w-0 text-xs text-dim">{field === "min" ? "От" : field === "max" ? "До" : "Единица"}<Input aria-label={`${LABELS[c.key]} ${field === "min" ? "от" : field === "max" ? "до" : "единица"}`} type={field === "unit" ? "text" : "number"} min={0} step="any" value={current.values[field]} onChange={(e) => setEdit({ ...current, values: { ...current.values, [field]: e.target.value }, preview: null })} /></label>)}
          </div> : <label className="block text-xs text-dim">Ваше условие<Input aria-label={`${LABELS[c.key]} своё условие`} maxLength={500} value={current.values.value} onChange={(e) => setEdit({ ...current, values: { ...current.values, value: e.target.value }, preview: null })} /></label>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={stale} onClick={simulate}><Bot className="size-4" />Пересчитать пункт</Button>
            {current.preview && <Button size="sm" disabled={stale || send.isPending} onClick={() => setConfirmation({ key: c.key, version: current.version, action: "propose" })}><Send className="size-4" />Отправить предложение</Button>}
            <Button variant="ghost" size="sm" onClick={() => setEdit(null)}>Отмена</Button>
          </div>
        </div> : <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={send.isPending || p.ignore} onClick={() => beginEdit(c.key)}><Pencil className="size-3.5" />Предложить своё условие</Button>
          {c.term && <Button variant={myAccepted ? "ghost" : "default"} size="sm" disabled={myAccepted || send.isPending} onClick={() => setConfirmation({ key: c.key, version: row.version, action: "accept" })}><Check className="size-4" />{myAccepted ? "Вы подтвердили" : "Меня устраивает"}</Button>}
        </div>}
      </article>;
    })}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={summary.isPending} onClick={() => summary.mutate()}>{summary.isPending ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}Пересказать условия</Button>
      <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}><History className="size-4" />История версий</Button>
    </div>
    {summary.data?.text && <p className="border-l-2 border-brand pl-4 text-sm leading-relaxed text-ink">{summary.data.text}</p>}
    {showHistory && <div className="space-y-3 border-t border-border pt-4 text-xs text-dim">
      {history.isPending ? "Загружаем историю…" : history.isError ? "Не удалось загрузить историю." : history.data?.map((v) => {
        const old = v.snapshot as unknown as NegotiationSnapshot;
        const condition = old.conditions.find((c) => c.key === v.param_key);
        return <details key={v.id}><summary className="cursor-pointer">Версия {v.version} · {v.actor_id === my.owner_id ? "Вы" : "Вторая сторона"} · {v.action === "start" ? "Начало торга" : v.action === "propose" ? "Встречное условие" : "Подтверждение"}{v.param_key ? ` · ${LABELS[v.param_key as ParamKey]}` : ""}</summary><div className="mt-2 space-y-1 pl-3">{(condition ? [condition] : old.conditions).map((c) => <p key={c.key}>{LABELS[c.key]}: {c.term?.value ?? "Не задано"}</p>)}</div></details>;
      })}
    </div>}
    <Dialog open={!!confirmation} onOpenChange={(isOpen) => { if (!isOpen && !send.isPending) setConfirmation(null); }}>
      <DialogContent><DialogHeader><DialogTitle>{confirmation?.action === "propose" ? "Отправить встречное условие?" : "Подтвердить условие?"}</DialogTitle><DialogDescription>{confirmation ? LABELS[confirmation.key] : ""} · Версия {confirmation?.version}. Получатель: владелец заявки «{other.title}».</DialogDescription></DialogHeader>
        <p className="break-words font-semibold text-ink">{confirmationCondition?.term?.value ?? ""}</p>
        {confirmation?.action === "propose" && edit && <p className="text-sm text-dim">Ваше условие: {parameterText(edit.values, ["qty", "price", "term"].includes(edit.key))}</p>}
        {confirmation?.version !== lastVersion && <p role="alert" className="text-sm text-destructive">Условия изменились. Проверьте новую версию перед отправкой.</p>}
        <DialogFooter><Button variant="outline" disabled={send.isPending} onClick={() => setConfirmation(null)}>Вернуться</Button><Button disabled={send.isPending || confirmation?.version !== lastVersion} onClick={() => send.mutate()}>{send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Подтвердить и отправить</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function parameterText(p: ConditionValues & { ignore?: boolean }, range: boolean) {
  if (p.ignore) return "Неважно";
  return range ? `${p.min || p.max || "—"}–${p.max || p.min || "—"} ${p.unit}`.trim() : p.value || "Не задано";
}