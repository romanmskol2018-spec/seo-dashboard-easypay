// Единый выбор периода: пресеты-ССЫЛКИ (работают без JS, не зависят от гидратации)
// + диапазон по датам через GET-форму. Меняет from/to (YYYY-MM-DD), сохраняя site/articles.
import Link from "next/link";

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function PeriodPicker({
  min,
  max,
  from,
  to,
  site,
  onlyArticles,
}: {
  min: string;
  max: string;
  from: string;
  to: string;
  site: string;
  onlyArticles: boolean;
}) {
  const minT = new Date(min).getTime();
  const maxT = new Date(max).getTime();
  const clamp = (t: number) => Math.min(Math.max(t, minT), maxT);

  const href = (nf: string, nt: string) => {
    const p = new URLSearchParams();
    p.set("from", nf);
    p.set("to", nt);
    if (site && site !== "ALL") p.set("site", site);
    if (onlyArticles) p.set("articles", "1");
    return `/articles?${p.toString()}`;
  };

  const ref = new Date(max);
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const presets = [
    { key: "month", label: "Этот месяц", from: Date.UTC(y, m, 1), to: maxT },
    { key: "prev", label: "Прошлый месяц", from: Date.UTC(y, m - 1, 1), to: Date.UTC(y, m, 0) },
    { key: "90", label: "90 дней", from: maxT - 89 * DAY, to: maxT },
    { key: "year", label: "Год", from: maxT - 364 * DAY, to: maxT },
    { key: "all", label: "Всё время", from: minT, to: maxT },
  ].map((p) => ({ ...p, from: clamp(p.from), to: clamp(p.to) }));

  const active = presets.find((p) => iso(p.from) === from && iso(p.to) === to)?.key ?? "custom";

  const inputCls =
    "bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Пресеты — ссылки */}
      <div className="inline-flex flex-wrap bg-surface-2 border border-border rounded-lg p-1 gap-0.5">
        {presets.map((p) => (
          <Link
            key={p.key}
            href={href(iso(p.from), iso(p.to))}
            scroll={false}
            className={`px-2.5 py-1 text-xs rounded-md transition ${
              active === p.key ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Свой диапазон — GET-форма (работает без JS) */}
      <form action="/articles" method="get" className="flex items-center gap-1.5 text-xs text-muted">
        <span>с</span>
        <input type="date" name="from" defaultValue={from} min={min} max={max} className={inputCls} />
        <span>по</span>
        <input type="date" name="to" defaultValue={to} min={min} max={max} className={inputCls} />
        {site && site !== "ALL" && <input type="hidden" name="site" value={site} />}
        {onlyArticles && <input type="hidden" name="articles" value="1" />}
        <button
          type="submit"
          className="px-2.5 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition"
        >
          Применить
        </button>
      </form>
    </div>
  );
}
