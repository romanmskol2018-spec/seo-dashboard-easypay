// Импорт ДНЕВНОГО реферального трафика по ПЛОЩАДКАМ-ДОНОРАМ из Яндекс.Метрики.
// Разрез ym:s:referer × ym:s:date, источник = referral. Реферер сворачиваем в домен
// (донор), считаем визиты + лиды (достижения лид-целей на реферальных визитах).
// Пишем в PlacementStat: наш сайт × донор × день.
//
//   npm run import:referrals                       # сухой прогон, 365 дней
//   npm run import:referrals -- --days=30 --write  # обновить последние 30 дней
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});
const API = "https://api-metrika.yandex.net/stat/v1/data";
const MGMT = "https://api-metrika.yandex.net/management/v1";

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// те же лид-цели, что у статей (настоящие обращения)
const LEAD_TYPES = new Set(["contact_data", "contact_data_sent", "phone", "messenger", "email", "call"]);
const LEAD_NAME_RE = /заявк|отправк|форм|оставил|обратн|спасибо|thank|provided contact/i;

async function fetchLeadGoals(counter: string, token: string): Promise<number[]> {
  try {
    const res = await fetch(`${MGMT}/counter/${counter}/goals`, { headers: { Authorization: `OAuth ${token}` } });
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

function hostOf(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

type Raw = { referer: string; date: string; visits: number; visitors: number; leads: number };

async function metrikaData(params: URLSearchParams, token: string, split: () => Promise<unknown[]>): Promise<unknown[]> {
  let res: Response | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { res = await fetch(`${API}?${params}`, { headers: { Authorization: `OAuth ${token}` } }); break; }
    catch { await new Promise((r) => setTimeout(r, 1500 * attempt)); }
  }
  if (!res) throw new Error("сеть: fetch failed");
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("too complicated")) return split();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  return (await res.json()).data || [];
}

// Реферальный трафик по рефереру × дням. Лиды = УНИКАЛЬНЫЕ визиты с лид-целью
// (сегмент «любая лид-цель»), считаются отдельным запросом и мерджатся по referer×дата.
async function fetchReferrals(
  counter: string, date1: string, date2: string, token: string, goalIds: number[]
): Promise<Raw[]> {
  const tParams = new URLSearchParams({
    ids: counter, metrics: "ym:s:visits,ym:s:users",
    dimensions: "ym:s:referer,ym:s:date", filters: "ym:s:lastsignTrafficSource=='referral'",
    date1, date2, limit: "100000",
  });
  const tSplit = async (): Promise<unknown[]> => {
    if (date1 >= date2) return [];
    const mid = new Date((new Date(date1).getTime() + new Date(date2).getTime()) / 2);
    const next = new Date(mid); next.setUTCDate(mid.getUTCDate() + 1);
    return [...(await fetchReferrals(counter, date1, fmt(mid), token, goalIds)),
            ...(await fetchReferrals(counter, fmt(next), date2, token, goalIds))] as unknown[];
  };
  // если потребуется сплит — tSplit вернёт уже готовые Raw[]; иначе мерджим лиды
  const tData = await metrikaData(tParams, token, tSplit);
  if (tData.length && (tData[0] as Raw).referer !== undefined) return tData as Raw[]; // пришёл результат сплита

  // лид-визиты по рефереру×дата
  const leadMap = new Map<string, number>();
  if (goalIds.length) {
    const seg = goalIds.map((id) => `ym:s:goal=='${id}'`).join(" OR ");
    const lParams = new URLSearchParams({
      ids: counter, metrics: "ym:s:visits", dimensions: "ym:s:referer,ym:s:date",
      filters: `(${seg}) AND ym:s:lastsignTrafficSource=='referral'`, date1, date2, limit: "100000",
    });
    const lData = await metrikaData(lParams, token, async () => []);
    for (const row of lData as { dimensions: { name: string }[]; metrics: number[] }[])
      leadMap.set(`${row.dimensions[0].name}|${row.dimensions[1].name}`, Math.round(row.metrics[0] || 0));
  }
  return (tData as { dimensions: { name: string }[]; metrics: number[] }[]).map((row) => {
    const referer = row.dimensions[0].name || "";
    const date = row.dimensions[1].name;
    return {
      referer, date,
      visits: Math.round(row.metrics[0] || 0),
      visitors: Math.round(row.metrics[1] || 0),
      leads: leadMap.get(`${referer}|${date}`) || 0,
    };
  });
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
    where: { metrikaCounter: { not: null } }, orderBy: { createdAt: "asc" },
  });
  // свои домены — исключаем из доноров (self/кросс-рефералы), включая сабдомены
  const ourList = sites.map((s) => s.domain.replace(/^www\./, "").toLowerCase());
  const isOurs = (h: string) => ourList.some((d) => h === d || h.endsWith("." + d));
  const wins = windows(days);
  console.log(`📥 Метрика рефералы · ${days} дн (${wins.length} окон) · сайтов: ${sites.length} · режим: ${write ? "ЗАПИСЬ" : "СУХОЙ ПРОГОН"}`);

  let written = 0;
  for (const site of sites) {
    const goalIds = await fetchLeadGoals(site.metrikaCounter!, token);
    let siteDonors = 0, siteVisits = 0, siteLeads = 0;
    try {
      for (const w of wins) {
        const raw = await fetchReferrals(site.metrikaCounter!, w.date1, w.date2, token, goalIds);
        // свернуть referer→домен, агрегировать по (донор, дата)
        const agg = new Map<string, { donor: string; date: string; v: number; u: number; l: number }>();
        for (const r of raw) {
          if (r.visits <= 0) continue;
          const h = hostOf(r.referer);
          if (!h || isOurs(h)) continue;
          const k = h + "|" + r.date;
          const a = agg.get(k) || { donor: h, date: r.date, v: 0, u: 0, l: 0 };
          a.v += r.visits; a.u += r.visitors; a.l += r.leads;
          agg.set(k, a);
        }
        const rows = [...agg.values()];
        siteDonors += new Set(rows.map((r) => r.donor)).size;
        siteVisits += rows.reduce((s, r) => s + r.v, 0);
        siteLeads += rows.reduce((s, r) => s + r.l, 0);
        if (write && rows.length) {
          await prisma.placementStat.deleteMany({
            where: { ourSite: site.domain, date: { gte: new Date(w.date1), lte: new Date(w.date2) } },
          });
          const data = rows.map((r) => ({
            ourSite: site.domain, donor: r.donor, date: new Date(r.date),
            visits: r.v, visitors: r.u, leads: r.l,
          }));
          for (const part of chunk(data, 3000)) {
            const c = await prisma.placementStat.createMany({ data: part, skipDuplicates: true });
            written += c.count;
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      console.log(`  ✓ ${site.name} (${site.domain}): ${siteVisits} визитов · ${siteLeads} лидов · доноров-строк: ${siteDonors} · целей: ${goalIds.length}`);
    } catch (e) {
      console.log(`  ✗ ${site.name}: ${(e as Error).message}`);
    }
  }

  if (!write) console.log("\n💡 Сухой прогон — в базу НЕ записано. Запись: npm run import:referrals -- --write");
  else console.log(`\n✓ PlacementStat: ${written} строк записано\n🎉 Готово — рефералы по донорам обновлены`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
