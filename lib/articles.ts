import { prisma } from "./prisma";

// ---------- типы ----------
export type SortKey = "visits" | "leads" | "modified" | "delta";

export type ArticleRow = {
  url: string;
  path: string;
  site: string;
  isArticle: boolean;
  title: string | null;
  image: string | null;
  modified: string | null; // YYYY-MM-DD
  leads: number; // обращения с этой страницы входа (органика)
  conv: number; // конверсия лиды/визиты, %
  visits: number;
  visitors: number;
  pageviews: number;
  prevVisits: number;
  deltaPct: number | null; // null = не с чем сравнивать
  bounceRate: number; // средневзвешенный, %
  avgDuration: number; // средневзвешенная, сек
  trend: number[]; // визиты по неделям внутри периода (для спарклайна)
};

export type ArticlesData = {
  sites: string[];
  bounds: { min: string; max: string } | null; // доступный диапазон дат
  rangeFrom: string;
  rangeTo: string;
  onlyArticles: boolean;
  sort: SortKey;
  totals: {
    visits: number;
    visitors: number;
    pageviews: number;
    leads: number;
    conv: number;
    prevVisits: number;
    deltaPct: number | null;
    pages: number;
  };
  rows: ArticleRow[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86400000;

// Контент-страница (статья) = путь минимум из 2 сегментов (/blog/slug),
// чтобы отсечь главную «/» и языковые корни «/kz», «/ar».
function isArticlePath(path: string): boolean {
  return path.split("/").filter(Boolean).length >= 2;
}

export async function getArticleSites(): Promise<string[]> {
  const rows = await prisma.articleStat.findMany({
    distinct: ["site"],
    orderBy: { site: "asc" },
    select: { site: true },
  });
  return rows.map((r) => r.site);
}

async function getBounds(): Promise<{ min: string; max: string } | null> {
  const min = await prisma.articleStat.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
  const max = await prisma.articleStat.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  if (!min || !max) return null;
  return { min: iso(min.date), max: iso(max.date) };
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// Понедельник недели для даты (для бакетов спарклайна)
function weekKey(d: Date): number {
  const day = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY;
}

// Каноничный ключ URL/пути: срезаем query/fragment/пробел/%-хвост и завершающие
// слэши. Иначе одна статья дробится на варианты (?source=…, /&…/, %20…) и счётчики
// «страниц/статей» завышаются почти вдвое (баг H1 аудита).
function canon(s: string): string {
  let x = (s || "").split(/[?&#\s]/)[0];
  x = x.replace(/%[0-9a-fA-F]{2}.*$/, "");
  x = x.replace(/\/+$/, "");
  return x || "/";
}

export async function getArticlesData(
  site: string | "ALL",
  from: string | null,
  to: string | null,
  onlyArticles: boolean,
  sort: SortKey = "visits"
): Promise<ArticlesData> {
  const sites = await getArticleSites();
  const bounds = await getBounds();
  if (!bounds) {
    return {
      sites,
      bounds: null,
      rangeFrom: from || "",
      rangeTo: to || "",
      onlyArticles,
      sort,
      totals: { visits: 0, visitors: 0, pageviews: 0, leads: 0, conv: 0, prevVisits: 0, deltaPct: null, pages: 0 },
      rows: [],
    };
  }

  // Период целиком вне данных → пусто (а не схлоп в один день).
  if ((from && from > bounds.max) || (to && to < bounds.min)) {
    return {
      sites, bounds, rangeFrom: from || bounds.min, rangeTo: to || bounds.max, onlyArticles, sort,
      totals: { visits: 0, visitors: 0, pageviews: 0, leads: 0, conv: 0, prevVisits: 0, deltaPct: null, pages: 0 },
      rows: [],
    };
  }
  // Резолвим диапазон: по умолчанию последние 30 дней доступных данных.
  const clamp = (d: string) => (d < bounds.min ? bounds.min : d > bounds.max ? bounds.max : d);
  let rangeTo = to ? clamp(to) : bounds.max;
  let rangeFrom = from ? clamp(from) : iso(new Date(new Date(rangeTo).getTime() - 29 * DAY));
  if (rangeFrom > rangeTo) rangeFrom = rangeTo;

  const fromD = new Date(rangeFrom);
  const toD = new Date(rangeTo);
  const lenDays = Math.round((toD.getTime() - fromD.getTime()) / DAY) + 1;
  // предыдущий период той же длины, впритык перед текущим
  const prevTo = new Date(fromD.getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - (lenDays - 1) * DAY);

  const whereSite = site && site !== "ALL" ? { site } : {};

  const cur = await prisma.articleStat.findMany({
    where: { ...whereSite, date: { gte: fromD, lte: toD } },
    select: {
      site: true, url: true, path: true, date: true,
      visits: true, visitors: true, pageviews: true, bounceRate: true, avgDuration: true, leads: true,
    },
  });
  const prev = await prisma.articleStat.findMany({
    where: { ...whereSite, date: { gte: prevFrom, lte: prevTo } },
    select: { url: true, visits: true },
  });

  // недельные бакеты для спарклайна
  const buckets: number[] = [];
  const bucketIndex = new Map<number, number>();
  for (let t = weekKey(fromD); t <= toD.getTime(); t += 7 * DAY) {
    bucketIndex.set(t, buckets.length);
    buckets.push(t);
  }

  type Acc = {
    url: string; path: string; site: string;
    visits: number; visitors: number; pageviews: number; leads: number;
    bounceW: number; durW: number;
    trend: number[];
  };
  const byUrl = new Map<string, Acc>();
  for (const r of cur) {
    const key = canon(r.url); // мёржим варианты одной статьи
    let a = byUrl.get(key);
    if (!a) {
      a = { url: key, path: canon(r.path), site: r.site, visits: 0, visitors: 0, pageviews: 0, leads: 0, bounceW: 0, durW: 0, trend: new Array(buckets.length).fill(0) };
      byUrl.set(key, a);
    }
    a.visits += r.visits;
    a.visitors += r.visitors;
    a.pageviews += r.pageviews;
    a.leads += r.leads;
    a.bounceW += r.bounceRate * r.visits;
    a.durW += r.avgDuration * r.visits;
    const bi = bucketIndex.get(weekKey(r.date));
    if (bi !== undefined) a.trend[bi] += r.visits;
  }
  const prevByUrl = new Map<string, number>();
  for (const r of prev) {
    const k = canon(r.url);
    prevByUrl.set(k, (prevByUrl.get(k) || 0) + r.visits);
  }

  // метаданные страниц (заголовок/картинка/дата обновления).
  // Ключуем по каноничному URL — иначе мусорные варианты не находят метаданные.
  const metaRows = await prisma.articlePage.findMany({
    select: { url: true, title: true, image: true, modified: true },
  });
  const metaByUrl = new Map(metaRows.map((m) => [canon(m.url), m]));

  let rows: ArticleRow[] = [...byUrl.values()].map((a) => {
    const prevVisits = prevByUrl.get(a.url) || 0;
    const meta = metaByUrl.get(a.url);
    return {
      url: a.url,
      path: a.path,
      site: a.site,
      isArticle: isArticlePath(a.path),
      title: meta?.title ?? null,
      image: meta?.image ?? null,
      modified: meta?.modified ? iso(meta.modified) : null,
      leads: a.leads,
      conv: a.visits ? Math.round((a.leads / a.visits) * 1000) / 10 : 0,
      visits: a.visits,
      visitors: a.visitors,
      pageviews: a.pageviews,
      prevVisits,
      deltaPct: deltaPct(a.visits, prevVisits),
      bounceRate: a.visits ? Math.round((a.bounceW / a.visits) * 10) / 10 : 0,
      avgDuration: a.visits ? Math.round(a.durW / a.visits) : 0,
      trend: a.trend,
    };
  });
  if (onlyArticles) rows = rows.filter((r) => r.isArticle);

  const byVisits = (x: ArticleRow, y: ArticleRow) => y.visits - x.visits;
  if (sort === "leads") {
    rows.sort((x, y) => y.leads - x.leads || byVisits(x, y));
  } else if (sort === "modified") {
    // по дате обновления (свежие сверху); без даты — вниз, дальше по визитам
    rows.sort((x, y) => {
      if (x.modified && y.modified) return x.modified < y.modified ? 1 : x.modified > y.modified ? -1 : byVisits(x, y);
      if (x.modified) return -1;
      if (y.modified) return 1;
      return byVisits(x, y);
    });
  } else if (sort === "delta") {
    // «По росту»: новые/малобазовые (prev<10) — вверх по трафику, дальше по %.
    const low = (r: ArticleRow) => r.prevVisits < 10 && r.visits > 0;
    rows.sort((x, y) => {
      const xl = low(x), yl = low(y);
      if (xl !== yl) return xl ? -1 : 1;
      if (xl && yl) return byVisits(x, y);
      return (y.deltaPct ?? -1e9) - (x.deltaPct ?? -1e9) || byVisits(x, y);
    });
  } else {
    rows.sort(byVisits);
  }

  const totals = rows.reduce(
    (s, r) => {
      s.visits += r.visits;
      s.visitors += r.visitors;
      s.pageviews += r.pageviews;
      s.leads += r.leads;
      s.prevVisits += r.prevVisits;
      return s;
    },
    { visits: 0, visitors: 0, pageviews: 0, leads: 0, prevVisits: 0 }
  );

  return {
    sites,
    bounds,
    rangeFrom,
    rangeTo,
    onlyArticles,
    sort,
    totals: {
      ...totals,
      conv: totals.visits ? Math.round((totals.leads / totals.visits) * 1000) / 10 : 0,
      deltaPct: deltaPct(totals.visits, totals.prevVisits),
      pages: rows.length,
    },
    rows,
  };
}
