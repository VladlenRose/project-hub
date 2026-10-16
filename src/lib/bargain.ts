/**
 * Детерминированный торг ботов покупателя и продавца.
 * Логика — только if/else по исходным данным и приоритетам; ИИ лишь пересказывает итог.
 */
export type Kind = "sell" | "buy";
export type ParamKey = "qty" | "price" | "term" | "payment" | "basis" | "warranty" | "regularity";
export type Param = {
  priority: number;
  ignore: boolean;
  min: string;
  max: string;
  unit: string;
  value: string;
};
export type Params = Record<ParamKey, Param>;
export type TradeRequest = {
  id: string;
  owner_id: string;
  kind: Kind;
  title: string;
  params: Params;
  product_id: string | null;
  created_at: string;
};

export const LABELS: Record<ParamKey, string> = {
  qty: "Количество",
  price: "Цена",
  term: "Сроки поставки",
  payment: "Условия оплаты",
  basis: "Базис поставки",
  warranty: "Гарантия и приемка",
  regularity: "Регулярность",
};
export const KEYS = Object.keys(LABELS) as ParamKey[];
const RANGE_KEYS: ParamKey[] = ["qty", "price", "term"];

export const emptyParam = (): Param => ({ priority: 50, ignore: false, min: "", max: "", unit: "", value: "" });
export const emptyParams = (): Params =>
  Object.fromEntries(KEYS.map((k) => [k, emptyParam()])) as Params;
export const withDefaults = (p: Partial<Params> | null | undefined): Params => {
  const base = emptyParams();
  for (const k of KEYS) if (p?.[k]) base[k] = { ...base[k], ...p[k] };
  return base;
};

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const round = (v: number, key: ParamKey) => (key === "price" ? Math.round(v * 100) / 100 : Math.round(v));

/* ---------------- подбор соответствий ---------------- */

function overlap(a: Param, b: Param, key: ParamKey): number | null {
  if (a.ignore || b.ignore) return null;
  if (RANGE_KEYS.includes(key)) {
    const [a1, a2, b1, b2] = [num(a.min), num(a.max), num(b.min), num(b.max)];
    if ([a1, a2, b1, b2].some((v) => v === null || Number.isNaN(v))) return null;
    const lo = Math.max(a1!, b1!);
    const hi = Math.min(a2!, b2!);
    if (hi >= lo) return 1;
    const span = Math.max(a2! - a1!, b2! - b1!, 1);
    return Math.max(0, 1 - (lo - hi) / span);
  }
  if (!a.value.trim() || !b.value.trim()) return null;
  return a.value.trim().toLowerCase() === b.value.trim().toLowerCase() ? 1 : 0;
}

/** Сходство по названию: одна карточка товара = 1, общие слова = 0.6, иначе 0.3. */
export function titleSimilarity(a: TradeRequest, b: TradeRequest) {
  if (a.product_id && a.product_id === b.product_id) return 1;
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-zа-яё0-9]+/i).filter((w) => w.length > 3));
  const wa = words(a.title);
  for (const w of words(b.title)) if (wa.has(w)) return 0.6;
  return 0.3;
}

/** Скор 0..1: каждое поле весит по МОЕМУ приоритету. */
export function matchScore(mine: Params, other: Params, titleSim = 1) {
  let wsum = 0;
  let total = 0;
  for (const k of KEYS) {
    const s = overlap(mine[k], other[k], k);
    if (s === null) continue;
    const w = Math.max(mine[k].priority, 1);
    wsum += w;
    total += w * s;
  }
  const score = (wsum === 0 ? 0.5 : total / wsum) * titleSim;
  return Math.max(0, Math.min(1, score));
}

/* ---------------- торг ---------------- */

export type Side = "buyer" | "seller";
export type LogLine = { side: Side | "system"; text: string };
export type Term = {
  key: ParamKey;
  value: string;
  buyerOk: boolean;
  sellerOk: boolean;
  note: string;
};
export type BargainResult = {
  log: LogLine[];
  terms: Term[];
  agreed: boolean;
};

