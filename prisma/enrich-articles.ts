// Краулер метаданных страниц: тянет НАЗВАНИЕ (og:title/<title>), ПРЕВЬЮ (og:image)
// и дату обновления (article:modified_time / Last-Modified) для каждого URL из ArticleStat.
// Пишет в ArticlePage. Нужно, чтобы в списке статей было видно название и картинку.
//
//   npm run enrich:articles                 # все URL (сухой прогон по умолчанию)
//   npm run enrich:articles -- --write
//   npm run enrich:articles -- --limit=200 --write   # топ-200 по визитам
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

const UA =
  "Mozilla/5.0 (compatible; EasyPayDashboardBot/1.0; +https://seo-dashboard-easypay.onrender.com)";

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function metaContent(html: string, attr: "property" | "name", key: string): string | null {
  // <meta property="og:title" content="...">  (атрибуты в любом порядке)
  const re = new RegExp(
    `<meta[^>]*${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i"
  );
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  const c = /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return c ? decode(c) : null;
}

type Meta = { title: string | null; image: string | null; modified: Date | null };

async function fetchMeta(url: string): Promise<Meta | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const lastMod = res.headers.get("last-modified");
    const html = (await res.text()).slice(0, 200000); // хватит головы документа

    const title =
      metaContent(html, "property", "og:title") ||
      (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1]) : null);

    let image = metaContent(html, "property", "og:image");
    if (image) {
      try {
        image = new URL(image, url).href;
      } catch {
        /* оставляем как есть */
      }
    }

    const modIso =
      metaContent(html, "property", "article:modified_time") ||
      metaContent(html, "property", "og:updated_time") ||
      lastMod;
    let modified: Date | null = null;
    if (modIso) {
      const d = new Date(modIso);
      if (!isNaN(d.getTime())) modified = d;
    }

    return { title: title || null, image: image || null, modified };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// простой пул с ограничением параллелизма
async function pool<T>(items: T[], limit: number, fn: (it: T, i: number) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

  // уникальные URL с трафиком, по убыванию суммарных визитов
  const grouped = await prisma.articleStat.groupBy({
    by: ["url", "site"],
    _sum: { visits: true },
    orderBy: { _sum: { visits: "desc" } },
  });
  let urls = grouped.map((g) => ({ url: g.url, site: g.site, visits: g._sum.visits || 0 }));
  if (limit > 0) urls = urls.slice(0, limit);
  console.log(`🔎 Метаданные страниц · URL: ${urls.length} · режим: ${write ? "ЗАПИСЬ" : "СУХОЙ ПРОГОН"}`);

  let ok = 0;
  let withImg = 0;
  let withTitle = 0;
  const sample: string[] = [];
  await pool(urls, 8, async (u) => {
    const meta = await fetchMeta(u.url);
    if (!meta) return;
    ok++;
    if (meta.image) withImg++;
    if (meta.title) withTitle++;
    if (sample.length < 5 && meta.title) sample.push(`${u.url}\n     → «${meta.title}»  img:${meta.image ? "да" : "нет"}  mod:${meta.modified ? meta.modified.toISOString().slice(0, 10) : "—"}`);
    if (write) {
      const data = { site: u.site, title: meta.title, image: meta.image, modified: meta.modified };
      await prisma.articlePage.upsert({
        where: { url: u.url },
        create: { url: u.url, ...data },
        update: data,
      });
    }
  });

  console.log(`\n  получено: ${ok}/${urls.length} · с заголовком: ${withTitle} · с картинкой: ${withImg}`);
  if (sample.length) console.log("\n  Примеры:\n   - " + sample.join("\n   - "));
  if (!write) console.log("\n💡 Сухой прогон — в базу НЕ записано. Запись: npm run enrich:articles -- --write");
  else console.log("\n🎉 Готово — метаданные страниц обновлены");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
