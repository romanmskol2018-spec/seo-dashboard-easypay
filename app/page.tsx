import Link from "next/link";
import { getDashboardData } from "@/lib/data";
import { getSessionUser } from "@/lib/auth";
import { StatCard } from "@/components/StatCard";
import { PeriodSwitcher } from "@/components/PeriodSwitcher";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { EngineSwitcher } from "@/components/EngineSwitcher";
import { TrafficChart } from "@/components/TrafficChart";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Granularity } from "@/lib/data";
import { VisibilityChart } from "@/components/VisibilityChart";
import { formatNumber, formatPct, formatDelta } from "@/lib/format";

export const dynamic = "force-dynamic";

// Прирост/падение количества запросов в топе
function TopCell({ value, delta }: { value: number; delta: number | null }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span>{value}</span>
      {delta !== null && delta !== 0 && (
        <span
          className={`text-xs ${delta > 0 ? "text-positive" : "text-negative"}`}
        >
          {delta > 0 ? "▲" : "▼"}
          {Math.abs(delta)}
        </span>
      )}
    </div>
  );
}

export default async function DashboardPage(props: {
  searchParams: Promise<{ period?: string; group?: string; engine?: string }>;
}) {
  const { period, group, engine } = await props.searchParams;
  const days = [7, 30, 90, 180, 365].includes(Number(period))
    ? Number(period)
    : 30;
  const granularity: Granularity = ["day", "week", "month"].includes(
    String(group)
  )
    ? (group as Granularity)
    : "day";
  const searchEngine = ["Яндекс", "Google"].includes(String(engine))
    ? (engine as string)
    : "Яндекс";

  const user = await getSessionUser().catch(() => null);

  let data;
  let dbError = false;
  try {
    data = await getDashboardData(days, granularity, searchEngine);
  } catch {
    dbError = true;
  }

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Шапка */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold">SEO Дашборд</h1>
          <p className="text-muted text-sm">
            Трафик из Яндекс.Метрики · Видимость из Топвизора
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSwitcher
            current={days}
            group={granularity}
            engine={searchEngine}
          />
          <ThemeToggle />
          <Link
            href={user ? "/admin" : "/login"}
            className="px-4 py-2 text-sm rounded-lg bg-surface border border-border hover:border-accent transition"
          >
            {user ? "⚙ Админка" : "Войти"}
          </Link>
        </div>
      </header>

      {dbError && (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="text-lg font-medium mb-2">База данных не подключена</div>
          <p className="text-muted text-sm">
            Укажи строку подключения Neon в файле <code>.env</code> и выполни
            миграцию. Подробности — в README проекта.
          </p>
        </div>
      )}

      {data && (
        <>
          {/* Сводные карточки */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Визиты (всего)"
              value={formatNumber(data.totals.visits)}
              delta={data.totals.visitsDeltaPct}
              hint="к пред. периоду"
            />
            <StatCard
              label="Посетители"
              value={formatNumber(data.totals.visitors)}
            />
            <StatCard
              label="Просмотры"
              value={formatNumber(data.totals.pageviews)}
            />
            <StatCard
              label="Видимость в ТОП-10 (ср.)"
              value={formatPct(data.totals.avgVisibility)}
              delta={data.totals.visibilityDeltaPct}
              hint="к пред. периоду"
            />
          </section>

          {/* График трафика */}
          <section className="bg-surface border border-border rounded-2xl p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium">Трафик по сайтам</h2>
              <GroupSwitcher
                current={granularity}
                period={days}
                engine={searchEngine}
              />
            </div>
            <TrafficChart
              data={data.trafficTrend}
              granularity={granularity}
              series={data.sites.map((s) => ({
                id: s.id,
                name: s.name,
                color: s.color,
              }))}
            />
          </section>

          {/* Таблица по сайтам */}
          <section className="bg-surface border border-border rounded-2xl p-5 mb-8 overflow-x-auto">
            <h2 className="font-medium mb-4">Трафик по Метрике</h2>
            {data.sites.length === 0 ? (
              <p className="text-muted text-sm">
                Пока нет сайтов. Добавь их в админке.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-border">
                    <th className="py-2 pr-4 font-medium">Сайт</th>
                    <th className="py-2 px-4 font-medium text-right">Визиты</th>
                    <th className="py-2 px-4 font-medium text-right">
                      Посетители
                    </th>
                    <th className="py-2 px-4 font-medium text-right">
                      Просмотры
                    </th>
                    <th className="py-2 px-4 font-medium text-right">Отказы</th>
                    <th className="py-2 pl-4 font-medium text-right">Динамика</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sites.map((s) => {
                    const d = formatDelta(s.deltaPct);
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ background: s.color }}
                            />
                            <div>
                              <div className="font-medium">{s.name}</div>
                              <div className="text-muted text-xs">
                                {s.domain}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {formatNumber(s.visits)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {formatNumber(s.visitors)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {formatNumber(s.pageviews)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {formatPct(s.bounceRate, 0)}
                        </td>
                        <td className="py-3 pl-4 text-right">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* График видимости */}
          <section className="bg-surface border border-border rounded-2xl p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium">Видимость в ТОП-10 по проектам</h2>
              <EngineSwitcher
                current={searchEngine}
                period={days}
                group={granularity}
              />
            </div>
            <VisibilityChart
              data={data.visibilityTrend}
              series={data.projects.map((p) => ({
                id: p.id,
                name: p.name,
                color: p.color,
              }))}
            />
          </section>

          {/* Таблица по проектам */}
          <section className="bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-medium">Проекты (видимость) · {searchEngine}</h2>
              <EngineSwitcher
                current={searchEngine}
                period={days}
                group={granularity}
              />
            </div>
            {data.projects.length === 0 ? (
              <p className="text-muted text-sm">
                Пока нет проектов. Добавь их в админке.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-border">
                    <th className="py-2 pr-4 font-medium">Проект</th>
                    <th className="py-2 px-4 font-medium text-right">
                      Видимость
                    </th>
                    <th className="py-2 px-4 font-medium text-right">
                      Ср. позиция
                    </th>
                    <th className="py-2 px-4 font-medium text-right">ТОП-3</th>
                    <th className="py-2 px-4 font-medium text-right">ТОП-10</th>
                    <th className="py-2 px-4 font-medium text-right">ТОП-50</th>
                    <th className="py-2 pl-4 font-medium text-right">Динамика</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((p) => {
                    const d = formatDelta(p.deltaPct);
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ background: p.color }}
                            />
                            <div>
                              <div className="font-medium">{p.name}</div>
                              <div className="text-muted text-xs">
                                {p.searchEngine}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {formatPct(p.visibility)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {p.avgPosition.toFixed(1)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <TopCell value={p.top3} delta={p.top3Delta} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <TopCell value={p.top10} delta={p.top10Delta} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <TopCell value={p.top50} delta={p.top50Delta} />
                        </td>
                        <td className="py-3 pl-4 text-right">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <footer className="text-center text-muted text-xs mt-10">
        SEO Дашборд · данные обновляются вручную через админку
      </footer>
    </main>
  );
}
