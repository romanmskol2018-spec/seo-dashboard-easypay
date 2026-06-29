import Link from "next/link";
import { getArticlesData } from "@/lib/articles";
import { getSessionUser } from "@/lib/auth";
import { StatCard } from "@/components/StatCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TabNav } from "@/components/TabNav";
import { WeekRangePicker } from "@/components/WeekRangePicker";
import { Icon } from "@/components/Icon";
import {
  formatNumber,
  formatDelta,
  formatPct,
  formatDuration,
} from "@/lib/format";

export const dynamic = "force-dynamic";

// Маленький спарклайн (SVG, серверный рендер) — тренд визитов по неделям окна.
function Sparkline({ points }: { points: number[] }) {
  const w = 96;
  const h = 24;
  if (points.length === 0) return <span className="text-muted">—</span>;
  const max = Math.max(...points, 1);
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;
  const coords = points.map((v, i) => [i * stepX, h - (v / max) * (h - 3) - 1.5]);
  const d = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const up = points[points.length - 1] >= points[0];
  const color = up ? "var(--positive)" : "var(--negative)";
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
}

export default async function ArticlesPage(props: {
  searchParams: Promise<{ site?: string; from?: string; to?: string }>;
}) {
  const { site, from, to } = await props.searchParams;
  const user = await getSessionUser().catch(() => null);

  let data: Awaited<ReturnType<typeof getArticlesData>> | undefined;
  let dbError = false;
  try {
    data = await getArticlesData(site || "ALL", from || null, to || null);
  } catch {
    dbError = true;
  }

  const activeSite = site && data?.sites.includes(site) ? site : "ALL";
  const siteHref = (s: string) => {
    const sp = new URLSearchParams();
    if (data?.rangeFrom) sp.set("from", data.rangeFrom);
    if (data?.rangeTo) sp.set("to", data.rangeTo);
    if (s !== "ALL") sp.set("site", s);
    return `/articles?${sp.toString()}`;
  };

  const hasData = !!data && data.rows.length > 0;

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Шапка */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent/15 text-accent shrink-0">
            <Icon name="chart" />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Дашборд EasyPay</h1>
            <p className="text-muted text-sm">Статьи: какая приводит людей, какая нет</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href={user ? "/admin" : "/login"}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-surface border border-border hover:border-accent transition"
          >
            <Icon name={user ? "gear" : "login"} className="w-4 h-4" />
            {user ? "Админка" : "Войти"}
          </Link>
        </div>
      </header>

      <div className="mb-8">
        <TabNav />
      </div>

      {dbError && (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="text-lg font-medium mb-2">База данных не подключена</div>
          <p className="text-muted text-sm">Проверь подключение Neon в .env.</p>
        </div>
      )}

      {!dbError && !hasData && (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="font-medium mb-1">Данные по статьям ещё не загружены</div>
          <p className="text-muted text-sm">
            Запусти <code>npm run import:metrika:pages -- --write</code> — он соберёт трафик
            по страницам входа из Метрики (только органика) за последние недели.
          </p>
        </div>
      )}

      {!dbError && hasData && data && (
        <>
          {/* Заголовок периода + пикер */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2 text-sm">
              <Icon name="sliders" className="w-4 h-4 text-muted" />
              <span className="font-medium">Трафик по статьям</span>
              {data.rangeFrom && (
                <span className="text-muted">· {data.rangeFrom} – {data.rangeTo}</span>
              )}
            </div>
            {data.rangeFrom && data.rangeTo && (
              <WeekRangePicker
                weeks={data.weeks}
                from={data.rangeFrom}
                to={data.rangeTo}
                basePath="/articles"
              />
            )}
          </div>

          {/* KPI */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Визиты (органика)"
              value={formatNumber(data.totals.visits)}
              delta={data.totals.deltaPct}
              hint="к пред. периоду"
              icon="trending"
            />
            <StatCard label="Посетители" value={formatNumber(data.totals.visitors)} icon="users" />
            <StatCard label="Просмотры" value={formatNumber(data.totals.pageviews)} icon="eye" />
            <StatCard label="Статей с трафиком" value={formatNumber(data.totals.articles)} icon="search" />
          </section>

          {/* Фильтр по сайту */}
          {data.sites.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {["ALL", ...data.sites].map((s) => (
                <Link
                  key={s}
                  href={siteHref(s)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                    s === activeSite
                      ? "bg-accent/15 text-accent border-accent"
                      : "bg-surface text-muted border-border hover:border-accent"
                  }`}
                >
                  {s === "ALL" ? "Все сайты" : s}
                </Link>
              ))}
            </div>
          )}

          {/* Таблица статей */}
          <section className="bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="py-2 pr-4 font-medium">Страница</th>
                  <th className="py-2 px-3 font-medium text-right">Визиты</th>
                  <th className="py-2 px-3 font-medium text-right">Динамика</th>
                  <th className="py-2 px-3 font-medium text-right">Посет.</th>
                  <th className="py-2 px-3 font-medium text-right">Отказы</th>
                  <th className="py-2 px-3 font-medium text-right">Время</th>
                  <th className="py-2 pl-3 font-medium text-right">Тренд</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const d = formatDelta(r.deltaPct);
                  return (
                    <tr key={r.url} className="border-b border-border/50 last:border-0 align-top">
                      <td className="py-3 pr-4 max-w-[360px]">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:text-accent transition break-words"
                          title={r.url}
                        >
                          {r.path}
                        </a>
                        {data.sites.length > 1 && (
                          <div className="text-muted text-xs">{r.site}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold tabular-nums">
                        {formatNumber(r.visits)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={
                            d.positive === null
                              ? "text-muted"
                              : d.positive
                                ? "text-positive"
                                : "text-negative"
                          }
                        >
                          {d.text}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-muted">
                        {formatNumber(r.visitors)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-muted">
                        {formatPct(r.bounceRate, 0)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-muted">
                        {formatDuration(r.avgDuration)}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <div className="flex justify-end">
                          <Sparkline points={r.trend.map((t) => t.visits)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-muted text-xs mt-3">
              Источник — Яндекс.Метрика, страница входа (ym:s:startURL), только органический трафик.
              Динамика — к предыдущему периоду той же длины. Лиды по статьям появятся в Фазе 2.
            </p>
          </section>
        </>
      )}

      <footer className="text-center text-muted text-xs mt-12">
        Дашборд EasyPay · трафик по статьям — Яндекс.Метрика (органика)
      </footer>
    </main>
  );
}