function fmt(key: ParamKey, v: number, unit = "") {
  if (key === "price") return `${v.toLocaleString("ru-RU")} ₽`;
  if (key === "term") return `${v} дн.`;
  return `${v.toLocaleString("ru-RU")} ${unit}`.trim();
}

/**
 * Для покупателя «хорошо» — меньше цена и срок, для продавца — больше цена и срок.
 * Количество: покупатель хочет больше, продавец — по своему диапазону (берём пересечение).
 */
function bargainRange(key: ParamKey, b: Param, s: Param, log: LogLine[]): Term | null {
  const [b1, b2, s1, s2] = [num(b.min), num(b.max), num(s.min), num(s.max)];
  const unit = b.unit || s.unit;
  const bHas = b1 !== null || b2 !== null;
  const sHas = s1 !== null || s2 !== null;
  if (!bHas && !sHas) return null;
  if (!bHas || b.ignore) {
    const v = key === "price" ? (s1 ?? s2!) : (s2 ?? s1!);
    return { key, value: fmt(key, v, unit), buyerOk: true, sellerOk: true, note: "Покупателю не важно — по условиям продавца" };
  }
  if (!sHas || s.ignore) {
    const v = key === "price" ? (b2 ?? b1!) : (b1 ?? b2!);
    return { key, value: fmt(key, v, unit), buyerOk: true, sellerOk: true, note: "Продавцу не важно — по условиям покупателя" };
  }
  const bLo = b1 ?? b2!, bHi = b2 ?? b1!;
  const sLo = s1 ?? s2!, sHi = s2 ?? s1!;
  // какая точка выгодна каждой стороне
  const lowerIsBuyerWin = key === "price" || key === "term";
  const buyerIdeal = lowerIsBuyerWin ? bLo : bHi;
  const sellerIdeal = lowerIsBuyerWin ? sHi : sLo;
  log.push({ side: "buyer", text: `${LABELS[key]}: хочу ${fmt(key, buyerIdeal, unit)} (допускаю ${fmt(key, bLo, unit)}–${fmt(key, bHi, unit)}).` });
  log.push({ side: "seller", text: `${LABELS[key]}: предлагаю ${fmt(key, sellerIdeal, unit)} (допускаю ${fmt(key, sLo, unit)}–${fmt(key, sHi, unit)}).` });

  const lo = Math.max(bLo, sLo);
  const hi = Math.min(bHi, sHi);
  // доля «в пользу покупателя»: выше приоритет у покупателя — ближе к его краю
  const bw = Math.max(b.priority, 1), sw = Math.max(s.priority, 1);
  const buyerShare = bw / (bw + sw);

  if (key === "qty") {
    if (hi >= lo) {
      const v = round(hi, key); // максимально возможный общий объём
      log.push({ side: "system", text: `Количество: диапазоны пересекаются, фиксируем ${fmt(key, v, unit)}.` });
      return { key, value: fmt(key, v, unit), buyerOk: true, sellerOk: true, note: "В пределах обоих диапазонов" };
    }
    const v = round(bHi < sLo ? sLo : sHi, key);
    const buyerOk = v >= bLo && v <= bHi;
    const sellerOk = v >= sLo && v <= sHi;
    log.push({ side: "system", text: `Количество не пересекается — предлагаем ${fmt(key, v, unit)}.` });
    return { key, value: fmt(key, v, unit), buyerOk, sellerOk, note: "Объёмы не совпадают — нужна уступка" };
  }

  if (hi >= lo) {
    // в зоне пересечения: lowerIsBuyerWin → покупателю лучше lo
    const v = round(lowerIsBuyerWin ? hi - (hi - lo) * buyerShare : lo + (hi - lo) * buyerShare, key);
    log.push({ side: "system", text: `${LABELS[key]}: есть общая зона, с учётом приоритетов (${b.priority}% / ${s.priority}%) — ${fmt(key, v, unit)}.` });
    return { key, value: fmt(key, v, unit), buyerOk: true, sellerOk: true, note: "Внутри общей зоны" };
  }
  // зоны не пересекаются: компромисс между краями, сдвинутый к стороне с большим приоритетом
  const bEdge = lowerIsBuyerWin ? bHi : bLo; // максимум уступки покупателя
  const sEdge = lowerIsBuyerWin ? sLo : sHi; // максимум уступки продавца
  const v = round(sEdge + (bEdge - sEdge) * buyerShare, key);
  log.push({ side: "buyer", text: `${LABELS[key]}: моя предельная граница — ${fmt(key, bEdge, unit)}.` });
  log.push({ side: "seller", text: `${LABELS[key]}: моя предельная граница — ${fmt(key, sEdge, unit)}.` });
  log.push({ side: "system", text: `${LABELS[key]}: зоны не пересекаются, компромисс — ${fmt(key, v, unit)}.` });
  return { key, value: fmt(key, v, unit), buyerOk: false, sellerOk: false, note: "Компромисс за пределами обоих — нужно согласие" };
}

