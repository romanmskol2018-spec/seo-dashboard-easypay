import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// Список записей трафика конкретного сайта (для админки)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "Нужен siteId" }, { status: 400 });
  }
  const rows = await prisma.trafficData.findMany({
    where: { siteId, source: "all" },
    orderBy: { date: "desc" },
    take: 90,
  });
  return NextResponse.json(rows);
}

// Создать/обновить запись трафика за дату
export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json();
    const { siteId, date, visits, visitors, pageviews, bounceRate, avgDuration } =
      body;
    if (!siteId || !date) {
      return NextResponse.json(
        { error: "Нужны siteId и дата" },
        { status: 400 }
      );
    }
    const day = new Date(date);
    const data = {
      visits: Number(visits) || 0,
      visitors: Number(visitors) || 0,
      pageviews: Number(pageviews) || 0,
      bounceRate: Number(bounceRate) || 0,
      avgDuration: Number(avgDuration) || 0,
    };
    const row = await prisma.trafficData.upsert({
      where: { siteId_date_source: { siteId, date: day, source: "all" } },
      create: { siteId, date: day, source: "all", ...data },
      update: data,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
