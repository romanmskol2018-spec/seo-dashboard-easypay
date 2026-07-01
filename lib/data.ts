import { prisma } from "@/lib/prisma";
import { formatDateShort } from "@/lib/format";

export type SiteSummary = {
  id: string;
  name: string;
  domain: string;
  color: string;
  visits: number;
  visitors: number;
  pageviews: number;
  bounceRate: number;
  prevVisits: number;
  deltaPct: number | null;
};

export type ProjectSummary = {
  id: string;
  name: string;
  color: string;
  searchEngine: string;
  visibility: number;
  avgPosition: number;
  top3: number;
  top10: number;
  top50: number;
  queriesTotal: number;
  top3Delta: number | null;
  top10Delta: number | null;
  top50Delta: number | null;
  prevVisibility: number;
  deltaPct: number | null;
};

export type TrendRow = { date: string } & Record<string, number | string>;

export type Granularity = "day" | "week" | "month";

export type DashboardData = {
  days: number;
  group: Granularity;
  engine: string;
  sites: SiteSummary[];
  projects: ProjectSummary[];
  trafficTrend: TrendRow[];
  visibilityTrend: TrendRow[];
  period: {
    currStart: string;
    currEnd: string;
    prevStart: string;
    prevEnd: string;
  };
  totals: {
    visits: number;
    visitors: number;
    pageviews: number;
    prevVisits: number;
    visitsDeltaPct: number | null;
    avgVisibility: number;
    prevAvgVisibility: number;
    visibilityDeltaPct: number | null;
  };
};

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
}

// Видимость = доля запросов в ТОП-10 (ТОП-10 / всего запросов), %
function top10Pct(rec?: { top10: number; queriesTotal: number }): number {
  if (!rec || !rec.queriesTotal) return 0;
  return Math.round((rec.top10 / rec.queriesTotal) * 1000) / 10;
}

// Начало недели (понедельник) в UTC
function weekStartUTC(d: Date): Date {
  const diff = (d.getUTCDay() + 6) % 7; // дней с понедельника
  const r = new Date(d);
  r.setUTCDate(d.getUTCDate() - diff);
  return r;
}

// Ключ корзины для группировки по дню/неделе/месяцу
function bucketKey(iso: string, group: Granularity): string {
  if (group === "day") return iso;
  const d = new Date(iso);
  if (group === "month") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  return fmt(weekStartUTC(d)); // week
}