function bargainValue(key: ParamKey, b: Param, s: Param, log: LogLine[]): Term | null {
  const bv = b.ignore ? "" : b.value.trim();
  const sv = s.ignore ? "" : s.value.trim();
  if (!bv && !sv) return null;
  if (!bv) return { key, value: sv, buyerOk: true, sellerOk: true, note: "По условиям продавца" };
  if (!sv) return { key, value: bv, buyerOk: true, sellerOk: true, note: "По условиям покупателя" };
  if (bv.toLowerCase() === sv.toLowerCase()) {
    return { key, value: bv, buyerOk: true, sellerOk: true, note: "Совпадает" };
  }
  log.push({ side: "buyer", text: `${LABELS[key]}: прошу «${bv}» (важность ${b.priority}%).` });
  log.push({ side: "seller", text: `${LABELS[key]}: предлагаю «${sv}» (важность ${s.priority}%).` });
  if (b.priority > s.priority) {
    log.push({ side: "seller", text: `${LABELS[key]}: для меня это менее важно — соглашаюсь на «${bv}».` });
    return { key, value: bv, buyerOk: true, sellerOk: true, note: "Продавец уступил (ниже приоритет)" };
  }
  if (s.priority > b.priority) {
    log.push({ side: "buyer", text: `${LABELS[key]}: для меня это менее важно — соглашаюсь на «${sv}».` });
    return { key, value: sv, buyerOk: true, sellerOk: true, note: "Покупатель уступил (ниже приоритет)" };
  }
  log.push({ side: "system", text: `${LABELS[key]}: одинаковая важность, решение за людьми.` });
  return { key, value: `${bv} / ${sv}`, buyerOk: false, sellerOk: false, note: "Равный приоритет — выберите вариант" };
}

/** Торг: сначала самые важные пункты (по сумме приоритетов сторон). */
export function bargain(buyer: Params, seller: Params): BargainResult {
  const log: LogLine[] = [{ side: "system", text: "Боты начали переговоры по заявкам." }];
  const order = [...KEYS].sort(
    (a, b) => buyer[b].priority + seller[b].priority - (buyer[a].priority + seller[a].priority),
  );
  const terms: Term[] = [];
  for (const k of order) {
    const t = RANGE_KEYS.includes(k) ? bargainRange(k, buyer[k], seller[k], log) : bargainValue(k, buyer[k], seller[k], log);
    if (t) terms.push(t);
  }
  const agreed = terms.length > 0 && terms.every((t) => t.buyerOk && t.sellerOk);
  log.push({
    side: "system",
    text: agreed
      ? "Все пункты в пределах условий обеих сторон — предложение готово к подписи."
      : "Есть пункты вне условий — ботам нужно согласие людей.",
  });
  return { log, terms, agreed };
}
