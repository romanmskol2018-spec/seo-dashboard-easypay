// Импорт ПОЗИЦИЙ ПО ЗАПРОСАМ из Топвизора: запрос → позиция → relevant_url → кластер.
// Снимок последней позиции + предыдущей (динамика), по Яндексу и Google.
// Пишем в KeywordPosition. Нужно для «открыть статью → её позиции» и обзора по кластерам.
//
//   npm run import:topvisor:keywords            # сухой прогон
//   npm run import:topvisor:keywords -- --write
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });
const BASE = "https://api.topvisor.com/v2/json";
const USER = process.env.TOPVISOR_USER_ID!;
const KEY = process.env.TOPVISOR_API_KEY!;
const PID = Number(process.env.TOPVISOR_PROJECT_ID);
const ENGINES = [
  { name: "Яндекс", region: 1 },
  { name: "Google", region: 2 },
];

async function tv(path: string, body: unknown) {
  const r = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "User-Id": USER, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.errors) throw new Error(`${path}: ${j.errors.map((e: { string: string }) => e.string).join(", ")}`);
  return j;
}

function parsePos(p: string | undefined): number | null {
  if (!p) return null;
  const n = parseInt(p, 10);
  return isNaN(n) ? null : n;
}
function hostOf(u: string | null | undefined): string {
  if (!u) return "";
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

type Snap = { position: number | null; url: string | null };
// из positionsData берём последнюю и предыдущую непустую позицию (по дате в ключе)
function lastTwo(pd: Record<string, { position?: string; relevant_url?: string }>): { last: Snap; prev: Snap } {
  const keys = Object.keys(pd).sort(); // ключ начинается с даты YYYY-MM-DD → лексикографически = хронологически
  const snaps: Snap[] = [];
  for (const k of keys) {
    const v = pd[k];
    const pos = parsePos(v.position);
    const url = v.relevant_url || null;
    // считаем «значимым» снимок, где есть позиция ИЛИ url (т.е. проверка была)
    if (v.position !== undefined) snaps.push({ position: pos, url });
  }
  const last = snaps[snaps.length - 1] || { position: null, url: null };
  const prev = snaps[snaps.length - 2] || { position: null, url: null };
  return { last, prev };
}

async function main() {
  const write = process.argv.includes("--write");
  if (!USER || !KEY || !PID) throw new Error("Не заданы TOPVISOR_USER_ID / TOPVISOR_API_KEY / TOPVISOR_PROJECT_ID");

  // группы (кластеры): id → name
  const gRes = await tv("get/keywords_2/groups", { project_id: PID, fields: ["id", "name"] });
  const groupName = new Map<string, string>();
  for (const g of gRes.result || []) groupName.set(String(g.id), String(g.name));
  console.log(`📥 Топвизор позиции · проект ${PID} · групп: ${groupName.size} · режим: ${write ? "ЗАПИСЬ" : "СУХОЙ ПРОГОН"}`);

  const today = new Date().toISOString().slice(0, 10);
  const ago = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

  let total = 0, ranked = 0, written = 0;
  for (const eng of ENGINES) {
    // пагинация по ключам
    let offset = 0;
    const pageLimit = 1000;
    let engTotal = 0, engRanked = 0;
    const upserts: { keywordId: string; query: string; cluster: string | null; url: string | null; site: string; searchEngine: string; position: number | null; prevPosition: number | null; checkedAt: Date }[] = [];
    for (;;) {
      const res = await tv("get/positions_2/history", {
        project_id: PID, regions_indexes: [eng.region], date1: ago, date2: today,
        fields: ["id", "name", "group_id"], positions_fields: ["position", "relevant_url"],
        limit: pageLimit, offset,
      });
      const kws = res.result?.keywords || [];
      if (!kws.length) break;
      for (const k of kws) {
        const { last, prev } = lastTwo(k.positionsData || {});
        const url = last.url || prev.url || null;
        upserts.push({
          keywordId: String(k.id),
          query: String(k.name),
          cluster: k.group_id ? groupName.get(String(k.group_id)) || null : null,
          url,
          site: hostOf(url) || "easypay.world",
          searchEngine: eng.name,
          position: last.position,
          prevPosition: prev.position,
          checkedAt: new Date(today),
        });
        engTotal++;
        if (last.position !== null) engRanked++;
      }
      offset += kws.length;
      if (kws.length < pageLimit) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    total += engTotal; ranked += engRanked;
    console.log(`  ${eng.name}: ключей ${engTotal} · в выдаче ${engRanked}`);
    if (write) {
      // быстрая запись: снимок целиком заменяем (delete по поисковику + пакетный insert)
      await prisma.keywordPosition.deleteMany({ where: { searchEngine: eng.name } });
      for (let i = 0; i < upserts.length; i += 1000) {
        const c = await prisma.keywordPosition.createMany({ data: upserts.slice(i, i + 1000), skipDuplicates: true });
        written += c.count;
      }
    }
  }
  console.log(`\nИтого ключей×поисковик: ${total} · в выдаче: ${ranked}`);
  if (!write) console.log("💡 Сухой прогон — в базу НЕ записано. Запись: npm run import:topvisor:keywords -- --write");
  else console.log(`✓ KeywordPosition: ${written} строк\n🎉 Готово — позиции по запросам обновлены`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