// Суммирует дневные строки тренда в недельные/месячные корзины
function groupTrend(rows: TrendRow[], group: Granularity): TrendRow[] {
  if (group === "day") return rows;
  const map = new Map<string, TrendRow>();
  for (const row of rows) {
    const key = bucketKey(row.date as string, group);
    if (!map.has(key)) map.set(key, { date: key });
    const bucket = map.get(key)!;
    for (const [k, v] of Object.entries(row)) {
      if (k === "date") continue;
      bucket[k] = ((bucket[k] as number) || 0) + (v as number);
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Усредняет дневные строки видимости в недельные/месячные корзины
function groupTrendAvg(rows: TrendRow[], group: Granularity): TrendRow[] {
  if (group === "day") return rows;
  const sums = new Map<string, TrendRow>();
  const counts = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const key = bucketKey(row.date as string, group);
    if (!sums.has(key)) {
      sums.set(key, { date: key });
      counts.set(key, {});
    }
    const bucket = sums.get(key)!;
    const cnt = counts.get(key)!;
    for (const [k, v] of Object.entries(row)) {
      if (k === "date") continue;
      bucket[k] = ((bucket[k] as number) || 0) + (v as number);
      cnt[k] = (cnt[k] || 0) + 1;
    }
  }
  for (const [key, bucket] of sums) {
    const cnt = counts.get(key)!;
    for (const k of Object.keys(bucket)) {
      if (k === "date") continue;
      bucket[k] = Math.round(((bucket[k] as number) / cnt[k]) * 10) / 10;
    }
  }
  return Array.from(sums.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ====================== ЛИДЫ И ПРОДАЖИ (CRM) ======================

export type LeadWeek = {
  weekStart: string;
  label: string;
  val: number;
  qual: number | null;
  seo: number;
  recom: number;
  direct: number;
  klerk: number;
  insta: number;
  karty: number;
  dzen: number;
  youtube: number;
  partner: number;
  seoGoogle: number;
  seoYandex: number;
  seoUnknown: number;
};

export type LeadsData = {
  project: string; // "ALL" | имя проекта
  projects: string[]; // список проектов (для фильтра)
  weeks: LeadWeek[];
};

const LEAD_PROJECTS = [
  "Easypay.World",
  "4YouCards",
  "VisaMasterCards",
  "AVO.cards",
  "Visatut",
];

// Медиана набора чисел (для «честного» среднего чека — устойчива к выбросам).
function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// Недельная сетка ДЛЯ ПРОДАЖ — та же, что у лидов (import-bitrix): якорь 2026-05-06,
// недели ср–вт. Иначе бары выручки (по понедельникам) не совпадали бы с неделями
// воронки/таблицы лидов (баг #1 аудита).
const LEAD_WEEK_ANCHOR = Date.UTC(2026, 4, 6); // 2026-05-06
const WEEK_MS = 7 * 86400000;
function leadWeekStart(d: Date): string {
  const idx = Math.floor((d.getTime() - LEAD_WEEK_ANCHOR) / WEEK_MS);
  return fmt(new Date(LEAD_WEEK_ANCHOR + idx * WEEK_MS));
}
function weekRangeLabel(iso: string): string {
  const s = new Date(iso);
  const e = new Date(s.getTime() + 6 * 86400000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(s.getUTCDate())}.${p(s.getUTCMonth() + 1)}–${p(e.getUTCDate())}.${p(e.getUTCMonth() + 1)}`;
}

// Все доступные недели (для пикера диапазона). Берём по агрегату "ALL".
export async function getAvailableWeeks(): Promise<
  { weekStart: string; label: string }[]
> {
  const rows = await prisma.leadStat.findMany({
    where: { project: "ALL" },
    orderBy: { weekStart: "asc" },
    select: { weekStart: true, weekLabel: true },
  });
  return rows.map((r) => ({ weekStart: fmt(r.weekStart), label: r.weekLabel }));
}

// Лиды по неделям для выбранного проекта ("ALL" — агрегат по всем).
// fromIso/toIso — границы по weekStart (включительно); null = без границы.
export async function getLeadsData(
  project = "ALL",
  fromIso: string | null = null,
  toIso: string | null = null
): Promise<LeadsData> {
  const all = await prisma.leadStat.findMany({
    where: { project },
    orderBy: { weekStart: "asc" },
  });
  let rows = all;
  if (fromIso) rows = rows.filter((r) => fmt(r.weekStart) >= fromIso);
  if (toIso) rows = rows.filter((r) => fmt(r.weekStart) <= toIso);
  return {
    project,
    projects: LEAD_PROJECTS,
    weeks: rows.map((r) => ({
      weekStart: fmt(r.weekStart),
      label: r.weekLabel,
      val: r.val,
      qual: r.qual,
      seo: r.seo,
      recom: r.recom,
      direct: r.direct,
      klerk: r.klerk,
      insta: r.insta,
      karty: r.karty,
      dzen: r.dzen,
      youtube: r.youtube,
      partner: r.partner,
      seoGoogle: r.seoGoogle,
      seoYandex: r.seoYandex,
      seoUnknown: r.seoUnknown,
    })),
  };
}

export type SalesData = {
  cards: number;
  revenue: number;
  avg: number;
  median: number; // медианный чек (устойчив к выбросам)
  byWeek: { label: string; cards: number; revenue: number }[];
  byBank: { bank: string; cards: number }[];
};

// Продажи карт = живые оплаченные сделки (без импорта истории).
// fromIso/toIso — ограничить окном (для сквозного периода воронки).
export async function getSalesData(
  fromIso?: string,
  toIso?: string
): Promise<SalesData> {
  const where: {
    isImport: boolean;
    amount: { gt: number };
    date?: { gte?: Date; lte?: Date };
  } = { isImport: false, amount: { gt: 0 } };
  if (fromIso || toIso) {
    where.date = {};
    if (fromIso) where.date.gte = new Date(fromIso);
    if (toIso) where.date.lte = new Date(toIso);
  }
  const sales = await prisma.cardSale.findMany({
    where,
    orderBy: { date: "asc" },
  });
  const cards = sales.length;
  const revenue = sales.reduce((s, x) => s + x.amount, 0);
  const wk = new Map<string, { cards: number; revenue: number }>();
  for (const s of sales) {
    const key = leadWeekStart(s.date); // сетка недель как у лидов (ANCHOR 6 мая)
    if (!wk.has(key)) wk.set(key, { cards: 0, revenue: 0 });
    const b = wk.get(key)!;
    b.cards++;
    b.revenue += s.amount;
  }
  const byWeek = Array.from(wk.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, v]) => ({ label: weekRangeLabel(key), ...v }));
  const banks = new Map<string, number>();
  let noBank = 0;
  for (const s of sales) {
    if (!s.bank) { noBank++; continue; }
    banks.set(s.bank, (banks.get(s.bank) || 0) + 1);
  }
  const byBank = Array.from(banks.entries())
    .map(([bank, cnt]) => ({ bank, cards: cnt }))
    .sort((a, b) => b.cards - a.cards);
  // Карты без страны-банка в реестре — отдельной строкой, чтобы сумма билась с итогом
  if (noBank > 0) byBank.push({ bank: "Не указано", cards: noBank });
  return {
    cards,
    revenue,
    avg: cards ? Math.round(revenue / cards) : 0,
    median: median(sales.map((s) => s.amount)),
    byWeek,
    byBank,
  };
}

// ====================== ВОРОНКА КОНВЕРСИИ ======================
// Сшивает путь «деньги от трафика до выручки»:
// Визиты (Метрика) → Лиды (вал) → Кач-лиды (есть сделка) → Продажи (оплачено) → Выручка.
// weeksLimit — окно последних N недель (null = всё). Дельты — к предыдущему
// равному окну. Визиты берутся за то же окно, если трафик импортирован.
export type FunnelData = {
  visits: number | null; // null = трафик ещё не импортирован
  leads: number;
  qual: number;
  sales: number;
  revenue: number;
  avgCheck: number;
  medianCheck: number; // медианный чек (честнее среднего при выбросах)
  crVisitLead: number | null; // лиды / визиты, %
  crLeadQual: number | null; // кач / лиды, %
  crQualSale: number | null; // продажи / кач, %
  crLeadSale: number | null; // продажи / лиды, % (сквозная)
  // Динамика к предыдущему равному окну (null = нет предыдущего окна)
  leadsDeltaPct: number | null;
  qualDeltaPct: number | null;
  salesDeltaPct: number | null;
  revenueDeltaPct: number | null;
  // SEO-подворонка
  seoLeads: number; // лиды из канала SEO за окно
  seoShare: number | null; // доля SEO среди всех лидов, %
  seoCrVisit: number | null; // SEO-лиды / визиты, % (нижняя оценка)
  rangeFrom: string; // подпись начала окна
  rangeTo: string; // подпись конца окна
  weeks: number;
  windowFrom: string; // ISO начала окна (для фильтра продаж)
  windowTo: string; // ISO конца окна
};

export async function getFunnelData(
  fromIso: string | null = null,
  toIso: string | null = null
): Promise<FunnelData> {
  const allRows = await prisma.leadStat.findMany({
    where: { project: "ALL" },
    orderBy: { weekStart: "asc" },
  });
  // Текущее окно = недели в [from, to]; предыдущее = столько же недель до него
  let curr = allRows;
  if (fromIso) curr = curr.filter((r) => fmt(r.weekStart) >= fromIso);
  if (toIso) curr = curr.filter((r) => fmt(r.weekStart) <= toIso);
  const startIdx =
    curr.length > 0
      ? allRows.findIndex(
          (r) => fmt(r.weekStart) === fmt(curr[0].weekStart)
        )
      : 0;
  const prev =
    startIdx > 0
      ? allRows.slice(Math.max(0, startIdx - curr.length), startIdx)
      : [];

  const sumVal = (rs: typeof allRows) => rs.reduce((s, r) => s + r.val, 0);
  const sumQual = (rs: typeof allRows) =>
    rs.reduce((s, r) => s + (r.qual ?? 0), 0);
  const sumSeo = (rs: typeof allRows) => rs.reduce((s, r) => s + r.seo, 0);

  const leads = sumVal(curr);
  const qual = sumQual(curr);
  const seoLeads = sumSeo(curr);
  const pLeads = sumVal(prev);
  const pQual = sumQual(prev);

  // Границы текущего окна по неделям
  let windowFrom = "";
  let windowTo = "";
  let rangeFrom = "";
  let rangeTo = "";
  let first: Date | null = null;
  let lastEnd: Date | null = null;
  if (curr.length) {
    first = curr[0].weekStart;
    const last = curr[curr.length - 1].weekStart;
    lastEnd = new Date(last);
    lastEnd.setUTCDate(lastEnd.getUTCDate() + 6);
    windowFrom = fmt(first);
    windowTo = fmt(lastEnd);
    rangeFrom = formatDateShort(windowFrom);
    rangeTo = formatDateShort(windowTo);
  }

  // Продажи текущего окна
  const salesWhere: {
    isImport: boolean;
    amount: { gt: number };
    date?: { gte: Date; lte: Date };
  } = { isImport: false, amount: { gt: 0 } };
  if (first && lastEnd) salesWhere.date = { gte: first, lte: lastEnd };
  const sales = await prisma.cardSale.findMany({ where: salesWhere });
  const salesCount = sales.length;
  const revenue = sales.reduce((s, x) => s + x.amount, 0);

  // Продажи предыдущего окна (для дельты)
  let pSalesCount = 0;
  let pRevenue = 0;
  if (prev.length) {
    const pFirst = prev[0].weekStart;
    const pLast = prev[prev.length - 1].weekStart;
    const pEnd = new Date(pLast);
    pEnd.setUTCDate(pEnd.getUTCDate() + 6);
    const pSales = await prisma.cardSale.findMany({
      where: { isImport: false, amount: { gt: 0 }, date: { gte: pFirst, lte: pEnd } },
    });
    pSalesCount = pSales.length;
    pRevenue = pSales.reduce((s, x) => s + x.amount, 0);
  }

  // Визиты текущего окна
  let visits: number | null = null;
  if (first && lastEnd) {
    const traffic = await prisma.trafficData.findMany({
      where: { source: "all", date: { gte: first, lte: lastEnd } },
    });
    visits = traffic.length
      ? traffic.reduce((s, t) => s + t.visits, 0)
      : null;
  }

  return {
    visits,
    leads,
    qual,
    sales: salesCount,
    revenue,
    avgCheck: salesCount ? Math.round(revenue / salesCount) : 0,
    medianCheck: median(sales.map((s) => s.amount)),
    crVisitLead: visits && visits > 0 ? (leads / visits) * 100 : null,
    crLeadQual: leads > 0 ? (qual / leads) * 100 : null,
    crQualSale: qual > 0 ? (salesCount / qual) * 100 : null,
    crLeadSale: leads > 0 ? (salesCount / leads) * 100 : null,
    leadsDeltaPct: prev.length ? deltaPct(leads, pLeads) : null,
    qualDeltaPct: prev.length ? deltaPct(qual, pQual) : null,
    salesDeltaPct: prev.length ? deltaPct(salesCount, pSalesCount) : null,
    revenueDeltaPct: prev.length ? deltaPct(revenue, pRevenue) : null,
    seoLeads,
    seoShare: leads > 0 ? (seoLeads / leads) * 100 : null,
    seoCrVisit: visits && visits > 0 ? (seoLeads / visits) * 100 : null,
    rangeFrom,
    rangeTo,
    weeks: curr.length,
    windowFrom,
    windowTo,
  };
}

export async function getDashboardData(
  days: number,
  group: Granularity = "day",
  engine: string = "Яндекс"
): Promise<DashboardData> {
  const today = startOfDayUTC(new Date());
  const rangeStart = new Date(today);
  rangeStart.setUTCDate(today.getUTCDate() - (days - 1));
  const prevStart = new Date(rangeStart);
  prevStart.setUTCDate(rangeStart.getUTCDate() - days);
  const prevEnd = new Date(rangeStart);
  prevEnd.setUTCDate(rangeStart.getUTCDate() - 1);

  const [sites, projects, traffic, visibility] = await Promise.all([
    prisma.site.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.trafficData.findMany({
      where: { source: "all", date: { gte: prevStart } },
      orderBy: { date: "asc" },
    }),
    prisma.visibilityData.findMany({
      where: { date: { gte: prevStart }, searchEngine: engine },
      orderBy: { date: "asc" },
    }),
  ]);

  // ---- Трафик по сайтам ----
  const siteSummaries: SiteSummary[] = sites.map((site) => {
    const curr = traffic.filter(
      (t) => t.siteId === site.id && t.date >= rangeStart
    );
    const prev = traffic.filter(
      (t) => t.siteId === site.id && t.date >= prevStart && t.date < rangeStart
    );
    const visits = curr.reduce((s, t) => s + t.visits, 0);
    const visitors = curr.reduce((s, t) => s + t.visitors, 0);
    const pageviews = curr.reduce((s, t) => s + t.pageviews, 0);
    const bounceRate =
      curr.length > 0
        ? curr.reduce((s, t) => s + t.bounceRate, 0) / curr.length
        : 0;
    const prevVisits = prev.reduce((s, t) => s + t.visits, 0);
    return {
      id: site.id,
      name: site.name,
      domain: site.domain,
      color: site.color,
      visits,
      visitors,
      pageviews,
      bounceRate,
      prevVisits,
      deltaPct: deltaPct(visits, prevVisits),
    };
  });

  // ---- Видимость по проектам ----
  const projectSummaries: ProjectSummary[] = projects.map((project) => {
    const curr = visibility
      .filter((v) => v.projectId === project.id && v.date >= rangeStart)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const prev = visibility
      .filter(
        (v) =>
          v.projectId === project.id &&
          v.date >= prevStart &&
          v.date < rangeStart
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const last = curr[curr.length - 1];
    const prevLast = prev[prev.length - 1];
    return {
      id: project.id,
      name: project.name,
      color: project.color,
      searchEngine: project.searchEngine,
      visibility: top10Pct(last),
      avgPosition: last?.avgPosition ?? 0,
      top3: last?.top3 ?? 0,
      top10: last?.top10 ?? 0,
      top50: last?.top50 ?? 0,
      queriesTotal: last?.queriesTotal ?? 0,
      top3Delta: prevLast ? (last?.top3 ?? 0) - prevLast.top3 : null,
      top10Delta: prevLast ? (last?.top10 ?? 0) - prevLast.top10 : null,
      top50Delta: prevLast ? (last?.top50 ?? 0) - prevLast.top50 : null,
      prevVisibility: top10Pct(prevLast),
      deltaPct: deltaPct(top10Pct(last), top10Pct(prevLast)),
    };
  });

  // ---- Тренд трафика (по дням, в разрезе сайтов + total) ----
  const trafficByDate = new Map<string, TrendRow>();
  for (const t of traffic) {
    if (t.date < rangeStart) continue;
    const key = fmt(t.date);
    if (!trafficByDate.has(key)) trafficByDate.set(key, { date: key, total: 0 });
    const row = trafficByDate.get(key)!;
    row[t.siteId] = ((row[t.siteId] as number) || 0) + t.visits;
    row.total = (row.total as number) + t.visits;
  }
  const trafficTrendDaily = Array.from(trafficByDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1
  );
  const trafficTrend = groupTrend(trafficTrendDaily, group);

  // ---- Тренд видимости (по дням, в разрезе проектов) ----
  const visByDate = new Map<string, TrendRow>();
  for (const v of visibility) {
    if (v.date < rangeStart) continue;
    const key = fmt(v.date);
    if (!visByDate.has(key)) visByDate.set(key, { date: key });
    const row = visByDate.get(key)!;
    row[v.projectId] = top10Pct(v);
  }
  const visibilityTrendDaily = Array.from(visByDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1
  );
  const visibilityTrend = groupTrendAvg(visibilityTrendDaily, group);

  // ---- Итоги ----
  const totalVisits = siteSummaries.reduce((s, x) => s + x.visits, 0);
  const totalVisitors = siteSummaries.reduce((s, x) => s + x.visitors, 0);
  const totalPageviews = siteSummaries.reduce((s, x) => s + x.pageviews, 0);
  const prevTotalVisits = siteSummaries.reduce((s, x) => s + x.prevVisits, 0);
  const avgVisibility =
    projectSummaries.length > 0
      ? projectSummaries.reduce((s, x) => s + x.visibility, 0) /
        projectSummaries.length
      : 0;
  const prevAvgVisibility =
    projectSummaries.length > 0
      ? projectSummaries.reduce((s, x) => s + x.prevVisibility, 0) /
        projectSummaries.length
      : 0;

  return {
    days,
    group,
    engine,
    sites: siteSummaries,
    projects: projectSummaries,
    trafficTrend,
    visibilityTrend,
    period: {
      currStart: fmt(rangeStart),
      currEnd: fmt(today),
      prevStart: fmt(prevStart),
      prevEnd: fmt(prevEnd),
    },
    totals: {
      visits: totalVisits,
      visitors: totalVisitors,
      pageviews: totalPageviews,
      prevVisits: prevTotalVisits,
      visitsDeltaPct: deltaPct(totalVisits, prevTotalVisits),
      avgVisibility,
      prevAvgVisibility,
      visibilityDeltaPct: deltaPct(avgVisibility, prevAvgVisibility),
    },
  };
}
