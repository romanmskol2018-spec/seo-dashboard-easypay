// Импорт лидов и продаж напрямую из Bitrix24 REST (вебхук в .env).
// Заменяет ручной import-crm.ts (.xls). По умолчанию — СУХОЙ ПРОГОН (печатает
// агрегаты, в базу не пишет). Запись: `npm run import:bitrix -- --write`.
// Окно: последние N недель (по умолчанию 8), aligned к той же сетке недель.
//
//   npm run import:bitrix            # сухой прогон, 8 недель
//   npm run import:bitrix -- --weeks=12 --write
import { PrismaClient } from "@prisma/client";
import { listAll, enumMap } from "../lib/bitrix";

// Для массовой записи используем ПРЯМОЕ подключение Neon (DIRECT_URL, без пулера):
// пулер роняет коннект (P1017) на больших циклах записи.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

// ---------- ID полей портала EasyPay ----------
const LF = {
  metrika: "UF_CRM_1738066060271",
  project: "UF_CRM_1738064110267", // enum
  istochnik: "UF_CRM_1779838134",
  sistema: "UF_CRM_1779840045",
  referer: "UF_CRM_1779841897",
  direct: "UF_CRM_1779841908",
};
const DF = {
  project: "UF_CRM_1738065172726", // enum
  metrika: "UF_CRM_1738066304447",
  paidSum: "UF_CRM_6A079499D0B73", // «Оплаченная сумма» (строка)
  paid: "UF_CRM_6A07929F5744A", // «Оплачено»
  cardType: "UF_CRM_6A10543B9612E", // «Тип карты»
};

