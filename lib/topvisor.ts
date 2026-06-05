import { prisma } from "@/lib/prisma";

const BASE = "https://api.topvisor.com/v2/json";

// Поисковик → индекс региона в Топвизоре
const ENGINES = [
  { name: "Яндекс", region: 1 },
  { name: "Google", region: 2 },
];

type Series = {
  visibility?: (number | null)[];
  avg?: (number | null)[];
  tops?: Record<string, (number | null)[]>;
};
type ChartResult = {
  result: { seriesByProjectsId: Record<string, Series>; dates: string[] };
};

function creds() {
  const userId = process.env.TOPVISOR_USER_ID;
  const apiKey = process.env.TOPVISOR_API_KEY;
  const projectId = Number(process.env.TOPVISOR_PROJECT_ID);
  if (!userId || !apiKey || !projectId) {
    throw new Error("Не заданы TOPVISOR_USER_ID / TOPVISOR_API_KEY / TOPVISOR_PROJECT_ID");
  }
  return { userId, apiKey, projectId };
}

async function tv(path: string, body: unknown) {
  const { userId, apiKey } = creds();
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "User-Id": userId,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(
      `${path}: ${json.errors.map((e: { string: string }) => e.string).join(", ")}`
    );
  }
  return json;
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function num(v: number | null | undefined): number {
  return typeof v === "number" ? v : 0;
}

async function fetchChart(
  competitorsIds: number[] | null,
  regionIndex: number,
  date1: string,
  date2: string
): Promise<ChartResult["result"]> {
  const { projectId } = creds();
  const body: Record<string, unknown> = {
    project_id: projectId,
    region_index: regionIndex,
    show_visibility: true,
    show_avg: true,
    show_tops: true,
    date1,
    date2,
    type_range: 2,
  };
  if (competitorsIds) body.competitors_ids = competitorsIds;
  const json = (await tv("get/positions_2/summary/chart/", body)) as ChartResult;
  return json.result;
}

export async function importTopvisorVisibility(
  days: number
): Promise<{ imported: number; engines: string[] }> {
  const { projectId } = creds();
  const date1 = daysAgoISO(days);
  const date2 = daysAgoISO(0);

  const projInfo = await tv("get/projects_2/projects/", {
    fields: ["id", "site"],
    filters: [{ name: "id", operator: "EQUALS", values: [projectId] }],
  });
  const mainDomain: string = projInfo.result[0].site;

  const compRes = await tv("get/projects_2/competitors/", {
    project_id: projectId,
    fields: ["id", "site", "on"],
  });
  const enabled: { id: number; site: string; on: number }[] =
    compRes.result.filter((c: { on: number }) => c.on !== -1);

  const idToDomain = new Map<string, string>();
  idToDomain.set(String(projectId), mainDomain);
  for (const c of enabled) idToDomain.set(String(c.id), c.site);

  const ourProjects = await prisma.project.findMany({ include: { site: true } });
  const domainToProjectId = new Map<string, string>();
  for (const p of ourProjects) {
    if (p.site?.domain) domainToProjectId.set(p.site.domain.toLowerCase(), p.id);
  }

  let imported = 0;
  for (const eng of ENGINES) {
    const charts = [
      await fetchChart(null, eng.region, date1, date2),
      await fetchChart(enabled.map((c) => c.id), eng.region, date1, date2),
    ];
    for (const chart of charts) {
      const dates = chart.dates;
      for (const [seriesId, series] of Object.entries(chart.seriesByProjectsId)) {
        const domain = idToDomain.get(seriesId);
        if (!domain) continue;
        const ourId = domainToProjectId.get(domain.toLowerCase());
        if (!ourId) continue;
        const tops = series.tops || {};
        for (let i = 0; i < dates.length; i++) {
          const vis = series.visibility?.[i];
          if (vis === null || vis === undefined) continue;
          const date = new Date(dates[i]);
          const data = {
            visibility: Math.round(num(vis) * 100) / 100,
            avgPosition: Math.round(num(series.avg?.[i]) * 10) / 10,
            top3: num(tops["1_3"]?.[i]),
            top10: num(tops["1_10"]?.[i]),
            top50:
              num(tops["1_10"]?.[i]) +
              num(tops["11_30"]?.[i]) +
              num(tops["31_50"]?.[i]),
            queriesTotal: num(tops["all"]?.[i]),
          };
          await prisma.visibilityData.upsert({
            where: {
              projectId_date_searchEngine: {
                projectId: ourId,
                date,
                searchEngine: eng.name,
              },
            },
            create: { projectId: ourId, date, searchEngine: eng.name, ...data },
            update: data,
          });
          imported++;
        }
      }
    }
  }
  return { imported, engines: ENGINES.map((e) => e.name) };
}
