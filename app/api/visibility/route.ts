import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// Список записей видимости конкретного проекта (для админки)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Нужен projectId" }, { status: 400 });
  }
  const rows = await prisma.visibilityData.findMany({
    where: { projectId },
    orderBy: { date: "desc" },
    take: 90,
  });
  return NextResponse.json(rows);
}

// Создать/обновить запись видимости за дату
export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json();
    const {
      projectId,
      date,
      searchEngine,
      visibility,
      avgPosition,
      top3,
      top10,
      top50,
      queriesTotal,
    } = body;
    if (!projectId || !date) {
      return NextResponse.json(
        { error: "Нужны projectId и дата" },
        { status: 400 }
      );
    }
    const day = new Date(date);
    const engine = searchEngine === "Google" ? "Google" : "Яндекс";
    const data = {
      visibility: Number(visibility) || 0,
      avgPosition: Number(avgPosition) || 0,
      top3: Number(top3) || 0,
      top10: Number(top10) || 0,
      top50: Number(top50) || 0,
      queriesTotal: Number(queriesTotal) || 0,
    };
    const row = await prisma.visibilityData.upsert({
      where: {
        projectId_date_searchEngine: { projectId, date: day, searchEngine: engine },
      },
      create: { projectId, date: day, searchEngine: engine, ...data },
      update: data,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
