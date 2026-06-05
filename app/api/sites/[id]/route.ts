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
    const site = await prisma.site.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        domain: body.domain?.trim(),
        metrikaCounter:
          body.metrikaCounter !== undefined
            ? body.metrikaCounter
              ? String(body.metrikaCounter).trim()
              : null
            : undefined,
        color: body.color,
      },
    });
    return NextResponse.json(site);
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
    await prisma.site.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
