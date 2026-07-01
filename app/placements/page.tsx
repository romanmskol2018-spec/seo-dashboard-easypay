import Link from "next/link";
import { getPlacementsData } from "@/lib/placements";
import { getSessionUser } from "@/lib/auth";
import { StatCard } from "@/components/StatCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TabNav } from "@/components/TabNav";
import { InfoHint } from "@/components/InfoHint";
import { GlobalDatePicker } from "@/components/GlobalDatePicker";
import { Icon } from "@/components/Icon";
import { formatNumber, formatDelta, formatPct } from "@/lib/format";

export const dynamic = "force-dynamic";

type SortKey = "visits" | "leads" | "delta";

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

export default async function PlacementsPage(props: {
  searchParams: Promise<{ site?: string; from?: string; to?: string; sort?: string }>;
}) {
  const { site, from, to, sort } = await props.searchParams;
  const sortKey: SortKey = sort === "leads" || sort === "delta" ? sort : "visits";
  const user = await getSessionUser().catch(() => null);
  const today = new Date().toISOString().slice(0, 10);

  let data: Awaited<ReturnType<typeof getPlacementsData>> | undefined;
  let dbError = false;
  try {
    data = await getPlacementsData(site || "ALL", from || null, to || null, sortKey);
  } catch {
    dbError = true;
  }

  const activeSite = site && data?.sites.includes(site) ? site : "ALL";
  const buildHref = (over: { site?: string; sort?: SortKey }) => {
    const sp = new URLSearchParams();
    if (data?.rangeFrom) sp.set("from", data.rangeFrom);
    if (data?.rangeTo) sp.set("to", data.rangeTo);
    const s = over.site ?? activeSite;
    if (s !== "ALL") sp.set("site", s);
    const so = over.sort ?? sortKey;
    if (so !== "visits") sp.set("sort", so);
    return `/placements?${sp.toString()}`;
  };

  const hasBounds = !!data?.bounds;

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent/15 text-accent shrink-0">
            <Icon name="chart" />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Дашборд EasyPay</h1>
            <p className="text-muted text-sm">Площадки: какой донор приводит людей и лиды</p>
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

      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <TabNav />
        {data?.bounds && (
          <GlobalDatePicker
            from={data.rangeFrom}
            to={data.rangeTo}
            min={data.bounds.min}
            max={today}
          />
        )}
      </div>

      {dbError && (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="text-lg font-medium mb-2">База данных не подключена</div>
          <p className="text-muted text-sm">Проверь подключение Neon в .env.</p>
        </div>
      )}

      {!dbError && !hasBounds && (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="font-medium mb-1">Данные по площадкам ещё не загружены</div>
          <p className="text-muted text-sm">
            Запусти <code>npm run import:referrals -- --days=365 --write</code> — соберёт
            реферальный трафик по доменам-донорам из Метрики.
          </p>
        </div>
      )}

      {!dbError && hasBounds && data && (
        <>
          {/* Период задаётся глобально сверху; тут — что показываем */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted mb-6">
            <Icon name="sliders" className="w-4 h-4" />
            <span className="text-foreground font-medium">{formatRange(data.rangeFrom, data.rangeTo)}</span>
            <span>· переходы с других сайтов (referral), из Яндекс.Метрики</span>
          </div>

          {/* KPI */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Визиты с площадок"
              value={formatNumber(data.totals.visits)}
              delta={data.totals.deltaPct}
              hint="к пред. периоду той же длины"
              icon="trending"
            />
            <StatCard
              label={
                <span className="inline-flex items-center gap-1">
                  Обращения
                  <InfoHint text="Достижения целей-обращений в Яндекс.Метрике (форма, контакты, телефон/мессенджер/e-mail) на реферальных визитах с этого донора — уникальные визиты. Это НЕ CRM-лиды из Bitrix." />
                </span>
              }
              value={formatNumber(data.totals.leads)}
              hint={`с площадок · конверсия ${formatPct(data.totals.conv)}`}
              icon="target"
            />
            <StatCard label="Посетители" value={formatNumber(data.totals.visitors)} icon="users" />
            <StatCard label="Площадок-доноров" value={formatNumber(data.totals.donors)} icon="link" />
          </section>

          {/* Фильтры */}
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
                    {s === "ALL" ? "Все наши сайты" : s}
                  </Link>
                ))}
              </div>
            ) : (
              <span />
            )}
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
          </div>

          {/* Таблица доноров */}
          <section className="bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="py-2 pr-4 font-medium">Площадка (донор)</th>
                  <th className="py-2 px-3 font-medium text-right">Визиты</th>
                  <th className="py-2 px-3 font-medium text-right">Динамика</th>
                  <th className="py-2 px-3 font-medium text-right">
                    <span className="inline-flex items-center gap-1">
                      Обращения
                      <InfoHint text="Уникальные реферальные визиты с целью-обращением в Метрике. Не CRM-лиды." />
                    </span>
                  </th>
                  <th className="py-2 px-3 font-medium text-right">Конв.</th>
                  <th className="py-2 px-3 font-medium text-right">Посет.</th>
                  <th className="py-2 pl-3 font-medium text-right">Тренд</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const d = formatDelta(r.deltaPct);
                  return (
                    <tr key={r.donor} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4">
                        <a
                          href={`https://${r.donor}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 hover:text-accent transition"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${r.donor}&sz=32`}
                            alt=""
                            width={20}
                            height={20}
                            className="rounded shrink-0 bg-surface-2"
                          />
                          <span className="font-medium">{r.donor}</span>
                        </a>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold tabular-nums">{formatNumber(r.visits)}</td>
                      <td className="py-3 px-3 text-right">
                        <span className={d.positive === null ? "text-muted" : d.positive ? "text-positive" : "text-negative"}>
                          {d.text}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-medium">
                        {r.leads ? formatNumber(r.leads) : "—"}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-muted">
                        {r.leads ? formatPct(r.conv) : "—"}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-muted">{formatNumber(r.visitors)}</td>
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
              <p className="text-muted text-sm text-center py-6">За этот период переходов с площадок нет.</p>
            )}
            <p className="text-muted text-xs mt-3">
              Источник — Яндекс.Метрика, переходы с сайтов (referral), реферер свёрнут в домен.
              Лиды — достижения целей-обращений на реферальных визитах. Конв. — лиды/визиты.
              Свои сайты из доноров исключены. Динамика — к пред. периоду той же длины.
            </p>
          </section>
        </>
      )}

      <footer className="text-center text-muted text-xs mt-12">
        Дашборд EasyPay · площадки — Яндекс.Метрика (переходы с сайтов)
      </footer>
    </main>
  );
}
