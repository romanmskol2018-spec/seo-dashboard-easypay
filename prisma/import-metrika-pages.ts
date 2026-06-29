// Импорт ДНЕВНОГО SEO-трафика ПО СТРАНИЦАМ (статьям) из Яндекс.Метрики.
// Разрез ym:s:startURL × ym:s:date, ТОЛЬКО органика. Пишем в ArticleStat: сайт × URL × день.
// Дневная гранулярность → периоды «месяц/год/свой диапазон» ложатся точно на календарь.
//
//   npm run import:metrika:pages                  # сухой прогон, 365 дней
//   npm run import:metrika:pages -- --days=30 --write   # обновить последние 30 дней
//   npm run import:metrika:pages -- --days=365 --write  # полный бэкафилл за год
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});
const API = "https://api-metrika.yandex.net/stat/v1/data";
const MGMT = "https://api-metrika.yandex.net/management/v1";

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Лид-цели = настоящие ОБРАЩЕНИЯ: контактные данные + клики по телефону/мессенджеру/
// email + звонок (по типу цели), плюс action-цели «отправка формы / заявка / спасибо».
// НЕ считаем микро-конверсии воронки («выбрать карту», «начало оформления»),
// длительность визита, поиск, скачивание файла, соцсети, отменённые CRM-заказы.
const LEAD_TYPES = new Set([
  "contact_data",
  "contact_data_sent",
  "phone",
  "messenger",
  "email",
  "call",
]);
// только для action-целей: явная отправка формы/заявки/обращение
const LEAD_NAME_RE = /заявк|отправк|форм|оставил|обратн|спасибо|thank|provided contact/i;

async function fetchLeadGoals(counter: string, token: string): Promise<number[]> {
  try {
    const res = await fetch(`${MGMT}/counter/${counter}/goals`, {
      headers: { Authorization: `OAuth ${token}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const goals = (json.goals || []) as { id: number; name: string; type: string }[];
    return goals
      .filter((g) => LEAD_TYPES.has(g.type) || (g.type === "action" && LEAD_NAME_RE.test(g.name || "")))
      .map((g) => g.id);
  } catch {
    return [];
  }
}

// Окна по 90 дней от сегодня назад на `days` (Метрика не любит длинные 2D-запросы)
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

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return url.replace(/^https?:\/\/[^/]+/i, "").split("?")[0].replace(/\/+$/, "") || "/";
  }
}

type Row = {
  url: string;
  date: string;
  visits: number;
  visitors: number;
  pageviews: number;
  bounceRate: number;
  avgDuration: number;
  leads: number;
};

// Трафик + лиды по страницам входа × дням за один интервал.
// goalIds — лид-цели счётчика; их достижения суммируются в leads.
async function fetchPages(
  counter: string,
  date1: string,
  date2: string,
  token: string,
  goalIds: number[]
): Promise<Row[]> {
  const goalMetrics = goalIds.map((id) => `ym:s:goal${id}reaches`);
  const params = new URLSearchParams({
    ids: counter,
    metrics: ["ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDuration", ...goalMetrics].join(","),
    dimensions: "ym:s:startURL,ym:s:date",
    filters: "ym:s:lastsignTrafficSource=='organic'",
    date1,
    date2,
    limit: "100000",
  });
  let res: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(`${API}?${params}`, { headers: { Authorization: `OAuth ${token}` } });
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  if (!res) throw new Error(`сеть: ${(lastErr as Error)?.message || "fetch failed"}`);
  if (!res.ok) {
    const text = await res.text();
    // слишком тяжёлый запрос — делим интервал пополам рекурсивно
    if (text.includes("too complicated") && date1 < date2) {
      const a = new Date(date1).getTime();
      const b = new Date(date2).getTime();
      const mid = new Date((a + b) / 2);
      const next = new Date(mid);
      next.setUTCDate(mid.getUTCDate() + 1);
      const left = await fetchPages(counter, date1, fmt(mid), token, goalIds);
      const right = await fetchPages(counter, fmt(next), date2, token, goalIds);
      return [...left, ...right];
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  const json = await res.json();
  return (json.data || []).map(
    (row: { dimensions: { name: string }[]; metrics: number[] }) => {
      // лиды = сумма достижений всех лид-целей (метрики после первых пяти трафиковых)
      let leads = 0;
      for (let i = 5; i < row.metrics.length; i++) leads += row.metrics[i] || 0;
      return {
        url: row.dimensions[0].name,
        date: row.dimensions[1].name,
        visits: Math.round(row.metrics[0] || 0),
        visitors: Math.round(row.metrics[1] || 0),
        pageviews: Math.round(row.metrics[2] || 0),
        bounceRate: Math.round((row.metrics[3] || 0) * 10) / 10,
        avgDuration: Math.round(row.metrics[4] || 0),
        leads: Math.round(leads),
      };
    }
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const daysArg = args.find((a) => a.startsWith("--days="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 365;
  const token = process.env.YANDEX_METRIKA_TOKEN;
  if (!token) throw new Error("Не задан YANDEX_METRIKA_TOKEN в .env");

  const sites = await prisma.site.findMany({
    where: { metrikaCounter: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  const wins = windows(days);
  console.log(
    `📥 Метрика по страницам (дни) · ${days} дн (${wins.length} окон) · сайтов: ${sites.length} · режим: ${write ? "ЗАПИСЬ" : "СУХОЙ ПРОГОН"}`
  );

  let written = 0;
  for (const site of sites) {
    let siteRows = 0;
    let siteVisits = 0;
    let siteLeads = 0;
    const goalIds = await fetchLeadGoals(site.metrikaCounter!, token);
    try {
      for (const w of wins) {
        const rows = (await fetchPages(site.metrikaCounter!, w.date1, w.date2, token, goalIds)).filter(
          (r) => r.visits > 0 && r.url
        );
        siteRows += rows.length;
        siteVisits += rows.reduce((s, r) => s + r.visits, 0);
        siteLeads += rows.reduce((s, r) => s + r.leads, 0);
        if (write && rows.length) {
          // точечная замена этого окна по сайту (старое за пределами окна не трогаем)
          await prisma.articleStat.deleteMany({
            where: { site: site.domain, date: { gte: new Date(w.date1), lte: new Date(w.date2) } },
          });
          const data = rows.map((r) => ({
            site: site.domain,
            url: r.url,
            path: pathOf(r.url),
            date: new Date(r.date),
            visits: r.visits,
            visitors: r.visitors,
            pageviews: r.pageviews,
            bounceRate: r.bounceRate,
            avgDuration: r.avgDuration,
            leads: r.leads,
          }));
          for (const part of chunk(data, 3000)) {
            const c = await prisma.articleStat.createMany({ data: part, skipDuplicates: true });
            written += c.count;
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      console.log(`  ✓ ${site.name} (${site.domain}): ${siteRows} строк · ${siteVisits} визитов · ${siteLeads} лидов · целей: ${goalIds.length}`);
    } catch (e) {
      console.log(`  ✗ ${site.name}: ${(e as Error).message}`);
    }
  }

  if (!write) {
    console.log("\n💡 Сухой прогон — в базу НЕ записано. Запись: npm run import:metrika:pages -- --write");
  } else {
    console.log(`\n✓ ArticleStat: ${written} строк записано`);
    console.log("🎉 Готово — дневной трафик по статьям обновлён");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
