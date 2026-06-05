import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { importTopvisorVisibility } from "@/lib/topvisor";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const days = [30, 90, 180, 365].includes(Number(body.days))
      ? Number(body.days)
      : 180;

    const { imported, engines } = await importTopvisorVisibility(days);

    return NextResponse.json({
      ok: true,
      days,
      imported,
      engines,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка импорта" },
      { status: 500 }
    );
  }
}
