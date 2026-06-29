"use client";
// Гибкий выбор периода по готовым неделям: «с [неделя] по [неделя]» + пресеты.
// Меняет URL-параметры from/to (weekStart недели), сохраняя остальные.
import { useRouter, useSearchParams } from "next/navigation";

type Week = { weekStart: string; label: string };

export function WeekRangePicker({
  weeks,
  from,
  to,
  basePath = "/",
}: {
  weeks: Week[];
  from: string;
  to: string;
  basePath?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const go = (nf: string, nt: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set("from", nf);
    p.set("to", nt);
    p.delete("weeks");
    router.push(`${basePath}?${p.toString()}`, { scroll: false });
  };

  if (weeks.length === 0) return null;
  const firstW = weeks[0].weekStart;
  const lastW = weeks[weeks.length - 1].weekStart;

  // Пресет «последние N недель»
  const presetN = (n: number) => {
    const start = weeks[Math.max(0, weeks.length - n)].weekStart;
    go(start, lastW);
  };
  const selectedN = (() => {
    const fi = weeks.findIndex((w) => w.weekStart === from);
    const ti = weeks.findIndex((w) => w.weekStart === to);
    if (fi < 0 || ti < 0) return null;
    if (ti !== weeks.length - 1) return null; // пресеты всегда заканчиваются последней
    const n = ti - fi + 1;
    if (fi === 0) return "all";
    return String(n);
  })();

  const onFrom = (v: string) => {
    // не даём «с» уйти правее «по»
    const nt = v > to ? v : to;
    go(v, nt);
  };
  const onTo = (v: string) => {
    const nf = v < from ? v : from;
    go(nf, v);
  };

  const selectCls =
    "bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none cursor-pointer";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Диапазон недель */}
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span>с</span>
        <select
          value={from}
          onChange={(e) => onFrom(e.target.value)}
          className={selectCls}
        >
          {weeks.map((w) => (
            <option key={w.weekStart} value={w.weekStart} disabled={w.weekStart > to}>
              {w.label}
            </option>
          ))}
        </select>
        <span>по</span>
        <select
          value={to}
          onChange={(e) => onTo(e.target.value)}
          className={selectCls}
        >
          {weeks.map((w) => (
            <option
              key={w.weekStart}
              value={w.weekStart}
              disabled={w.weekStart < from}
            >
              {w.label}
            </option>
          ))}
        </select>
      </div>

      {/* Пресеты */}
      <div className="inline-flex bg-surface-2 border border-border rounded-lg p-1">
        {[
          { v: "4", label: "4 нед", on: () => presetN(4) },
          { v: "8", label: "8 нед", on: () => presetN(8) },
          { v: "all", label: "Всё", on: () => go(firstW, lastW) },
        ].map((b) => (
          <button
            key={b.v}
            onClick={b.on}
            className={`px-2.5 py-1 text-xs rounded-md transition ${
              selectedN === b.v
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
