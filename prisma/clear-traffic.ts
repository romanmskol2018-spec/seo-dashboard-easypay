// Очистка всех записей трафика (перед переимпортом).
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
prisma.trafficData
  .deleteMany()
  .then((r) => console.log(`🧹 Удалено записей трафика: ${r.count}`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
