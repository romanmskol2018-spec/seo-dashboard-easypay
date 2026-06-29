import { prisma } from "./prisma";

export type PlacementSortKey = "visits" | "leads" | "delta";

export type PlacementRow = {
  donor: string;
  visits: number;
  visitors: number;
  leads: number;
  conv: number; // лиды/визиты, %
  prevVisits: number;
  deltaPct: number | null;
  trend: number[];
};

export type PlacementsData = {
  sites: string[];
  bounds: { min: string; max: string } | null;
  rangeFrom: string;
  rangeTo: string;
  sort: PlacementSortKey;
  totals: { visits: number; visitors: number; leads: number; conv: number; donors: number; deltaPct: number | null };
  rows: PlacementRow[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86400000;

function deltaPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}
function weekKey(d: Date): number {
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY;
}

export async function getPlacementSites(): Promise<string[]> {
  const rows = await prisma.placementStat.findMany({ distinct: ["ourSite"], orderBy: { ourSite: "asc" }, select: { ourSite: true } });
  return rows.map((r) => r.ourSite);
}

async function getBounds(): Promise<{ min: string; max: string } | null> {
  const min = await prisma.placementStat.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
  const max = await prisma.placementStat.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  if (!min || !max) return null;
  return { min: iso(min.date), max: iso(max.date) };
}

export async function getPlacementsData(
  site: string | "ALL",
  from: string | null,
  to: string | null,
  sort: PlacementSortKey = "visits"
): Promise<PlacementsData> {
  const sites = await getPlacementSites();
  const bounds = await getBounds();
  if (!bounds) {
    return {
      sites, bounds: null, rangeFrom: from || "", rangeTo: to || "", sort,
      totals: { visits: 0, visitors: 0, leads: 0, conv: 0, donors: 0, deltaPct: null }, rows: [],
    };
  }
  const clamp = (d: string) => (d < bounds.min ? bounds.min : d > bounds.max ? bounds.max : d);
  let rangeTo = to ? clamp(to) : bounds.max;
  let rangeFrom = from ? clamp(from) : iso(new Date(new Date(rangeTo).getTime() - 29 * DAY));
  if (rangeFrom > rangeTo) rangeFrom = rangeTo;

  const fromD = new Date(rangeFrom), toD = new Date(rangeTo);
  const lenDays = Math.round((toD.getTime() - fromD.getTime()) / DAY) + 1;
  const prevTo = new Date(fromD.getTime() - DAY);
  const prevFrom = new Date(prevTo.getTime() - (lenDays - 1) * DAY);
  const whereSite = site && site !== "ALL" ? { ourSite: site } : {};

  const cur = await prisma.placementStat.findMany({
    where: { ...whereSite, date: { gte: fromD, lte: toD } },
    select: { donor: true, date: true, visits: true, visitors: true, leads: true },
  });
  const prev = await prisma.placementStat.findMany({
    where: { ...whereSite, date: { gte: prevFrom, lte: prevTo } },
    select: { donor: true, visits: true },
  });

  const buckets: number[] = [];
  const bucketIndex = new Map<number, number>();
  for (let t = weekKey(fromD); t <= toD.getTime(); t += 7 * DAY) {
    bucketIndex.set(t, buckets.length);
    buckets.push(t);
  }

  type Acc = { donor: string; visits: number; visitors: number; leads: number; trend: number[] };
  const byDonor = new Map<string, Acc>();
  for (const r of cur) {
    let a = byDonor.get(r.donor);
    if (!a) { a = { donor: r.donor, visits: 0, visitors: 0, leads: 0, trend: new Array(buckets.length).fill(0) }; byDonor.set(r.donor, a); }
    a.visits += r.visits; a.visitors += r.visitors; a.leads += r.leads;
    const bi = bucketIndex.get(weekKey(r.date));
    if (bi !== undefined) a.trend[bi] += r.visits;
  }
  const prevByDonor = new Map<string, number>();
  for (const r of prev) prevByDonor.set(r.donor, (prevByDonor.get(r.donor) || 0) + r.visits);

  let rows: PlacementRow[] = [...byDonor.values()].map((a) => {
    const prevVisits = prevByDonor.get(a.donor) || 0;
    return {
      donor: a.donor, visits: a.visits, visitors: a.visitors, leads: a.leads,
      conv: a.visits ? Math.round((a.leads / a.visits) * 1000) / 10 : 0,
      prevVisits, deltaPct: deltaPct(a.visits, prevVisits), trend: a.trend,
    };
  });

  const byVisits = (x: PlacementRow, y: PlacementRow) => y.visits - x.visits;
  if (sort === "leads") rows.sort((x, y) => y.leads - x.leads || byVisits(x, y));
  else if (sort === "delta") rows.sort((x, y) => (y.deltaPct ?? -1e9) - (x.deltaPct ?? -1e9) || byVisits(x, y));
  else rows.sort(byVisits);

  const totals = rows.reduce(
    (s, r) => { s.visits += r.visits; s.visitors += r.visitors; s.leads += r.leads; s.prevVisits += r.prevVisits; return s; },
    { visits: 0, visitors: 0, leads: 0, prevVisits: 0 }
  );

  return {
    sites, bounds, rangeFrom, rangeTo, sort,
    totals: {
      visits: totals.visits, visitors: totals.visitors, leads: totals.leads,
      conv: totals.visits ? Math.round((totals.leads / totals.visits) * 1000) / 10 : 0,
      donors: rows.length,
      deltaPct: deltaPct(totals.visits, totals.prevVisits),
    },
    rows,
  };
}