// ---------- недели (та же сетка, что в import-crm) ----------
const ANCHOR = Date.UTC(2026, 4, 6);
const DAY = 86400000;
function weekStart(d: Date): Date {
  const idx = Math.floor((d.getTime() - ANCHOR) / (7 * DAY));
  return new Date(ANCHOR + idx * 7 * DAY);
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function weekLabel(start: Date): string {
  const end = new Date(start.getTime() + 6 * DAY);
  return `${pad(start.getUTCDate())}.${pad(start.getUTCMonth() + 1)}–${pad(end.getUTCDate())}.${pad(end.getUTCMonth() + 1)}`;
}
// ISO-дата Bitrix "2026-06-26T15:05:48+03:00" -> Date по дню (UTC)
function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// ---------- телефоны / число ----------
function mobiles(text: string): string[] {
  const out = new Set<string>();
  const re = /\d[\d\s\-()]{8,}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) {
    let d = m[0].replace(/\D/g, "");
    if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
    if (d.length === 10 && d[0] === "9") out.add(d);
  }
  return [...out];
}
function toNum(s: string): number {
  const m = /-?\d[\d\s]*([.,]\d+)?/.exec((s || "").replace(/ /g, " "));
  if (!m) return 0;
  const n = parseFloat(m[0].replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// ---------- источник (адаптировано под доступные поля Bitrix) ----------
const SRC_KEYS = [
  "seo", "recom", "direct", "klerk", "insta", "karty", "dzen", "youtube", "partner",
] as const;
type SrcKey = (typeof SRC_KEYS)[number];

type Lead = {
  id: string;
  date: Date;
  week: Date;
  proj: string;
  met: string;
  mob: string[];
  utmS: string;
  utmM: string;
  src: string; // SOURCE_ID
  ist: string;
  sys: string;
  ref: string;
  direct: boolean;
};

function classify(rows: Lead[]): SrcKey | "unknown" {
  const blob = rows
    .map((r) => [r.utmS, r.utmM, r.ist, r.sys, r.ref].join(" "))
    .join(" ")
    .toLowerCase();
  const utmM = rows.map((r) => r.utmM.toLowerCase()).join(" ");
  const utmS = rows.map((r) => r.utmS.toLowerCase()).join(" ");
  const src = rows.map((r) => r.src.toLowerCase()).join(" ");
  const directAd = rows.some((r) => r.direct);

  if (blob.includes("klerk")) return "klerk";
  if (blob.includes("dzen") || blob.includes("дзен")) return "dzen";
  if (blob.includes("youtube") || blob.includes("ютуб") || blob.includes("youtu"))
    return "youtube";
  if (utmS.includes("instagram") || utmS === "ig" || blob.includes("instagram") || blob.includes("соц"))
    return "insta";
  if (blob.includes("2gis") || blob.includes("karty") || blob.includes("карты"))
    return "karty";
  if (blob.includes("partner") || blob.includes("партн") || blob.includes("affiliate"))
    return "partner";
  if (utmM.includes("cpc") || blob.includes("ya_direct") || blob.includes("реклама") || directAd)
    return "direct";
  if (
    utmM.includes("organic") ||
    /\b(google|yandex|bing)\b/.test(blob) ||
    blob.includes("seo")
  )
    return "seo";
  if (
    src.includes("repeat_sale") || src.includes("call") || src.includes("connector") ||
    blob.includes("прям") || blob.includes("recommend") || blob.includes("повтор")
  )
    return "recom";
  return "unknown";
}
function isGoogle(rows: Lead[]): boolean {
  return rows.some((r) => (r.utmS + r.sys).toLowerCase().includes("google"));
}
function isYandex(rows: Lead[]): boolean {
  return rows.some((r) => (r.utmS + r.sys).toLowerCase().includes("yandex"));
}

// ---------- union-find ----------
class UF {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.p[ra] = rb;
  }
}

type Agg = Record<SrcKey, number> & { val: number; g: number; y: number; u: number };
function emptyAgg(): Agg {
  return { seo: 0, recom: 0, direct: 0, klerk: 0, insta: 0, karty: 0, dzen: 0, youtube: 0, partner: 0, val: 0, g: 0, y: 0, u: 0 };
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const weeksArg = args.find((a) => a.startsWith("--weeks="));
  const nWeeks = weeksArg ? Number(weeksArg.split("=")[1]) : 8;

  // окно: nWeeks недель назад от текущей недели
  const now = new Date();
  const curWeek = weekStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  const fromDate = new Date(curWeek.getTime() - (nWeeks - 1) * 7 * DAY);
  const fromIso = fmt(fromDate) + "T00:00:00";
  console.log(`📥 Bitrix импорт · окно ${nWeeks} нед с ${fmt(fromDate)} · режим: ${write ? "ЗАПИСЬ" : "СУХОЙ ПРОГОН"}`);

  const [projLead, projDeal] = await Promise.all([
    enumMap("lead", LF.project),
    enumMap("deal", DF.project),
  ]);
  const normProj = (raw: string, map: Record<string, string>): string => {
    const v = map[raw] || raw || "";
    if (v.includes("гражданств")) return "Easypay.World";
    if (["Easypay.World", "4YouCards", "VisaMasterCards", "AVO.cards", "Visatut"].includes(v))
      return v;
    return "Easypay.World";
  };

  // ---- лиды ----
  console.log("  · тяну лиды…");
  const rawLeads = await listAll("crm.lead.list", {
    select: ["ID", "DATE_CREATE", "TITLE", "PHONE", "UTM_SOURCE", "UTM_MEDIUM", "SOURCE_ID",
      LF.metrika, LF.project, LF.istochnik, LF.sistema, LF.referer, LF.direct],
    filter: { "[>DATE_CREATE]": fromIso },
  });
  const leads: Lead[] = [];
  for (const r of rawLeads) {
    const d = parseDate(String(r.DATE_CREATE));
    if (!d) continue;
    const mob = new Set<string>();
    const ph = r.PHONE as { VALUE?: string }[] | undefined;
    if (Array.isArray(ph)) for (const p of ph) mobiles(String(p.VALUE || "")).forEach((x) => mob.add(x));
    mobiles(String(r.TITLE || "")).forEach((x) => mob.add(x));
    leads.push({
      id: String(r.ID),
      date: d,
      week: weekStart(d),
      proj: normProj(String(r[LF.project] || ""), projLead),
      met: String(r[LF.metrika] || "").trim(),
      mob: [...mob],
      utmS: String(r.UTM_SOURCE || ""),
      utmM: String(r.UTM_MEDIUM || ""),
      src: String(r.SOURCE_ID || ""),
      ist: String(r[LF.istochnik] || ""),
      sys: String(r[LF.sistema] || ""),
      ref: String(r[LF.referer] || ""),
      direct: !!String(r[LF.direct] || "").trim(),
    });
  }
  console.log(`    получено лидов: ${rawLeads.length}`);

  // ---- сделки ----
  console.log("  · тяну сделки…");
  // ВАЖНО: «реальная продажа» = стадия «Заявка одобрена банком» (FINAL_INVOICE).
  // Поле «Оплачено» содержит много дублей/автосделок — не используем его как критерий.
  const SALE_STAGE = "FINAL_INVOICE";
  const rawDeals = await listAll("crm.deal.list", {
    select: ["ID", "DATE_CREATE", "TITLE", "OPPORTUNITY", "STAGE_ID", "LEAD_ID", DF.project, DF.metrika, DF.paidSum, DF.cardType],
    filter: { "[>DATE_CREATE]": fromIso },
  });
  console.log(`    получено сделок: ${rawDeals.length}`);

  // привязка лид↔сделка (для кач-лидов): по LEAD_ID и metrika со ВСЕХ сделок
  const dealMetrikas = new Set<string>();
  const dealLeadIds = new Set<string>();
  type Sale = {
    dealId: string;
    date: Date;
    amount: number;
    bank: string | null;
    cardType: string | null;
    proj: string;
  };
  const sales: Sale[] = [];
  const normBank = (c: string): string | null => {
    const s = (c || "").toLowerCase();
    if (!s.trim()) return null;
    if (s.includes("бакай")) return "Бакай (Киргизия)";
    if (s.includes("ори")) return "Ориён / Орион";
    if (s.includes("арцах")) return "Арцах (Армения)";
    if (s.includes("виртуал")) return "Виртуальная";
    return "Прочие СНГ";
  };
  for (const r of rawDeals) {
    const met = String(r[DF.metrika] || "").trim();
    const leadId = String(r.LEAD_ID || "").trim();
    if (met) dealMetrikas.add(met);
    if (leadId && leadId !== "0") dealLeadIds.add(leadId);
    // продажа = сделка в стадии «одобрена банком»
    if (String(r.STAGE_ID || "") !== SALE_STAGE) continue;
    const d = parseDate(String(r.DATE_CREATE));
    if (!d) continue;
    const paidSum = toNum(String(r[DF.paidSum] || ""));
    const amount = paidSum > 0 ? paidSum : toNum(String(r.OPPORTUNITY || ""));
    const card = String(r[DF.cardType] || "");
    sales.push({
      dealId: String(r.ID),
      date: d,
      amount: Math.round(amount),
      bank: normBank(card),
      cardType: card || null,
      proj: normProj(String(r[DF.project] || ""), projDeal),
    });
  }

  // ---- агрегация лидов по неделям (дедуп union-find внутри недели) ----
  const byWeek = new Map<string, Lead[]>();
  for (const l of leads) {
    const k = fmt(l.week);
    (byWeek.get(k) || byWeek.set(k, []).get(k)!).push(l);
  }
  const result = new Map<string, Map<string, Agg>>();
  const qualByWeek = new Map<string, number>();
  for (const [k, ws] of byWeek) {
    const keep = ws.filter((l) => l.mob.length || l.met);
    const uf = new UF(keep.length);
    const byMob = new Map<string, number[]>();
    const byMet = new Map<string, number[]>();
    keep.forEach((l, i) => {
      for (const m of l.mob) (byMob.get(m) || byMob.set(m, []).get(m)!).push(i);
      if (l.met) (byMet.get(l.met) || byMet.set(l.met, []).get(l.met)!).push(i);
    });
    for (const ids of [...byMob.values(), ...byMet.values()])
      for (let j = 1; j < ids.length; j++) uf.union(ids[0], ids[j]);
    const comps = new Map<number, Lead[]>();
    keep.forEach((l, i) => {
      const root = uf.find(i);
      (comps.get(root) || comps.set(root, []).get(root)!).push(l);
    });
    const wk = new Map<string, Agg>();
    const ensure = (p: string) => wk.get(p) || wk.set(p, emptyAgg()).get(p)!;
    const unknownByProj = new Map<string, number>();
    let qual = 0;
    for (const comp of comps.values()) {
      const proj = comp[0].proj;
      // кач-лид: компонента привязана к сделке по LEAD_ID или metrika
      if (comp.some((l) => dealLeadIds.has(l.id) || (l.met && dealMetrikas.has(l.met))))
        qual++;
      const cl = classify(comp);
      if (cl === "unknown") {
        unknownByProj.set(proj, (unknownByProj.get(proj) || 0) + 1);
      } else {
        const a = ensure(proj);
        a[cl]++;
        if (cl === "seo") {
          if (isGoogle(comp)) a.g++;
          else if (isYandex(comp)) a.y++;
        }
      }
    }
    for (const [p, u] of unknownByProj) {
      const a = ensure(p);
      const sa = Math.round(u * 0.6);
      a.seo += sa;
      a.recom += u - sa;
    }
    for (const [, a] of wk) {
      a.val = SRC_KEYS.reduce((s, key) => s + a[key], 0);
      a.u = a.seo - a.g - a.y;
    }
    result.set(k, wk);
    qualByWeek.set(k, qual);
  }

  // ---- отчёт ----
  const weeksSorted = [...result.keys()].sort();
  let totVal = 0, totQual = 0;
  console.log("\n  Неделя        Вал   Кач   SEO  Дир  Реком");
  for (const k of weeksSorted) {
    const wk = result.get(k)!;
    const all = emptyAgg();
    for (const [, a] of wk) {
      SRC_KEYS.forEach((key) => (all[key] += a[key]));
      all.val += a.val; all.g += a.g; all.y += a.y;
    }
    const q = qualByWeek.get(k) || 0;
    totVal += all.val; totQual += q;
    console.log(`  ${weekLabel(new Date(k)).padEnd(13)} ${String(all.val).padStart(4)} ${String(q).padStart(5)} ${String(all.seo).padStart(5)} ${String(all.direct).padStart(4)} ${String(all.recom).padStart(5)}`);
  }
  const revenue = sales.reduce((s, x) => s + x.amount, 0);
  console.log(`\n  ИТОГО лиды(вал): ${totVal} · кач-лиды: ${totQual}`);
  console.log(`  Продажи(оплачено): ${sales.length} · выручка: ${revenue.toLocaleString("ru")} ₽ · ср.чек: ${sales.length ? Math.round(revenue / sales.length).toLocaleString("ru") : 0} ₽`);
  console.log(`\n  (Текущий дашборд для сравнения: лиды 2625 · кач 338 · продажи 182 · выручка 15 434 696 ₽)`);

  if (!write) {
    console.log("\n💡 Сухой прогон — в базу НЕ записано. Для записи: npm run import:bitrix -- --write");
    return;
  }

  // ---- запись в БД (точечная замена окна, без полной очистки) ----
  console.log("\n✍ Пишу в базу (замена за окно)…");
  let n = 0;
  for (const k of weeksSorted) {
    const ws = new Date(k);
    const label = weekLabel(ws);
    const wk = result.get(k)!;
    const all = emptyAgg();
    for (const [, a] of wk) {
      SRC_KEYS.forEach((key) => (all[key] += a[key]));
      all.val += a.val; all.g += a.g; all.y += a.y; all.u += a.u;
    }
    const rows: [string, Agg, number | null][] = [["ALL", all, qualByWeek.get(k) ?? null]];
    for (const [p, a] of wk) rows.push([p, a, null]);
    for (const [project, a, q] of rows) {
      const payload = {
        weekLabel: label, project, val: a.val, qual: q,
        seo: a.seo, recom: a.recom, direct: a.direct, klerk: a.klerk, insta: a.insta,
        karty: a.karty, dzen: a.dzen, youtube: a.youtube, partner: a.partner,
        seoGoogle: a.g, seoYandex: a.y, seoUnknown: a.u,
      };
      await prisma.leadStat.upsert({
        where: { weekStart_project: { weekStart: ws, project } },
        create: { weekStart: ws, ...payload },
        update: payload,
      });
      n++;
    }
  }
  // убираем устаревшие недели до окна (остатки прежнего .xls-импорта)
  const winFrom = new Date(weeksSorted[0]);
  await prisma.leadStat.deleteMany({ where: { weekStart: { lt: winFrom } } });
  // продажи: чистим только окно (по дате), затем пишем одним пакетом
  await prisma.cardSale.deleteMany({ where: { date: { gte: winFrom } } });
  await prisma.cardSale.createMany({
    data: sales.map((s) => ({
      dealId: s.dealId,
      date: s.date,
      amount: s.amount,
      cardType: s.cardType,
      bank: s.bank,
      project: s.proj,
      source: null,
      isImport: false,
    })),
    skipDuplicates: true,
  });
  console.log(`  ✓ LeadStat: ${n} строк · CardSale: ${sales.length} продаж (окно с ${fmt(winFrom)})`);
  console.log("🎉 Готово — данные обновлены из Bitrix");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
