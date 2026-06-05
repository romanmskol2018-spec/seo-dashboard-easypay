// Удаление сайта (и связанного проекта) по домену.
// Запуск: npx tsx prisma/delete-site.ts bayside-residence.ru
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const domain = process.argv[2];
  if (!domain) throw new Error("Укажи домен: npx tsx prisma/delete-site.ts <домен>");

  const site = await prisma.site.findFirst({ where: { domain } });
  if (!site) {
    console.log(`Сайт с доменом ${domain} не найден`);
    return;
  }
  // Удаляем связанные проекты (видимость удалится каскадом), затем сайт (трафик — каскадом)
  const proj = await prisma.project.deleteMany({ where: { siteId: site.id } });
  await prisma.site.delete({ where: { id: site.id } });
  console.log(`🗑 Удалён сайт «${site.name}» (${domain}) и проектов: ${proj.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
