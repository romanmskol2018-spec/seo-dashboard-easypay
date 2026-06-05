import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { importMetrikaForAllSites } from "@/lib/metrika";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => ({}));
    const days = [7, 30, 90, 180, 365].includes(Number(body.days))
      ? Number(body.days)
      : 90;

    const results = await importMetrikaForAllSites(days);
    const okCount = results.filter((r) => r.ok).length;
    const totalRows = results.reduce((s, r) => s + (r.rows || 0), 0);

    return NextResponse.json({
      ok: true,
      days,
      sites: results.length,
      okCount,
      totalRows,
      results,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка импорта" },
      { status: 500 }
    );
  }
}
