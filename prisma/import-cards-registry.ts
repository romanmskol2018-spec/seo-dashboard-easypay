// Импорт продаж карт из РЕЕСТРА (Google-таблица «Карты», экспорт в CSV).
// Реестр — источник правды по продажам: реальные суммы и даты продаж.
// Пишет в CardSale (isImport=false), полностью заменяя «живые» продажи.
// Bitrix-импортёр (import-bitrix.ts) CardSale НЕ трогает — только лиды.
//
//   npx tsx prisma/import-cards-registry.ts --csv=/path/to/cards.csv            # сухой прогон
//   npx tsx prisma/import-cards-registry.ts --csv=/path/to/cards.csv --write
//
// По умолчанию берём карты с 1 мая 2026 (--from=YYYY-MM-DD чтобы изменить).
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

const args = process.argv.slice(2);
const write = args.includes("--write");
const csvArg = args.find((a) => a.startsWith("--csv="));
const fromArg = args.find((a) => a.startsWith("--from="));
const CSV_PATH = csvArg ? csvArg.split("=")[1] : "";
const FROM = fromArg ? fromArg.split("=")[1] : "2026-05-01";

if (!CSV_PATH) {
  console.error("Укажи путь к CSV: --csv=/path/to/cards.csv");
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
  const raw = readFileSync(CSV_PATH, "utf8");
  const R = parseCsv(raw);
  const H = R[0].map((s) => s.trim());
  const ix = (n: string) => H.indexOf(n);
  const iFio = ix("ФИО"), iSum = ix("Сумма"), iCard = ix("VISA/Mastercard");
  const countries: [string, string][] = [
    ["Бишкек", "Бакай (Киргизия)"],
    ["Узбекистан", "Узбекистан"],
    ["Армения", "Арцах (Армения)"],
    ["Таджикистан", "Таджикистан"],
    ["Беларусь", "Беларусь"],
  ];
  const ci = countries.map(([c, bank]) => [ix(c), bank] as [number, string]);

  type Sale = { dealId: string; date: Date; amount: number; cardType: string | null; bank: string | null };
  const sales: Sale[] = [];
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
    if (amount <= 0 || amount >= 100000) continue; // отсекаем мусорные суммы
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
    });
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
      project: null,
      source: null,
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
