// Импорт видимости из Топвизора: основной проект (avo.estate) + конкуренты.
// По двум поисковикам: Яндекс (регион 1) и Google (регион 2).
// Запуск: npm run import:topvisor  (по умолчанию 180 дней)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "https://api.topvisor.com/v2/json";

const USER_ID = process.env.TOPVISOR_USER_ID!;
const API_KEY = process.env.TOPVISOR_API_KEY!;
const PROJECT_ID = Number(process.env.TOPVISOR_PROJECT_ID);

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

async function tv(path: string, body: unknown) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: {
      "User-Id": USER_ID,
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
  const body: Record<string, unknown> = {
    project_id: PROJECT_ID,
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

async function main() {
  const days = Number(process.argv[2]) || 180;
  if (!USER_ID || !API_KEY || !PROJECT_ID) {
    throw new Error("Не заданы TOPVISOR_USER_ID / TOPVISOR_API_KEY / TOPVISOR_PROJECT_ID");
  }
  const date1 = daysAgoISO(days);
  const date2 = daysAgoISO(0);

  // основной сайт проекта
  const projInfo = await tv("get/projects_2/projects/", {
    fields: ["id", "site"],
    filters: [{ name: "id", operator: "EQUALS", values: [PROJECT_ID] }],
  });
  const mainDomain: string = projInfo.result[0].site;

  // конкуренты (вкл.), id → домен
  const compRes = await tv("get/projects_2/competitors/", {
    project_id: PROJECT_ID,
    fields: ["id", "site", "on"],
  });
  const enabled: { id: number; site: string; on: number }[] =
    compRes.result.filter((c: { on: number }) => c.on !== -1);

  const idToDomain = new Map<string, string>();
  idToDomain.set(String(PROJECT_ID), mainDomain);
  for (const c of enabled) idToDomain.set(String(c.id), c.site);

  // наш маппинг домен → projectId
  const ourProjects = await prisma.project.findMany({ include: { site: true } });
  const domainToProjectId = new Map<string, string>();
  for (const p of ourProjects) {
    if (p.site?.domain) domainToProjectId.set(p.site.domain.toLowerCase(), p.id);
  }

  for (const eng of ENGINES) {
    console.log(`\n🔎 ${eng.name} (регион ${eng.region}) за ${days} дн.`);
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
        let rows = 0;
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
          rows++;
        }
        if (rows) console.log(`  ✓ ${domain}: ${rows} проверок`);
      }
    }
  }
  console.log("\n🎉 Импорт видимости (Яндекс + Google) завершён");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
