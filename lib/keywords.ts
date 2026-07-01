import { prisma } from "./prisma";

export type KeywordRow = {
  query: string;
  cluster: string | null;
  url: string | null;
  position: number | null;
  prevPosition: number | null;
  delta: number | null; // улучшение позиции (prev - cur): >0 = вверх
  move: "in" | "out" | null; // впервые в выдаче / выпал из выдачи
};

export type KeywordsData = {
  engine: string;
  clusters: string[];
  sites: string[];
  rows: KeywordRow[];
  totals: { tracked: number; ranked: number; top3: number; top10: number; avg: number | null };
  filterUrl: string | null;
  filterCluster: string | null;
  site: string;
};

// сводка позиций по URL (для колонки в таблице статей) — по Яндексу
export type UrlKwSummary = { queries: number; top10: number; best: number | null };

export async function getKeywordSummaryByUrl(
  urls: string[],
  engine = "Яндекс"
): Promise<Map<string, UrlKwSummary>> {
  const out = new Map<string, UrlKwSummary>();
  if (!urls.length) return out;
  const rows = await prisma.keywordPosition.findMany({
    where: { url: { in: urls }, searchEngine: engine },
    select: { url: true, position: true },
  });
  for (const r of rows) {
    if (!r.url) continue;
    const s = out.get(r.url) || { queries: 0, top10: 0, best: null };
    s.queries++;
    if (r.position !== null) {
      if (r.position <= 10) s.top10++;
      if (s.best === null || r.position < s.best) s.best = r.position;
    }
    out.set(r.url, s);
  }
  return out;
}

export async function getKeywordFilters(): Promise<{ clusters: string[]; sites: string[] }> {
  const [cl, st] = await Promise.all([
    prisma.keywordPosition.findMany({ distinct: ["cluster"], where: { cluster: { not: null } }, select: { cluster: true }, orderBy: { cluster: "asc" } }),
    prisma.keywordPosition.findMany({ distinct: ["site"], select: { site: true }, orderBy: { site: "asc" } }),
  ]);
  return {
    clusters: cl.map((c) => c.cluster!).filter(Boolean),
    sites: st.map((s) => s.site),
  };
}

export async function getKeywordsData(opts: {
  site?: string | "ALL";
  cluster?: string | null;
  url?: string | null;
  engine?: string;
  sort?: "position" | "delta";
}): Promise<KeywordsData> {
  const engine = opts.engine === "Google" ? "Google" : "Яндекс";
  const { clusters, sites } = await getKeywordFilters();
  const where: Record<string, unknown> = { searchEngine: engine };
  if (opts.url) where.url = opts.url;
  if (opts.cluster) where.cluster = opts.cluster;
  if (opts.site && opts.site !== "ALL") where.site = opts.site;

  const raw = await prisma.keywordPosition.findMany({
    where,
    select: { query: true, cluster: true, url: true, position: true, prevPosition: true },
    take: 10000,
  });

  const rows: KeywordRow[] = raw.map((r) => {
    const enteredIdx = r.prevPosition === null && r.position !== null; // впервые в выдаче
    const leftIdx = r.prevPosition !== null && r.position === null; // выпал из выдачи
    return {
      query: r.query,
      cluster: r.cluster,
      url: r.url,
      position: r.position,
      prevPosition: r.prevPosition,
      delta: r.position !== null && r.prevPosition !== null ? r.prevPosition - r.position : null,
      move: enteredIdx ? "in" : leftIdx ? "out" : null,
    };
  });

  // сортировка: по позиции (лучшие сверху, вне выдачи — вниз) или по росту.
  // «По росту»: вошедшие в выдачу — вверх, выпавшие — вниз, остальное по delta.
  const posKey = (p: number | null) => (p === null ? 1e9 : p);
  if (opts.sort === "delta") {
    const rank = (r: KeywordRow) => (r.move === "in" ? 1e6 : r.move === "out" ? -1e6 : (r.delta ?? -1e9));
    rows.sort((a, b) => rank(b) - rank(a) || posKey(a.position) - posKey(b.position));
  } else {
    rows.sort((a, b) => posKey(a.position) - posKey(b.position));
  }

  const ranked = rows.filter((r) => r.position !== null);
  const totals = {
    tracked: rows.length,
    ranked: ranked.length,
    top3: ranked.filter((r) => r.position! <= 3).length,
    top10: ranked.filter((r) => r.position! <= 10).length,
    avg: ranked.length ? Math.round((ranked.reduce((s, r) => s + r.position!, 0) / ranked.length) * 10) / 10 : null,
  };

  return {
    engine, clusters, sites, rows, totals,
    filterUrl: opts.url || null,
    filterCluster: opts.cluster || null,
    site: opts.site && opts.site !== "ALL" ? opts.site : "ALL",
  };
}
