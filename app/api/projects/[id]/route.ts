import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await request.json();
    const project = await prisma.project.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        topvisorId:
          body.topvisorId !== undefined
            ? body.topvisorId
              ? String(body.topvisorId).trim()
              : null
            : undefined,
        searchEngine: body.searchEngine,
        region:
          body.region !== undefined
            ? body.region
              ? String(body.region).trim()
              : null
            : undefined,
        color: body.color,
        siteId: body.siteId !== undefined ? body.siteId || null : undefined,
      },
    });
    return NextResponse.json(project);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
