// Разовый скрипт: очистка демо-данных и загрузка реальных проектов.
// Запуск: npm run db:seed:real
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ITEMS = [
  { name: "4you.cards", domain: "4you.cards", metrika: "104111243", color: "#3b82f6" },
  { name: "Easypay", domain: "easypay.world", metrika: "87941436", color: "#8b5cf6" },
  { name: "Manymany", domain: "manymany.cards", metrika: "90604275", color: "#10b981" },
  { name: "visamaster.cards", domain: "visamaster.cards", metrika: "104111255", color: "#f59e0b" },
  { name: "visatut.pro", domain: "visatut.pro", metrika: "98091909", color: "#ef4444" },
];

async function main() {
  console.log("🧹 Удаляю старые данные (админ сохраняется)…");
  await prisma.trafficData.deleteMany();
  await prisma.visibilityData.deleteMany();
  await prisma.project.deleteMany();
  await prisma.site.deleteMany();

  console.log("➕ Создаю сайты и проекты…");
  for (const it of ITEMS) {
    const site = await prisma.site.create({
      data: {
        name: it.name,
        domain: it.domain,
        metrikaCounter: it.metrika,
        color: it.color,
      },
    });
    await prisma.project.create({
      data: {
        name: it.name,
        searchEngine: "Яндекс",
        color: it.color,
        siteId: site.id,
      },
    });
    console.log(`  ✓ ${it.name}`);
  }

  const sites = await prisma.site.count();
  const projects = await prisma.project.count();
  console.log(`🎉 Готово: сайтов ${sites}, проектов ${projects}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
