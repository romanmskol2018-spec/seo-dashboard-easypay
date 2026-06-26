// Импорт лидов и продаж из выгрузок Bitrix CRM (.xls = HTML-таблица).
// Лиды: уникальный лид = уникальный контакт (мобильный клиента или визит metrika);
//        источник по полям UTM(×2)+Источник(×2)+Система+Реферер+Директ; пустые 60% SEO / 40% реком.
// Кач-лиды: лид, у которого есть сделка (привязка по № лида / metrika), по дате лида.
// Продажи: оплаченные сделки (поле «Оплачено»/«Оплаченная сумма») из полной выгрузки DEAL.
//
// Запуск:  npm run import:crm -- "C:/путь/к/папке/с/выгрузками"
//          (по умолчанию берётся переменная CRM_EXPORT_DIR или ./crm-data)
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

// ---------- разбор HTML-таблицы из .xls ----------
function parseTable(html: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: string[] = [];
    let td: RegExpExecArray | null;
    tdRe.lastIndex = 0;
    while ((td = tdRe.exec(tr[1]))) {
      cells.push(
        td[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .trim()
      );
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

type Sheet = { header: string[]; rows: string[][]; idx: (n: string) => number };
function loadSheet(path: string): Sheet {
  const raw = readFileSync(path, "latin1").includes("charset=UTF-8")
    ? readFileSync(path, "utf8")
    : readFileSync(path, "utf8");
  const all = parseTable(raw);
  const header = (all[0] || []).map((h) => h.trim());
  return {
    header,
    rows: all.slice(1),
    idx: (n: string) => header.indexOf(n),
  };
}

// ---------- даты и недели ----------
// Сетка недель привязана к 2026-05-06 (как в исходном анализе): 06.05,13.05,20.05,27.05,03.06,10.06,17.06…
const ANCHOR = Date.UTC(2026, 4, 6); // 6 мая 2026
const DAY = 86400000;

function parseRuDate(s: string): Date | null {
  // "DD.MM.YYYY HH:MM:SS" → Date(UTC, по дню)
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s || "");
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}
function weekStart(d: Date): Date {
  const idx = Math.floor((d.getTime() - ANCHOR) / (7 * DAY));
  return new Date(ANCHOR + idx * 7 * DAY);
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function weekLabel(start: Date): string {
  const end = new Date(start.getTime() + 6 * DAY);
  return `${pad(start.getUTCDate())}.${pad(start.getUTCMonth() + 1)}–${pad(end.getUTCDate())}.${pad(end.getUTCMonth() + 1)}`;
}

// ---------- телефоны / контакт ----------
function mobiles(text: string): string[] {
  const out = new Set<string>();
  const re = /\d[\d\s\-()]{8,}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) {
    let d = m[0].replace(/\D/g, "");
    if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
    if (d.length === 10 && d[0] === "9") out.add(d);
  }
  return [...out];
}

// ---------- проект ----------
const PROJECTS = ["Easypay.World", "4YouCards", "VisaMasterCards", "AVO.cards", "Visatut"];
function normProject(v: string): string | null {
  const s = (v || "").toLowerCase().trim();
  if (!s) return null;
  if (s.includes("avo")) return "AVO.cards";
  if (s.includes("4you") || s.includes("4 you")) return "4YouCards";
  if (s.includes("visatut")) return "Visatut";
  if (s.includes("visamaster")) return "VisaMasterCards";
  if (s.includes("easypay")) return "Easypay.World";
  return null;
}
function projectFromUrl(u: string): string | null {
  const s = (u || "").toLowerCase();
  if (s.includes("4you")) return "4YouCards";
  if (s.includes("visatut")) return "Visatut";
  if (s.includes("visamaster")) return "VisaMasterCards";
  if (s.includes("avo.cards") || s.includes("avocards")) return "AVO.cards";
  if (s.includes("easypay")) return "Easypay.World";
  return null;
}

// ---------- классификация источника ----------
const SRC_KEYS = [
  "seo", "recom", "direct", "klerk", "insta", "karty", "dzen", "youtube", "partner",
] as const;
type SrcKey = (typeof SRC_KEYS)[number];

type LeadRow = { cells: string[]; sheet: Sheet };

function firstNonEmpty(rows: LeadRow[], col: string): string {
  for (const r of rows) {
    const i = r.sheet.idx(col);
    if (i >= 0 && r.cells[i]?.trim()) return r.cells[i].trim().toLowerCase();
  }
  return "";
}
function anyFlag(rows: LeadRow[], col: string, vals: string[]): boolean {
  for (const r of rows) {
    const i = r.sheet.idx(col);
    if (i >= 0 && vals.includes((r.cells[i] || "").toLowerCase().trim())) return true;
  }
  return false;
}
function srcCols(sheet: Sheet): number[] {
  const out: number[] = [];
  sheet.header.forEach((h, i) => {
    if (h === "Источник") out.push(i);
  });
  return out;
}

function classify(rows: LeadRow[]): SrcKey | "unknown" {
  const a = firstNonEmpty(rows, "UTM Source");
  const m = firstNonEmpty(rows, "UTM Medium");
  const a2 = firstNonEmpty(rows, "utm_source (для Chat2Desk)");
  const m2 = firstNonEmpty(rows, "utm_medium (для Chat2Desk)");
  const sv = firstNonEmpty(rows, "Система");
  const ref = firstNonEmpty(rows, "Реферер");
  const sc = srcCols(rows[0].sheet);
  const chan = sc.length ? (rows[0].cells[sc[0]] || "").toLowerCase().trim() : "";
  let mkt = "";
  for (const r of rows) {
    const c = srcCols(r.sheet);
    if (c.length > 1 && r.cells[c[c.length - 1]]?.trim()) {
      mkt = r.cells[c[c.length - 1]].toLowerCase().trim();
      break;
    }
  }
  const directAd = rows.some((r) => {
    const i = r.sheet.idx("Директ");
    return i >= 0 && (r.cells[i] || "").trim();
  });
  const A = a || a2;
  const M = m || m2;
  const blob = [a, m, a2, m2, mkt, sv, ref].join(" ");
  const rep = anyFlag(rows, "Повторный лид", ["y", "да"]);
  if (a.includes("klerk") || a2.includes("klerk") || ref.includes("klerk")) return "klerk";
  if (blob.includes("dzen")) return "dzen";
  if (blob.includes("youtube") || blob.includes("ютуб") || ref.includes("youtu")) return "youtube";
  if (a === "ig" || a === "instagram.com" || blob.includes("instagram") || ref === "ig" || mkt === "соц сеть") return "insta";
  if (blob.includes("karty") || blob.includes("2gis") || blob.includes("карты")) return "karty";
  if (mkt === "партнер" || blob.includes("partner") || m2 === "affiliate") return "partner";
  if (M === "cpc" || sv.includes("ya_direct") || mkt === "реклама" || directAd) return "direct";
  if (
    M === "organic" || ["google", "yandex", "bing"].includes(sv) || mkt === "seo" ||
    chan === "seo. google" || chan === "seo. yandex" || A === "google" || A === "yandex" ||
    ref === "yandex" || ref === "google" || ref === "ya" || ref.includes("yandex.") || ref.includes("google.")
  ) return "seo";
  if (
    ["прямой", "recommend", "внутренний", "messenger"].includes(mkt) || a === "(direct)" ||
    m === "referral" || chan === "повторные продажи" || rep || ref.startsWith("http")
  ) return "recom";
  return "unknown";
}
function isGoogle(rows: LeadRow[]): boolean {
  return rows.some((r) => {
    const u = ((r.cells[r.sheet.idx("UTM Source")] || "") + (r.cells[r.sheet.idx("Система")] || "")).toLowerCase();
    const sc = srcCols(r.sheet);
    return u.includes("google") || (sc.length && (r.cells[sc[0]] || "") === "Seo. Google");
  });
}
function isYandex(rows: LeadRow[]): boolean {
  return rows.some((r) => {
    const u = ((r.cells[r.sheet.idx("UTM Source")] || "") + (r.cells[r.sheet.idx("Система")] || "")).toLowerCase();
    const sc = srcCols(r.sheet);
    return u.includes("yandex") || (sc.length && (r.cells[sc[0]] || "") === "Seo. Yandex");
  });
}

// ---------- union-find ----------
class UF {
  p: number[];
  constructor(n: number) { this.p = Array.from({ length: n }, (_, i) => i); }
  find(x: number): number { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
  union(a: number, b: number) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p[ra] = rb; }
}

// =================== ИМПОРТ ЛИДОВ ===================
type Bucket = { rows: { cells: string[]; sheet: Sheet; mob: string[]; met: string }[]; sheetRef: Sheet };

async function importLeads(dir: string, files: string[]) {
  // собрать все лид-строки, разложить по неделям
  const byWeek = new Map<string, Bucket>(); // weekKey(ISO start) -> bucket
  const leadIndex = new Map<string, { week: Date; label: string }>(); // leadId / metrika -> week (для кач-лидов)

  for (const f of files) {
    const sheet = loadSheet(join(dir, f));
    const cDate = sheet.idx("Дата создания");
    const cName = sheet.idx("Название лида");
    const cMet = sheet.idx("metrika_client_id");
    const cId = sheet.idx("ID");
    const phoneCols = ["Мобильный телефон", "Рабочий телефон", "Домашний телефон", "Другой телефон", "Телефон для рассылок"]
      .map((n) => sheet.idx(n)).filter((i) => i >= 0);
    if (cDate < 0) continue;
    for (const cells of sheet.rows) {
      const d = parseRuDate(cells[cDate]);
      if (!d) continue;
      const ws = weekStart(d);
      const key = ws.toISOString().slice(0, 10);
      if (!byWeek.has(key)) byWeek.set(key, { rows: [], sheetRef: sheet });
      const mob = new Set<string>();
      for (const pc of phoneCols) mobiles(cells[pc]).forEach((x) => mob.add(x));
      mobiles(cells[cName] || "").forEach((x) => mob.add(x));
      const met = (cMet >= 0 ? cells[cMet] : "").trim();
      byWeek.get(key)!.rows.push({ cells, sheet, mob: [...mob], met });
      // индекс для кач-лидов
      if (cId >= 0 && cells[cId]) leadIndex.set("id:" + cells[cId].trim(), { week: ws, label: weekLabel(ws) });
      if (met) leadIndex.set("m:" + met, { week: ws, label: weekLabel(ws) });
    }
  }

  // агрегат по (неделя, проект)
  type Agg = Record<SrcKey, number> & { val: number; g: number; y: number; u: number };
  const result = new Map<string, Map<string, Agg>>(); // weekKey -> project -> agg
  const labels = new Map<string, string>();

  for (const [key, bucket] of byWeek) {
    const start = new Date(key);
    labels.set(key, weekLabel(start));
    // ОПР-2: только строки с мобильным или metrika
    const keep = bucket.rows.filter((r) => r.mob.length || r.met);
    const uf = new UF(keep.length);
    const byMob = new Map<string, number[]>();
    const byMet = new Map<string, number[]>();
    keep.forEach((r, i) => {
      for (const mb of r.mob) (byMob.get(mb) || byMob.set(mb, []).get(mb)!).push(i);
      if (r.met) (byMet.get(r.met) || byMet.set(r.met, []).get(r.met)!).push(i);
    });
    for (const ids of [...byMob.values(), ...byMet.values()]) for (let j = 1; j < ids.length; j++) uf.union(ids[0], ids[j]);
    const comps = new Map<number, LeadRow[]>();
    keep.forEach((r, i) => {
      const root = uf.find(i);
      if (!comps.has(root)) comps.set(root, []);
      comps.get(root)!.push({ cells: r.cells, sheet: r.sheet });
    });

    const wk = new Map<string, Agg>();
    const ensure = (p: string): Agg => {
      if (!wk.has(p)) wk.set(p, { seo: 0, recom: 0, direct: 0, klerk: 0, insta: 0, karty: 0, dzen: 0, youtube: 0, partner: 0, val: 0, g: 0, y: 0, u: 0 });
      return wk.get(p)!;
    };
    const unknownByProj = new Map<string, number>();

    for (const rows of comps.values()) {
      // проект компоненты
      let proj: string | null = null;
      for (const r of rows) {
        proj = normProject(r.cells[r.sheet.idx("Проект")] || "") ||
          normProject(r.cells[r.sheet.idx("Проект (для Chat2Desk)")] || "");
        if (proj) break;
      }
      if (!proj) for (const r of rows) {
        proj = projectFromUrl(r.cells[r.sheet.idx("Страница")] || "") || projectFromUrl(r.cells[r.sheet.idx("Страница выхода")] || "");
        if (proj) break;
      }
      if (!proj) proj = "Easypay.World";
      const cl = classify(rows);
      if (cl === "unknown") {
        unknownByProj.set(proj, (unknownByProj.get(proj) || 0) + 1);
      } else {
        const a = ensure(proj);
        a[cl]++;
        if (cl === "seo") { if (isGoogle(rows)) a.g++; else if (isYandex(rows)) a.y++; }
      }
    }
    // распределяем неизвестные 60% SEO / 40% реком.
    for (const [p, u] of unknownByProj) {
      const a = ensure(p);
      const sa = Math.round(u * 0.6);
      a.seo += sa; a.recom += u - sa;
    }
    // val + seoUnknown
    for (const [, a] of wk) {
      a.val = SRC_KEYS.reduce((s, k) => s + a[k], 0);
      a.u = a.seo - a.g - a.y;
    }
    result.set(key, wk);
  }

  // кач-лиды по неделям (любая сделка, привязка по id/metrika)
  const qualByWeek = await computeQual(dir, leadIndex);

  // запись в БД
  let n = 0;
  for (const [key, wk] of result) {
    const ws = new Date(key);
    const label = labels.get(key)!;
    // агрегат «ALL» по неделе (несёт qual)
    const all: Agg = { seo: 0, recom: 0, direct: 0, klerk: 0, insta: 0, karty: 0, dzen: 0, youtube: 0, partner: 0, val: 0, g: 0, y: 0, u: 0 };
    for (const [, a] of wk) { SRC_KEYS.forEach((k) => (all[k] += a[k])); all.val += a.val; all.g += a.g; all.y += a.y; all.u += a.u; }
    const qual = qualByWeek.get(label) ?? null;
    const rowsToWrite: [string, Agg, number | null][] = [["ALL", all, qual]];
    for (const [p, a] of wk) rowsToWrite.push([p, a, null]);
    for (const [project, a, q] of rowsToWrite) {
      const payload = {
        weekLabel: label, project, val: a.val, qual: q,
        seo: a.seo, recom: a.recom, direct: a.direct, klerk: a.klerk, insta: a.insta,
        karty: a.karty, dzen: a.dzen, youtube: a.youtube, partner: a.partner,
        seoGoogle: a.g, seoYandex: a.y, seoUnknown: a.u,
      };
      await prisma.leadStat.upsert({
        where: { weekStart_project: { weekStart: ws, project } },
        create: { weekStart: ws, ...payload },
        update: payload,
      });
      n++;
    }
  }
  console.log(`  ✓ Лиды: ${result.size} недель, ${n} строк LeadStat`);
}

// =================== КАЧ-ЛИДЫ ===================
async function computeQual(dir: string, leadIndex: Map<string, { week: Date; label: string }>): Promise<Map<string, number>> {
  const dealFiles = readdirSync(dir).filter((f) => /^DEAL_.*\.xls$/i.test(f));
  const uniqByWeek = new Map<string, Set<string>>(); // label -> set(ident)
  const seenDeal = new Set<string>();
  for (const f of dealFiles) {
    const sheet = loadSheet(join(dir, f));
    const cName = sheet.idx("Название сделки");
    const cMet = sheet.idx("metrika_client_id");
    const cDealId = sheet.idx("ID");
    if (cName < 0) continue;
    for (const cells of sheet.rows) {
      const did = cDealId >= 0 ? cells[cDealId] : "";
      if (did && seenDeal.has(did)) continue;
      if (did) seenDeal.add(did);
      const name = cells[cName] || "";
      const mh = /#(\d+)/.exec(name);
      let hit: { week: Date; label: string } | undefined;
      let ident = "";
      if (mh && leadIndex.has("id:" + mh[1])) { hit = leadIndex.get("id:" + mh[1]); ident = "id:" + mh[1]; }
      else if (cMet >= 0 && cells[cMet] && leadIndex.has("m:" + cells[cMet].trim())) { hit = leadIndex.get("m:" + cells[cMet].trim()); ident = "m:" + cells[cMet].trim(); }
      if (hit) {
        if (!uniqByWeek.has(hit.label)) uniqByWeek.set(hit.label, new Set());
        uniqByWeek.get(hit.label)!.add(ident);
      }
    }
  }
  const out = new Map<string, number>();
  for (const [label, set] of uniqByWeek) out.set(label, set.size);
  return out;
}

// =================== ПРОДАЖИ (ЧЕК) ===================
function toNum(s: string): number {
  const n = parseFloat((s || "").replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function normBank(card: string): string | null {
  const c = (card || "").toLowerCase();
  if (!c.trim()) return null;
  if (c.includes("бакай")) return "Бакай (Киргизия)";
  if (c.includes("ори")) return "Ориён / Орион";
  if (c.includes("арцах")) return "Арцах (Армения)";
  if (c.includes("виртуал")) return "Виртуальная";
  return "Прочие СНГ";
}

async function importSales(dir: string) {
  // берём самую полную выгрузку DEAL (с полем «Оплаченная сумма»)
  const dealFiles = readdirSync(dir).filter((f) => /^DEAL_.*\.xls$/i.test(f));
  let best: Sheet | null = null;
  for (const f of dealFiles) {
    const s = loadSheet(join(dir, f));
    if (s.idx("Оплаченная сумма") >= 0 && (!best || s.header.length > best.header.length)) best = s;
  }
  if (!best) { console.log("  ⚠ Продажи: не найдена выгрузка DEAL с полем «Оплаченная сумма»"); return; }
  const sheet = best;
  const cPaidSum = sheet.idx("Оплаченная сумма");
  const cPaid = sheet.idx("Оплачено");
  const cDate = sheet.idx("Дата создания");
  const cId = sheet.idx("ID");
  const cCard = sheet.idx("Тип карты");
  const cTovar = sheet.idx("Товар");
  const cProj = sheet.idx("Проект");
  const isPaid = (c: string[]) => {
    const o = (cPaid >= 0 ? c[cPaid] : "").toLowerCase();
    return toNum(c[cPaidSum]) > 0 || o.startsWith("оплачен") || o === "да" || o.startsWith("да ");
  };
  let n = 0, live = 0;
  for (const c of sheet.rows) {
    if (!isPaid(c)) continue;
    const d = parseRuDate(c[cDate]);
    if (!d) continue;
    // «импорт истории» = окно 25–28.05.2026
    const imp = d.getTime() >= Date.UTC(2026, 4, 25) && d.getTime() <= Date.UTC(2026, 4, 28);
    const dealId = (cId >= 0 ? c[cId] : "") || `${c[cDate]}|${c[cPaidSum]}|${n}`;
    const card = cCard >= 0 ? c[cCard] : "";
    const payload = {
      date: d, amount: Math.round(toNum(c[cPaidSum])),
      cardType: card || null, bank: normBank(card), product: (cTovar >= 0 ? c[cTovar] : "") || null,
      project: (cProj >= 0 ? normProject(c[cProj]) : null), isImport: imp,
    };
    await prisma.cardSale.upsert({
      where: { dealId },
      create: { dealId, ...payload },
      update: payload,
    });
    n++;
    if (!imp) live++;
  }
  console.log(`  ✓ Продажи: ${n} оплаченных сделок (живых без импорта: ${live})`);
}

// =================== MAIN ===================
async function main() {
  const dir = process.argv[2] || process.env.CRM_EXPORT_DIR || "./crm-data";
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /^LEAD_.*\.xls$/i.test(f));
  } catch {
    throw new Error(`Папка с выгрузками не найдена: ${dir}. Укажи путь: npm run import:crm -- "C:/путь/к/выгрузкам"`);
  }
  if (!files.length) throw new Error(`В папке ${dir} нет файлов LEAD_*.xls`);
  console.log(`📥 Импорт CRM из ${dir} · лид-файлов: ${files.length}`);
  await importLeads(dir, files);
  await importSales(dir);
  console.log("🎉 Импорт CRM завершён");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
