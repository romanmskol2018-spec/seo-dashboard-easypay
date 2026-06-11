import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      site: { select: { id: true, name: true } },
      _count: { select: { visibility: true } },
      // последняя запись видимости — для статуса свежести на «Обзоре»
      visibility: {
        orderBy: { date: "desc" },
        take: 1,
        select: {
          date: true,
          visibility: true,
          top10: true,
          top3: true,
          avgPosition: true,
          searchEngine: true,
        },
      },
    },
  });
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json();
    const { name, topvisorId, searchEngine, region, color, siteId } = body;
    if (!name) {
      return NextResponse.json(
        { error: "Название проекта обязательно" },
        { status: 400 }
      );
    }
    const project = await prisma.project.create({
      data: {
        name: String(name).trim(),
        topvisorId: topvisorId ? String(topvisorId).trim() : null,
        searchEngine: searchEngine || "Яндекс",
        region: region ? String(region).trim() : null,
        color: color || "#10b981",
        siteId: siteId || null,
      },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
