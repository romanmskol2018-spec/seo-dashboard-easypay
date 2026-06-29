import { prisma } from "./prisma";

// ---------- типы ----------
export type ArticleWeek = { weekStart: string; label: string };

export type ArticleRow = {
  url: string;
  path: string;
  site: string;
  visits: number;
  visitors: number;
  pageviews: number;
  prevVisits: number;
  deltaPct: number | null; // null = не с чем сравнивать
  bounceRate: number; // средневзвешенный, %
  avgDuration: number; // средневзвешенная, сек
  trend: { weekStart: string; label: string; visits: number }[];
};

export type ArticlesData = {
  sites: string[];
  weeks: ArticleWeek[];
  rangeFrom: string | null;
  rangeTo: string | null;
  totals: {
    visits: number;
    visitors: number;
    pageviews: number;
    prevVisits: number;
    deltaPct: number | null;
    articles: number;
  };
  rows: ArticleRow[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Список недель, по которым есть данные ArticleStat (для пикера периода).
export async function getArticleWeeks(): Promise<ArticleWeek[]> {
  const rows = await prisma.articleStat.findMany({
    distinct: ["weekStart"],
    orderBy: { weekStart: "asc" },
    select: { weekStart: true, weekLabel: true },
  });
  return rows.map((r) => ({ weekStart: iso(r.weekStart), label: r.weekLabel }));
}

// Список сайтов, по которым есть данные.
export async function getArticleSites(): Promise<string[]> {
  const rows = await prisma.articleStat.findMany({
    distinct: ["site"],
    orderBy: { site: "asc" },
    select: { site: true },
  });
  return rows.map((r) => r.site);
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// Главная выборка: статьи в окне [from, to], сравнение с предыдущим окном той же длины.
export async function getArticlesData(
  site: string | "ALL",
  from: string | null,
  to: string | null
): Promise<ArticlesData> {
  const allWeeks = await getArticleWeeks();
  const sites = await getArticleSites();
  if (allWeeks.length === 0) {
    return {
      sites,
      weeks: [],
      rangeFrom: null,
      rangeTo: null,
      totals: { visits: 0, visitors: 0, pageviews: 0, prevVisits: 0, deltaPct: null, articles: 0 },
      rows: [],
    };
  }

  const starts = allWeeks.map((w) => w.weekStart);
  let rangeFrom = from && starts.includes(from) ? from : starts[0];
  let rangeTo = to && starts.includes(to) ? to : starts[starts.length - 1];
  if (rangeFrom > rangeTo) rangeFrom = rangeTo;

  const fromIdx = starts.indexOf(rangeFrom);
  const toIdx = starts.indexOf(rangeTo);
  const winLen = toIdx - fromIdx + 1;
  // предыдущее окно той же длины, сразу перед текущим (сколько есть)
  const prevFromIdx = Math.max(0, fromIdx - winLen);
  const prevToIdx = fromIdx - 1;
  const hasPrev = prevToIdx >= prevFromIdx;

  const whereSite = site && site !== "ALL" ? { site } : {};

  // текущее окно
  const cur = await prisma.articleStat.findMany({
    where: { ...whereSite, weekStart: { gte: new Date(rangeFrom), lte: new Date(rangeTo) } },
    select: {
      site: true, url: true, path: true, weekStart: true, weekLabel: true,
      visits: true, visitors: true, pageviews: true, bounceRate: true, avgDuration: true,
    },
  });
  // предыдущее окно (только визиты для дельты)
  const prev = hasPrev
    ? await prisma.articleStat.findMany({
        where: {
          ...whereSite,
          weekStart: { gte: new Date(starts[prevFromIdx]), lte: new Date(starts[prevToIdx]) },
        },
        select: { url: true, visits: true },
      })
    : [];

  // агрегируем текущее по URL
  type Acc = {
    url: string; path: string; site: string;
    visits: number; visitors: number; pageviews: number;
    bounceW: number; durW: number; // взвешенные суммы (по визитам) для усреднения
    trend: Map<string, { label: string; visits: number }>;
  };
  const byUrl = new Map<string, Acc>();
  for (const r of cur) {
    let a = byUrl.get(r.url);
    if (!a) {
      a = { url: r.url, path: r.path, site: r.site, visits: 0, visitors: 0, pageviews: 0, bounceW: 0, durW: 0, trend: new Map() };
      byUrl.set(r.url, a);
    }
    a.visits += r.visits;
    a.visitors += r.visitors;
    a.pageviews += r.pageviews;
    a.bounceW += r.bounceRate * r.visits;
    a.durW += r.avgDuration * r.visits;
    a.trend.set(iso(r.weekStart), { label: r.weekLabel, visits: r.visits });
  }
  const prevByUrl = new Map<string, number>();
  for (const r of prev) prevByUrl.set(r.url, (prevByUrl.get(r.url) || 0) + r.visits);

  // недели окна (для ровного спарклайна)
  const winWeeks = allWeeks.slice(fromIdx, toIdx + 1);

  const rows: ArticleRow[] = [...byUrl.values()].map((a) => {
    const prevVisits = prevByUrl.get(a.url) || 0;
    return {
      url: a.url,
      path: a.path,
      site: a.site,
      visits: a.visits,
      visitors: a.visitors,
      pageviews: a.pageviews,
      prevVisits,
      deltaPct: deltaPct(a.visits, prevVisits),
      bounceRate: a.visits ? Math.round((a.bounceW / a.visits) * 10) / 10 : 0,
      avgDuration: a.visits ? Math.round(a.durW / a.visits) : 0,
      trend: winWeeks.map((w) => ({
        weekStart: w.weekStart,
        label: w.label,
        visits: a.trend.get(w.weekStart)?.visits || 0,
      })),
    };
  });
  rows.sort((x, y) => y.visits - x.visits);

  const totals = rows.reduce(
    (s, r) => {
      s.visits += r.visits;
      s.visitors += r.visitors;
      s.pageviews += r.pageviews;
      s.prevVisits += r.prevVisits;
      return s;
    },
    { visits: 0, visitors: 0, pageviews: 0, prevVisits: 0 }
  );

  return {
    sites,
    weeks: allWeeks,
    rangeFrom,
    rangeTo,
    totals: {
      ...totals,
      deltaPct: hasPrev ? deltaPct(totals.visits, totals.prevVisits) : null,
      articles: rows.length,
    },
    rows,
  };
}
