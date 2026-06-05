import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SITES = [
  { name: "Интернет-магазин", domain: "shop-example.ru", color: "#3b82f6", base: 4200 },
  { name: "Блог о финансах", domain: "fin-blog.ru", color: "#8b5cf6", base: 2600 },
  { name: "Сервис доставки", domain: "fastdelivery.ru", color: "#10b981", base: 3100 },
  { name: "Туры и отдых", domain: "travel-pro.ru", color: "#f59e0b", base: 1800 },
  { name: "Авто-портал", domain: "auto-portal.ru", color: "#ef4444", base: 2300 },
  { name: "Клиника здоровья", domain: "med-clinic.ru", color: "#06b6d4", base: 1500 },
];

const PROJECTS = [
  { name: "Магазин — Москва", engine: "Яндекс", region: "Москва", color: "#3b82f6", base: 58, queries: 320 },
  { name: "Финблог — РФ", engine: "Google", region: "Россия", color: "#8b5cf6", base: 44, queries: 210 },
  { name: "Доставка — Москва", engine: "Яндекс", region: "Москва", color: "#10b981", base: 51, queries: 180 },
  { name: "Туры — СПб", engine: "Яндекс", region: "Санкт-Петербург", color: "#f59e0b", base: 33, queries: 140 },
  { name: "Авто — РФ", engine: "Google", region: "Россия", color: "#ef4444", base: 39, queries: 260 },
  { name: "Клиника — Москва", engine: "Яндекс", region: "Москва", color: "#06b6d4", base: 47, queries: 95 },
];

const DAYS = 90;

function dayUTC(offsetFromToday: number): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - offsetFromToday);
  return d;
}

// Сезонность по дню недели (выходные ниже) + тренд + шум
function trafficForDay(base: number, dayIndex: number, dow: number): number {
  const trend = 1 + (dayIndex / DAYS) * 0.35; // рост ~35% за период
  const weekend = dow === 0 || dow === 6 ? 0.72 : 1;
  const noise = 0.85 + Math.random() * 0.3;
  return Math.round(base * trend * weekend * noise);
}

async function main() {
  console.log("🌱 Очистка и наполнение базы…");

  await prisma.trafficData.deleteMany();
  await prisma.visibilityData.deleteMany();
  await prisma.project.deleteMany();
  await prisma.site.deleteMany();

  // --- Администратор ---
  const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "changeme123";
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name: process.env.ADMIN_NAME || "Администратор" },
    create: {
      email,
      passwordHash,
      name: process.env.ADMIN_NAME || "Администратор",
      role: "admin",
    },
  });
  console.log(`👤 Админ: ${email} / пароль: ${password}`);

  // --- Сайты + трафик ---
  const createdSites = [];
  for (const s of SITES) {
    const site = await prisma.site.create({
      data: { name: s.name, domain: s.domain, color: s.color },
    });
    createdSites.push(site);

    const rows = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const date = dayUTC(i);
      const dow = date.getUTCDay();
      const dayIndex = DAYS - 1 - i;
      const visits = trafficForDay(s.base, dayIndex, dow);
      rows.push({
        siteId: site.id,
        date,
        source: "all",
        visits,
        visitors: Math.round(visits * (0.78 + Math.random() * 0.1)),
        pageviews: Math.round(visits * (2.1 + Math.random() * 1.2)),
        bounceRate: Math.round((22 + Math.random() * 30) * 10) / 10,
        avgDuration: Math.round(70 + Math.random() * 160),
      });
    }
    await prisma.trafficData.createMany({ data: rows });
  }
  console.log(`✅ Сайтов: ${createdSites.length}, трафик за ${DAYS} дней`);

  // --- Проекты + видимость ---
  for (let idx = 0; idx < PROJECTS.length; idx++) {
    const p = PROJECTS[idx];
    const project = await prisma.project.create({
      data: {
        name: p.name,
        searchEngine: p.engine,
        region: p.region,
        color: p.color,
        siteId: createdSites[idx]?.id ?? null,
      },
    });

    const rows = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const date = dayUTC(i);
      const dayIndex = DAYS - 1 - i;
      const growth = (dayIndex / DAYS) * 12; // видимость растёт на ~12 п.п.
      const noise = (Math.random() - 0.5) * 4;
      const visibility = Math.max(
        0,
        Math.min(100, Math.round((p.base + growth + noise) * 10) / 10)
      );
      const top3 = Math.round((visibility / 100) * p.queries * 0.25);
      const top10 = Math.round((visibility / 100) * p.queries * 0.55);
      const top50 = Math.round((visibility / 100) * p.queries * 0.9);
      rows.push({
        projectId: project.id,
        date,
        visibility,
        avgPosition: Math.round((40 - visibility * 0.32) * 10) / 10,
        top3,
        top10,
        top50,
        queriesTotal: p.queries,
      });
    }
    await prisma.visibilityData.createMany({ data: rows });
  }
  console.log(`✅ Проектов: ${PROJECTS.length}, видимость за ${DAYS} дней`);
  console.log("🎉 Готово!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
