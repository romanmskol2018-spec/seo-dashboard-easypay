// Импорт трафика из Яндекс.Метрики по всем сайтам со счётчиком (только SEO/органика).
// Большой период разбивается на окна по 90 дней (иначе API «Query is too complicated»).
// Запуск: npm run import:metrika  (по умолчанию 90 дней)
//         npm run import:metrika -- 365
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API = "https://api-metrika.yandex.net/stat/v1/data";

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Окна по 90 дней от сегодня назад на `days`
function windows(days: number): { date1: string; date2: string }[] {
  const today = new Date();
  let end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
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

type Row = {
  date: string;
  visits: number;
  visitors: number;
  pageviews: number;
  bounceRate: number;
  avgDuration: number;
};

async function fetchRange(
  counter: string,
  date1: string,
  date2: string,
  token: string
): Promise<Row[]> {
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
  let res: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(`${API}?${params}`, {
        headers: { Authorization: `OAuth ${token}` },
      });
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  if (!res) throw new Error(`сеть: ${(lastErr as Error)?.message || "fetch failed"}`);
  if (!res.ok) {
    const text = await res.text();
    // Слишком тяжёлый запрос — делим интервал пополам и пробуем рекурсивно
    if (text.includes("too complicated") && date1 < date2) {
      const a = new Date(date1);
      const b = new Date(date2);
      const mid = new Date((a.getTime() + b.getTime()) / 2);
      const midStr = fmt(mid);
      const next = new Date(mid);
      next.setUTCDate(mid.getUTCDate() + 1);
      const left = await fetchRange(counter, date1, midStr, token);
      const right = await fetchRange(counter, fmt(next), date2, token);
      return [...left, ...right];
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
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

async function main() {
  const days = Number(process.argv[2]) || 90;
  const token = process.env.YANDEX_METRIKA_TOKEN;
  if (!token) throw new Error("Не задан YANDEX_METRIKA_TOKEN в .env");

  const sites = await prisma.site.findMany({
    where: { metrikaCounter: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  const wins = windows(days);
  console.log(`📥 Импорт из Метрики за ${days} дн. (${wins.length} окон), сайтов: ${sites.length}`);

  for (const site of sites) {
    let total = 0;
    let count = 0;
    try {
      for (const w of wins) {
        const rows = await fetchRange(site.metrikaCounter!, w.date1, w.date2, token);
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
            where: { siteId_date_source: { siteId: site.id, date, source: "all" } },
            create: { siteId: site.id, date, source: "all", ...data },
            update: data,
          });
          total += r.visits;
          count++;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      console.log(`  ✓ ${site.name}: ${count} дн., ${total} визитов`);
    } catch (e) {
      console.log(`  ✗ ${site.name}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log("🎉 Импорт завершён");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
