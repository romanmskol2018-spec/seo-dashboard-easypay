import Link from "next/link";
import { getArticlesData } from "@/lib/articles";
import { getKeywordSummaryByUrl } from "@/lib/keywords";
import { getSessionUser } from "@/lib/auth";
import { StatCard } from "@/components/StatCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TabNav } from "@/components/TabNav";
import { InfoHint } from "@/components/InfoHint";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Icon } from "@/components/Icon";
import { formatNumber, formatDelta, formatPct, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

function formatRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const sameYear = f.getUTCFullYear() === t.getUTCFullYear();
  const dM = (d: Date, withYear: boolean) =>
    new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: withYear ? "numeric" : undefined,
      timeZone: "UTC",
    }).format(d);
  return `${dM(f, !sameYear)} – ${dM(t, true)}`;
}

// Спарклайн (SVG, серверный рендер) — тренд визитов по неделям периода.
function Sparkline({ points }: { points: number[] }) {
  const w = 96;
  const h = 24;
  if (points.length < 2) return <span className="text-muted text-xs">—</span>;
  const max = Math.max(...points, 1);
  const stepX = w / (points.length - 1);
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

type SortKey = "visits" | "leads" | "modified" | "delta";

export default async function ArticlesPage(props: {
  searchParams: Promise<{
    site?: string;
    from?: string;
    to?: string;
    articles?: string;
    sort?: string;
  }>;
}) {
  const { site, from, to, articles, sort } = await props.searchParams;
  const onlyArticles = articles === "1";
  const sortKey: SortKey =
    sort === "leads" || sort === "modified" || sort === "delta" ? sort : "visits";
  const user = await getSessionUser().catch(() => null);

  let data: Awaited<ReturnType<typeof getArticlesData>> | undefined;
  let dbError = false;
  try {
    data = await getArticlesData(site || "ALL", from || null, to || null, onlyArticles, sortKey);
  } catch {
    dbError = true;
  }

  const activeSite = site && data?.sites.includes(site) ? site : "ALL";
  const buildHref = (over: { site?: string; articles?: boolean; sort?: SortKey }) => {
    const sp = new URLSearchParams();
    if (data?.rangeFrom) sp.set("from", data.rangeFrom);
    if (data?.rangeTo) sp.set("to", data.rangeTo);
    const s = over.site ?? activeSite;
    if (s !== "ALL") sp.set("site", s);
    const a = over.articles ?? onlyArticles;
    if (a) sp.set("articles", "1");
    const so = over.sort ?? sortKey;
    if (so !== "visits") sp.set("sort", so);
    return `/articles?${sp.toString()}`;
  };

  const hasData = !!data && data.rows.length > 0;
  const hasBounds = !!data?.bounds;

  // сводка позиций (Топвизор) по URL — для колонки «Запросы»
  const kwByUrl = data
    ? await getKeywordSummaryByUrl(data.rows.map((r) => r.url)).catch(() => new Map())
    : new Map();

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
            <p className="text-muted text-sm">Статьи: какая приводит людей из поиска</p>
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

      {!dbError && !hasBounds && (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="font-medium mb-1">Данные по статьям ещё не загружены</div>
          <p className="text-muted text-sm">
            Запусти <code>npm run import:metrika:pages -- --days=365 --write</code> — соберёт
            дневной трафик по страницам входа из Метрики (только органика).
          </p>
        </div>
      )}

      {!dbError && hasBounds && data && (
        <>
          {/* Период — одна понятная строка + селектор */}
          <div className="bg-surface border border-border rounded-2xl p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent/15 text-accent shrink-0">
                  <Icon name="sliders" className="w-5 h-5" />
                </span>
                <div>
                  <div className="font-semibold leading-tight">
                    {formatRange(data.rangeFrom, data.rangeTo)}
                  </div>
                  <div className="text-muted text-xs">
                    только органический трафик (SEO) · из Яндекс.Метрики
                  </div>
                </div>
              </div>
              <PeriodPicker
                min={data.bounds!.min}
                max={data.bounds!.max}
                from={data.rangeFrom}
                to={data.rangeTo}
                basePath="/articles"
                params={{
                  ...(activeSite !== "ALL" ? { site: activeSite } : {}),
                  ...(onlyArticles ? { articles: "1" } : {}),
                  ...(sortKey !== "visits" ? { sort: sortKey } : {}),
                }}
              />
            </div>
          </div>

          {/* KPI */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Визиты из поиска"
              value={formatNumber(data.totals.visits)}
              delta={data.totals.deltaPct}
              hint="к пред. периоду той же длины"
              icon="trending"
            />
            <StatCard
              label={
                <span className="inline-flex items-center gap-1">
                  Обращения
                  <InfoHint text="Достижения целей-обращений в Яндекс.Метрике (отправка формы, контакты, клик по телефону/мессенджеру/e-mail) на странице входа — считаем как уникальные визиты. Это НЕ CRM-лиды из Bitrix (воронка на «Обзоре»)." />
                </span>
              }
              value={formatNumber(data.totals.leads)}
              hint={`из поиска · конверсия ${formatPct(data.totals.conv)}`}
              icon="target"
            />
            <StatCard label="Посетители" value={formatNumber(data.totals.visitors)} icon="users" />
            <StatCard
              label={onlyArticles ? "Статей с трафиком" : "Страниц с трафиком"}
              value={formatNumber(data.totals.pages)}
              icon="search"
            />
          </section>

          {/* Фильтры: сайт + только статьи */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            {data.sites.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {["ALL", ...data.sites].map((s) => (
                  <Link
                    key={s}
                    href={buildHref({ site: s })}
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
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {/* Сортировка */}
              <div className="inline-flex bg-surface-2 border border-border rounded-lg p-1 gap-0.5">
                {(
                  [
                    { k: "visits", label: "По визитам" },
                    { k: "leads", label: "По обращениям" },
                    { k: "delta", label: "По росту" },
                  ] as { k: SortKey; label: string }[]
                ).map((o) => (
                  <Link
                    key={o.k}
                    href={buildHref({ sort: o.k })}
                    className={`px-2.5 py-1 text-xs rounded-md transition ${
                      sortKey === o.k ? "bg-accent text-white" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </Link>
                ))}
              </div>
              {/* Только статьи */}
              <Link
                href={buildHref({ articles: !onlyArticles })}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
                  onlyArticles
                    ? "bg-accent/15 text-accent border-accent"
                    : "bg-surface text-muted border-border hover:border-accent"
                }`}
              >
                {onlyArticles ? (
                  <Icon name="check" className="w-4 h-4" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-sm border border-current opacity-60" />
                )}
                Только статьи
              </Link>
            </div>
          </div>

          {/* Таблица */}
          <section className="bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="py-2 pr-4 font-medium">Статья / страница</th>
                  <th className="py-2 px-3 font-medium text-right">Визиты</th>
                  <th className="py-2 px-3 font-medium text-right">Динамика</th>
                  <th className="py-2 px-3 font-medium text-right">
                    <span className="inline-flex items-center gap-1">
                      Обращения
                      <InfoHint text="Уникальные визиты с целью-обращением в Метрике (форма/контакты/телефон/мессенджер) на странице входа. Не CRM-лиды." />
                    </span>
                  </th>
                  <th className="py-2 px-3 font-medium text-right">Конв.</th>
                  <th className="py-2 px-3 font-medium text-right">Посет.</th>
                  <th className="py-2 px-3 font-medium text-right">Отказы</th>
                  <th className="py-2 px-3 font-medium text-right">Время</th>
                  <th className="py-2 px-3 font-medium text-right">Запросы</th>
                  <th className="py-2 pl-3 font-medium text-right">Тренд</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const d = formatDelta(r.deltaPct);
                  return (
                    <tr key={r.url} className="border-b border-border/50 last:border-0 align-top">
                      <td className="py-3 pr-4 max-w-[420px]">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-3"
                          title={r.url}
                        >
                          {/* превью */}
                          {r.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.image}
                              alt=""
                              loading="lazy"
                              className="w-16 h-12 rounded-md object-cover border border-border shrink-0 bg-surface-2"
                            />
                          ) : (
                            <span className="w-16 h-12 rounded-md border border-border shrink-0 bg-surface-2 grid place-items-center text-muted">
                              <Icon name="globe" className="w-4 h-4" />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block font-medium leading-snug group-hover:text-accent transition line-clamp-2">
                              {r.title || r.path}
                            </span>
                            <span className="block text-muted text-xs truncate">
                              {data.sites.length > 1 ? `${r.site} · ` : ""}
                              {r.path}
                            </span>
                          </span>
                        </a>
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
                      <td className="py-3 px-3 text-right tabular-nums font-medium">
                        {r.leads ? formatNumber(r.leads) : "—"}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-muted">
                        {r.leads ? formatPct(r.conv) : "—"}
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
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {(() => {
                          const s = kwByUrl.get(r.url);
                          if (!s || !s.queries)
                            return <span className="text-muted">—</span>;
                          return (
                            <Link
                              href={`/queries?url=${encodeURIComponent(r.url)}`}
                              className="hover:text-accent transition"
                              title="Открыть позиции статьи"
                            >
                              <span className="font-medium">{s.queries}</span>
                              {s.top10 > 0 && (
                                <span className="text-positive text-xs"> · ТОП10: {s.top10}</span>
                              )}
                            </Link>
                          );
                        })()}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <div className="flex justify-end">
                          <Sparkline points={r.trend} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.rows.length === 0 && (
              <p className="text-muted text-sm text-center py-6">
                За этот период данных нет. Поменяй период или выключи «только статьи».
              </p>
            )}
            <p className="text-muted text-xs mt-3">
              Источник — Яндекс.Метрика, страница входа (ym:s:startURL), только органика.
              Лиды — достижения целей-обращений (контакты, заявки, клики по телефону/мессенджеру/email)
              на странице входа. Конв. — лиды/визиты. Динамика — к пред. периоду той же длины.
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
