"use client";
// Единый выбор периода: пресеты (месяц / прошлый месяц / 90 дней / год / всё)
// + свой диапазон по датам. Меняет from/to (YYYY-MM-DD) в URL, сохраняя прочее.
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function PeriodPicker({
  min,
  max,
  from,
  to,
}: {
  min: string;
  max: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();

  const minT = new Date(min).getTime();
  const maxT = new Date(max).getTime();
  const clamp = (t: number) => Math.min(Math.max(t, minT), maxT);

  const go = (nf: string, nt: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set("from", nf);
    p.set("to", nt);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };

  // референс «сегодня» = последний день с данными
  const ref = new Date(max);
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();

  const presets: { key: string; label: string; from: number; to: number }[] = [
    { key: "month", label: "Этот месяц", from: Date.UTC(y, m, 1), to: maxT },
    { key: "prev", label: "Прошлый месяц", from: Date.UTC(y, m - 1, 1), to: Date.UTC(y, m, 0) },
    { key: "90", label: "90 дней", from: maxT - 89 * DAY, to: maxT },
    { key: "year", label: "Год", from: maxT - 364 * DAY, to: maxT },
    { key: "all", label: "Всё время", from: minT, to: maxT },
  ].map((p) => ({ ...p, from: clamp(p.from), to: clamp(p.to) }));

  const active = presets.find((p) => iso(p.from) === from && iso(p.to) === to)?.key ?? "custom";

  const inputCls =
    "bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none cursor-pointer";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Пресеты */}
      <div className="inline-flex flex-wrap bg-surface-2 border border-border rounded-lg p-1 gap-0.5">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => go(iso(p.from), iso(p.to))}
            className={`px-2.5 py-1 text-xs rounded-md transition ${
              active === p.key ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Свой диапазон */}
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span>с</span>
        <input
          type="date"
          value={from}
          min={min}
          max={to}
          onChange={(e) => e.target.value && go(e.target.value, to)}
          className={inputCls}
        />
        <span>по</span>
        <input
          type="date"
          value={to}
          min={from}
          max={max}
          onChange={(e) => e.target.value && go(from, e.target.value)}
          className={inputCls}
        />
      </div>
    </div>
  );
}
