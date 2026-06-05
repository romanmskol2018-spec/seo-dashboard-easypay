import { prisma } from "@/lib/prisma";

const API = "https://api-metrika.yandex.net/stat/v1/data";

export type MetrikaDayRow = {
  date: string; // YYYY-MM-DD
  visits: number;
  visitors: number;
  pageviews: number;
  bounceRate: number;
  avgDuration: number;
};

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Окна по 90 дней (большой период иначе вызывает "Query is too complicated")
function windows(days: number): { date1: string; date2: string }[] {
  const t = new Date();
  let end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  let remaining = days;
  const res: { date1: string; date2: string }[] = [];
  while (remaining > 0) {
    const span = Math.min(90, remaining);
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - (span - 1));
    res.push({ date1: fmt(start), date2: fmt(end) });
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() - 1);
    remaining -= span;
  }
  return res;
}

// Один интервал; при "too complicated" делит пополам рекурсивно
async function fetchWindow(
  counter: string,
  date1: string,
  date2: string,
  token: string
): Promise<MetrikaDayRow[]> {
  const params = new URLSearchParams({
    ids: counter,
    metrics:
      "ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDuration",
    dimensions: "ym:s:date",
    filters: "ym:s:lastsignTrafficSource=='organic'",
    date1,
    date2,
    group: "day",
    limit: "100000",
  });
  const res = await fetch(`${API}?${params.toString()}`, {
    headers: { Authorization: `OAuth ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (text.includes("too complicated") && date1 < date2) {
      const mid = new Date(
        (new Date(date1).getTime() + new Date(date2).getTime()) / 2
      );
      const next = new Date(mid);
      next.setUTCDate(mid.getUTCDate() + 1);
      return [
        ...(await fetchWindow(counter, date1, fmt(mid), token)),
        ...(await fetchWindow(counter, fmt(next), date2, token)),
      ];
    }
    throw new Error(`Метрика ${counter}: HTTP ${res.status} ${text.slice(0, 160)}`);
  }
  const json = await res.json();
  return (json.data || []).map(
    (row: { dimensions: { name: string }[]; metrics: number[] }) => ({
      date: row.dimensions[0].name,
      visits: Math.round(row.metrics[0] || 0),
      visitors: Math.round(row.metrics[1] || 0),
      pageviews: Math.round(row.metrics[2] || 0),
      bounceRate: Math.round((row.metrics[3] || 0) * 10) / 10,
      avgDuration: Math.round(row.metrics[4] || 0),
    })
  );
}

// Запрос дневной статистики по одному счётчику за период (с разбивкой на окна)
export async function fetchCounterTraffic(
  counter: string,
  days: number,
  token: string
): Promise<MetrikaDayRow[]> {
  const all: MetrikaDayRow[] = [];
  for (const w of windows(days)) {
    all.push(...(await fetchWindow(counter, w.date1, w.date2, token)));
  }
  return all;
}

export type ImportResult = {
  site: string;
  counter: string;
  ok: boolean;
  rows?: number;
  error?: string;
};

// Импорт трафика по всем сайтам, у которых указан счётчик Метрики
export async function importMetrikaForAllSites(
  days: number
): Promise<ImportResult[]> {
  const token = process.env.YANDEX_METRIKA_TOKEN;
  if (!token) throw new Error("Не задан YANDEX_METRIKA_TOKEN");

  const sites = await prisma.site.findMany({
    where: { metrikaCounter: { not: null } },
    orderBy: { createdAt: "asc" },
  });

  const results: ImportResult[] = [];
  for (const site of sites) {
    const counter = site.metrikaCounter!;
    try {
      const rows = await fetchCounterTraffic(counter, days, token);
      for (const r of rows) {
        const date = new Date(r.date);
        const data = {
          visits: r.visits,
          visitors: r.visitors,
          pageviews: r.pageviews,
          bounceRate: r.bounceRate,
          avgDuration: r.avgDuration,
        };
        await prisma.trafficData.upsert({
          where: {
            siteId_date_source: { siteId: site.id, date, source: "all" },
          },
          create: { siteId: site.id, date, source: "all", ...data },
          update: data,
        });
      }
      results.push({
        site: site.name,
        counter,
        ok: true,
        rows: rows.length,
      });
    } catch (e) {
      results.push({
        site: site.name,
        counter,
        ok: false,
        error: (e as Error).message,
      });
    }
  }
  return results;
}
