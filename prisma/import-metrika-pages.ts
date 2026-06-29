// Импорт SEO-трафика ПО СТРАНИЦАМ (статьям) из Яндекс.Метрики.
// Разрез ym:s:startURL (страница входа), только органика. Группируем по неделям
// (та же сетка, что у лидов/воронки), пишем в ArticleStat: сайт × URL × неделя.
//
//   npm run import:metrika:pages                 # сухой прогон, 8 недель
//   npm run import:metrika:pages -- --weeks=12 --write
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});
const API = "https://api-metrika.yandex.net/stat/v1/data";

// ---------- сетка недель (как в import-bitrix) ----------
const ANCHOR = Date.UTC(2026, 4, 6); // понедельник
const DAY = 86400000;
function weekStartOf(d: Date): Date {
  const idx = Math.floor((d.getTime() - ANCHOR) / (7 * DAY));
  return new Date(ANCHOR + idx * 7 * DAY);
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function weekLabel(start: Date): string {
  const end = new Date(start.getTime() + 6 * DAY);
  return `${pad(start.getUTCDate())}.${pad(start.getUTCMonth() + 1)}–${pad(end.getUTCDate())}.${pad(end.getUTCMonth() + 1)}`;
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + (u.search ? "" : "")).replace(/\/+$/, "") || "/";
  } catch {
    return url.replace(/^https?:\/\/[^/]+/i, "").split("?")[0].replace(/\/+$/, "") || "/";
  }
}

type Row = {
  url: string;
  visits: number;
  visitors: number;
  pageviews: number;
  bounceRate: number;
  avgDuration: number;
};

// Трафик по страницам входа за один интервал (одна неделя)
async function fetchPages(
  counter: string,
  date1: string,
  date2: string,
  token: string
): Promise<Row[]> {
  const params = new URLSearchParams({
    ids: counter,
    metrics: "ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDuration",
    dimensions: "ym:s:startURL",
    filters: "ym:s:lastsignTrafficSource=='organic'",
    date1,
    date2,
    limit: "100000",
    sort: "-ym:s:visits",
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
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  const json = await res.json();
  return (json.data || []).map(
    (row: { dimensions: { name: string }[]; metrics: number[] }) => ({
      url: row.dimensions[0].name,
      visits: Math.round(row.metrics[0] || 0),
      visitors: Math.round(row.metrics[1] || 0),
      pageviews: Math.round(row.metrics[2] || 0),
      bounceRate: Math.round((row.metrics[3] || 0) * 10) / 10,
      avgDuration: Math.round(row.metrics[4] || 0),
    })
  );
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const weeksArg = args.find((a) => a.startsWith("--weeks="));
  const nWeeks = weeksArg ? Number(weeksArg.split("=")[1]) : 8;
  const token = process.env.YANDEX_METRIKA_TOKEN;
  if (!token) throw new Error("Не задан YANDEX_METRIKA_TOKEN в .env");

  // окно: nWeeks недель назад от текущей недели
  const now = new Date();
  const curWeek = weekStartOf(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  );
  const weeks: Date[] = [];
  for (let i = nWeeks - 1; i >= 0; i--) weeks.push(new Date(curWeek.getTime() - i * 7 * DAY));

  const sites = await prisma.site.findMany({
    where: { metrikaCounter: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  console.log(
    `📥 Метрика по страницам · ${nWeeks} нед · сайтов: ${sites.length} · режим: ${write ? "ЗАПИСЬ" : "СУХОЙ ПРОГОН"}`
  );

  let written = 0;
  for (const site of sites) {
    let siteRows = 0;
    let siteVisits = 0;
    try {
      for (const ws of weeks) {
        const we = new Date(ws.getTime() + 6 * DAY);
        const rows = await fetchPages(site.metrikaCounter!, fmt(ws), fmt(we), token);
        // отбрасываем мусор без визитов
        const clean = rows.filter((r) => r.visits > 0 && r.url);
        siteRows += clean.length;
        siteVisits += clean.reduce((s, r) => s + r.visits, 0);
        if (write) {
          for (const r of clean) {
            const data = {
              path: pathOf(r.url),
              weekLabel: weekLabel(ws),
              visits: r.visits,
              visitors: r.visitors,
              pageviews: r.pageviews,
              bounceRate: r.bounceRate,
              avgDuration: r.avgDuration,
            };
            await prisma.articleStat.upsert({
              where: { site_url_weekStart: { site: site.domain, url: r.url, weekStart: ws } },
              create: { site: site.domain, url: r.url, weekStart: ws, ...data },
              update: data,
            });
            written++;
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      console.log(`  ✓ ${site.name} (${site.domain}): ${siteRows} строк URL×нед · ${siteVisits} визитов`);
    } catch (e) {
      console.log(`  ✗ ${site.name}: ${(e as Error).message}`);
    }
  }

  if (!write) {
    console.log("\n💡 Сухой прогон — в базу НЕ записано. Запись: npm run import:metrika:pages -- --write");
  } else {
    // подчищаем недели до окна (старые данные за пределами окна)
    const winFrom = weeks[0];
    await prisma.articleStat.deleteMany({ where: { weekStart: { lt: winFrom } } });
    console.log(`\n✓ ArticleStat: ${written} строк (окно с ${fmt(winFrom)})`);
    console.log("🎉 Готово — трафик по статьям обновлён");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
