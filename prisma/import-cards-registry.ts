// Импорт продаж карт из РЕЕСТРА (Google-таблица «Карты», экспорт в CSV).
// Реестр — источник правды по продажам: реальные суммы и даты продаж.
// Пишет в CardSale (isImport=false), полностью заменяя «живые» продажи.
// Bitrix-импортёр (import-bitrix.ts) CardSale НЕ трогает — только лиды.
//
// Атрибуция канала: в реестре нет UTM, поэтому канал продажи определяем
// связкой «телефон карты → первый лид Bitrix с этим телефоном → канал лида»
// (first-touch, покрытие ~95%). Нужен BITRIX_WEBHOOK_URL в окружении;
// без него (или с --no-attr) source остаётся пустым.
//
//   npx tsx prisma/import-cards-registry.ts --csv=/path/to/cards.csv            # сухой прогон
//   npx tsx prisma/import-cards-registry.ts --csv=/path/to/cards.csv --write
//   npx tsx prisma/import-cards-registry.ts --csv=… --no-attr --write           # без Bitrix
//
// По умолчанию берём карты с 1 мая 2026 (--from=YYYY-MM-DD чтобы изменить).
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fetchPhoneChannelMap, normalizeMobile } from "../lib/attribution";
import { DASHBOARD_START } from "../lib/projects";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

const args = process.argv.slice(2);
const write = args.includes("--write");
const noAttr = args.includes("--no-attr");
const csvArg = args.find((a) => a.startsWith("--csv="));
const urlArg = args.find((a) => a.startsWith("--url="));
const fromArg = args.find((a) => a.startsWith("--from="));
const CSV_PATH = csvArg ? csvArg.split("=")[1] : "";
const CSV_URL = urlArg ? urlArg.slice("--url=".length) : ""; // URL может содержать '='
const FROM = fromArg ? fromArg.split("=")[1] : DASHBOARD_START;

if (!CSV_PATH && !CSV_URL) {
  console.error("Укажи источник: --csv=/path/to/cards.csv  или  --url=https://…&output=csv");
  process.exit(1);
}

// ---------- CSV-парсер (учёт кавычек) ----------
function parseCsv(t: string): string[][] {
  const o: string[][] = [];
  let f = "", r: string[] = [], q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { r.push(f); f = ""; }
      else if (c === "\n") { r.push(f); o.push(r); r = []; f = ""; }
      else if (c === "\r") { /* skip */ }
      else f += c;
    }
  }
  if (f.length || r.length) { r.push(f); o.push(r); }
  return o;
}

function toNum(s: string): number {
  let x = (s || "").replace(/[^0-9, ]/g, "").replace(/ /g, "");
  x = x.split(",").length === 2 ? x.replace(",", ".") : x.replace(/,/g, "");
  const n = parseFloat(x);
  return isNaN(n) ? 0 : n;
}

const DATE = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/;
const NAME = /[А-Яа-яЁё]{2,}/;

