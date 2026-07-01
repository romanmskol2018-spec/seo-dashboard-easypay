"use client";
// Единый контрол периода на весь дашборд. Ставит from/to (день, YYYY-MM-DD) в URL,
// сохраняя остальные параметры. Пресеты считаются от max (последний день данных).
// Сравнение — всегда предыдущий период равной длины (дельты во всех секциях).
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(s).getTime() + n * DAY));

export function GlobalDatePicker({
  from,
  to,
  min,
  max,
}: {
  from: string;
  to: string;
  min: string; // самый ранний день данных (для «Всё»)
  max: string; // последний день данных (= сегодня)
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const go = (nf: string, nt: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set("from", nf);
    p.set("to", nt);
    p.delete("period"); // легаси
    p.delete("weeks"); // легаси
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const monthStart = iso(new Date(Date.UTC(new Date(max).getUTCFullYear(), new Date(max).getUTCMonth(), 1)));
  const presets: { label: string; f: string; t: string }[] = [
    { label: "7 дней", f: addDays(max, -6), t: max },
    { label: "30 дней", f: addDays(max, -29), t: max },
    { label: "90 дней", f: addDays(max, -89), t: max },
    { label: "Этот месяц", f: monthStart, t: max },
    { label: "Всё", f: min, t: max },
  ];
  const isActive = (f: string, t: string) => f === from && t === to;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1 bg-surface-2 rounded-xl p-1">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => go(p.f, p.t)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
              isActive(p.f, p.t)
                ? "bg-accent text-white"
                : "text-muted hover:text-fg hover:bg-surface"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        <span>с</span>
        <input
          type="date"
          value={from}
          min={min}
          max={to}
          onChange={(e) => e.target.value && go(e.target.value, to)}
          className="bg-surface border border-border rounded-lg px-2 py-1 text-fg text-xs tabular-nums [color-scheme:dark]"
        />
        <span>по</span>
        <input
          type="date"
          value={to}
          min={from}
          max={max}
          onChange={(e) => e.target.value && go(from, e.target.value)}
          className="bg-surface border border-border rounded-lg px-2 py-1 text-fg text-xs tabular-nums [color-scheme:dark]"
        />
      </label>
      <span className="text-muted text-[11px] hidden sm:inline">· сравнение с пред. периодом</span>
    </div>
  );
}
