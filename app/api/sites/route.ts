import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const sites = await prisma.site.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { traffic: true, projects: true } },
      // последняя запись трафика — для статуса свежести на «Обзоре»
      traffic: {
        orderBy: { date: "desc" },
        take: 1,
        select: { date: true, visits: true, visitors: true, bounceRate: true },
      },
    },
  });
  return NextResponse.json(sites);
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json();
    const { name, domain, metrikaCounter, color } = body;
    if (!name || !domain) {
      return NextResponse.json(
        { error: "Название и домен обязательны" },
        { status: 400 }
      );
    }
    const site = await prisma.site.create({
      data: {
        name: String(name).trim(),
        domain: String(domain).trim(),
        metrikaCounter: metrikaCounter ? String(metrikaCounter).trim() : null,
        color: color || "#3b82f6",
      },
    });
    return NextResponse.json(site, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