async function main() {
  const raw = CSV_URL
    ? await fetch(CSV_URL).then((r) => {
        if (!r.ok) throw new Error(`CSV URL вернул ${r.status}`);
        return r.text();
      })
    : readFileSync(CSV_PATH, "utf8");
  const R = parseCsv(raw);
  const H = R[0].map((s) => s.trim());
  const ix = (n: string) => H.indexOf(n);
  const iFio = ix("ФИО"), iSum = ix("Сумма"), iCard = ix("VISA/Mastercard"), iPhone = ix("Телефон");
  const countries: [string, string][] = [
    ["Бишкек", "Бакай (Киргизия)"],
    ["Узбекистан", "Узбекистан"],
    ["Армения", "Арцах (Армения)"],
    ["Таджикистан", "Таджикистан"],
    ["Беларусь", "Беларусь"],
  ];
  const ci = countries.map(([c, bank]) => [ix(c), bank] as [number, string]);

  type Sale = { dealId: string; date: Date; amount: number; cardType: string | null; bank: string | null; phone: string | null; source: string | null; project: string | null };
  const sales: Sale[] = [];
  const dropped: { fio: string; amount: number; date: string }[] = [];
  let cur: string | null = null;
  let idx = 0;
  for (const r of R.slice(1)) {
    idx++;
    const fio = (r[iFio] || "").trim();
    const m = fio.match(DATE);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = "20" + y;
      cur = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      continue;
    }
    if (!fio || !NAME.test(fio)) continue;
    if (!cur || cur < FROM) continue;
    const amount = toNum(r[iSum] || "");
    if (amount <= 0) continue;
    // Раньше молча резали всё ≥100k и теряли крупные карты. Теперь потолок 1 млн
    // (реальный чек ~20–40к, но премиум бывает), а явный мусор (сотни млн) — логируем.
    if (amount >= 1000000) { dropped.push({ fio, amount, date: cur }); continue; }
    const card = iCard >= 0 ? String(r[iCard] || "").trim() : "";
    let bank: string | null = null;
    for (const [col, name] of ci) {
      if (col >= 0 && String(r[col] || "").trim().toUpperCase() === "TRUE") { bank = name; break; }
    }
    const [yy, mm, dd] = cur.split("-").map(Number);
    sales.push({
      dealId: "reg-" + idx,
      date: new Date(Date.UTC(yy, mm - 1, dd)),
      amount: Math.round(amount),
      cardType: card || null,
      bank,
      phone: iPhone >= 0 ? normalizeMobile(String(r[iPhone] || "")) : null,
      source: null,
      project: null,
    });
  }

  // ---- атрибуция по лидам Bitrix: телефон → лид → канал + проект ----
  const attrOn = !noAttr && !!process.env.BITRIX_WEBHOOK_URL;
  if (attrOn) {
    console.log("🔗 Атрибуция: тяну лиды Bitrix (все, seek-батчами)…");
    const phoneCh = await fetchPhoneChannelMap((n) => {
      if (n % 12500 === 0) console.log(`   …лидов получено: ${n}`);
    });
    console.log(`   лидов-телефонов в карте: ${phoneCh.size}`);
    for (const s of sales) {
      const hit = s.phone ? phoneCh.get(s.phone) : undefined;
      if (hit) {
        s.source = hit.channel;
        s.project = hit.project;
      }
    }
  } else {
    console.log(`⚠ Атрибуция каналов выключена (${noAttr ? "--no-attr" : "нет BITRIX_WEBHOOK_URL"}) — source/project будут пусты`);
  }

  const revenue = sales.reduce((s, x) => s + x.amount, 0);
  const byMonth = new Map<string, { n: number; s: number }>();
  for (const s of sales) {
    const k = s.date.toISOString().slice(0, 7);
    const e = byMonth.get(k) || { n: 0, s: 0 };
    e.n++; e.s += s.amount; byMonth.set(k, e);
  }
  console.log(`📇 Реестр карт · с ${FROM} · режим: ${write ? "ЗАПИСЬ" : "СУХОЙ ПРОГОН"}`);
  console.log(`  карт: ${sales.length} · выручка: ${revenue.toLocaleString("ru")} ₽ · ср.чек: ${sales.length ? Math.round(revenue / sales.length).toLocaleString("ru") : 0} ₽`);
  for (const k of [...byMonth.keys()].sort())
    console.log(`   ${k}: ${byMonth.get(k)!.n} карт, ${byMonth.get(k)!.s.toLocaleString("ru")} ₽`);
  if (dropped.length) {
    console.log(`  ⚠ отброшено как явный мусор (≥1 млн ₽): ${dropped.length}`);
    for (const d of dropped.slice(0, 3))
      console.log(`     ${d.date} · ${d.fio.slice(0, 24)} · ${d.amount.toLocaleString("ru")} ₽`);
  }
  if (attrOn) {
    const bySrc = new Map<string, { n: number; s: number }>();
    for (const s of sales) {
      const k = s.source ?? (s.phone ? "— лид не найден" : "— нет телефона");
      const e = bySrc.get(k) || { n: 0, s: 0 };
      e.n++; e.s += s.amount; bySrc.set(k, e);
    }
    const attributed = sales.filter((s) => s.source).length;
    console.log(`  🔗 канал определён: ${attributed} из ${sales.length} (${sales.length ? Math.round((attributed / sales.length) * 100) : 0}%)`);
    for (const [k, v] of [...bySrc.entries()].sort((a, b) => b[1].s - a[1].s))
      console.log(`     ${k}: ${v.n} карт · ${v.s.toLocaleString("ru")} ₽`);
    const byProj = new Map<string, number>();
    for (const s of sales) byProj.set(s.project ?? "— не определён", (byProj.get(s.project ?? "— не определён") || 0) + 1);
    console.log(`  🏷 проект: ` + [...byProj.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(" · "));
  }

  if (!write) {
    console.log("\n💡 Сухой прогон — в базу НЕ записано. Для записи добавь --write");
    return;
  }

  console.log("\n✍ Пишу CardSale (замена всех isImport=false)…");
  await prisma.cardSale.deleteMany({ where: { isImport: false } });
  await prisma.cardSale.createMany({
    data: sales.map((s) => ({
      dealId: s.dealId,
      date: s.date,
      amount: s.amount,
      cardType: s.cardType,
      bank: s.bank,
      product: s.cardType,
      project: s.project,
      source: s.source,
      isImport: false,
    })),
    skipDuplicates: true,
  });
  console.log(`  ✓ CardSale: ${sales.length} продаж записано`);
  console.log("🎉 Готово — продажи обновлены из реестра");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
