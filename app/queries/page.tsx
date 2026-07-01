import Link from "next/link";
import { getKeywordsData } from "@/lib/keywords";
import { getSessionUser } from "@/lib/auth";
import { StatCard } from "@/components/StatCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TabNav } from "@/components/TabNav";
import { Icon } from "@/components/Icon";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

function pathOf(u: string | null): string {
  if (!u) return "—";
  try { return new URL(u).pathname.replace(/\/+$/, "") || "/"; } catch { return u; }
}

export default async function QueriesPage(props: {
  searchParams: Promise<{ site?: string; cluster?: string; url?: string; engine?: string; sort?: string }>;
}) {
  const { site, cluster, url, engine, sort } = await props.searchParams;
  const user = await getSessionUser().catch(() => null);
  const sortKey = sort === "delta" ? "delta" : "position";
  const eng = engine === "Google" ? "Google" : "Яндекс";

  let data: Awaited<ReturnType<typeof getKeywordsData>> | undefined;
  let dbError = false;
  try {
    data = await getKeywordsData({ site: site || "ALL", cluster: cluster || null, url: url || null, engine: eng, sort: sortKey });
  } catch {
    dbError = true;
  }

  const buildHref = (over: { engine?: string; cluster?: string | null; sort?: string; site?: string }) => {
    const sp = new URLSearchParams();
    const e = over.engine ?? eng;
    if (e !== "Яндекс") sp.set("engine", e);
    const c = over.cluster !== undefined ? over.cluster : cluster;
    if (c) sp.set("cluster", c);
    const s = over.site ?? (site || "ALL");
    if (s && s !== "ALL") sp.set("site", s);
    if (url) sp.set("url", url);
    const so = over.sort ?? sortKey;
    if (so !== "position") sp.set("sort", so);
    return `/queries?${sp.toString()}`;
  };

  const hasData = !!data && data.rows.length > 0;

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent/15 text-accent shrink-0">
            <Icon name="chart" />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Дашборд EasyPay</h1>
            <p className="text-muted text-sm">Запросы: позиции по ключам и кластерам · Топвизор</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href={user ? "/admin" : "/login"} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-surface border border-border hover:border-accent transition">
            <Icon name={user ? "gear" : "login"} className="w-4 h-4" />
            {user ? "Админка" : "Войти"}
          </Link>
        </div>
      </header>

      <div className="mb-8"><TabNav /></div>

      {dbError && (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="text-lg font-medium mb-2">База данных не подключена</div>
        </div>
      )}

      {!dbError && data && (data.rows.length === 0 && !data.filterUrl && !data.filterCluster) && (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="font-medium mb-1">Позиции ещё не загружены</div>
          <p className="text-muted text-sm">
            Запусти <code>npm run import:topvisor:keywords -- --write</code> — подтянет позиции
            по запросам из Топвизора (Яндекс + Google).
          </p>
        </div>
      )}

      {!dbError && data && (data.rows.length > 0 || data.filterUrl || data.filterCluster) && (
        <>
          {/* Контекст фильтра по статье */}
          {data.filterUrl && (
            <div className="bg-surface border border-border rounded-2xl p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent/15 text-accent shrink-0">
                  <Icon name="search" className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold leading-tight">Запросы статьи</div>
                  <a href={data.filterUrl} target="_blank" rel="noopener noreferrer" className="text-muted text-xs hover:text-accent truncate block">
                    {pathOf(data.filterUrl)}
                  </a>
                </div>
              </div>
              <Link href="/articles" className="text-xs text-muted hover:text-accent flex items-center gap-1">
                <Icon name="back" className="w-4 h-4" /> ко всем статьям
              </Link>
            </div>
          )}

          {/* KPI */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Запросов отслеживается" value={formatNumber(data.totals.tracked)} icon="search" />
            <StatCard label="В ТОП-3" value={formatNumber(data.totals.top3)} icon="target" />
            <StatCard label="В ТОП-10" value={formatNumber(data.totals.top10)} icon="trending" />
            <StatCard label="Средняя позиция" value={data.totals.avg !== null ? String(data.totals.avg) : "—"} icon="spark" />
          </section>

          {/* Фильтры */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Поисковик */}
              <div className="inline-flex bg-surface-2 border border-border rounded-lg p-1 gap-0.5">
                {["Яндекс", "Google"].map((e) => (
                  <Link key={e} href={buildHref({ engine: e })} className={`px-2.5 py-1 text-xs rounded-md transition ${eng === e ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>
                    {e}
                  </Link>
                ))}
              </div>
              {/* Кластер */}
              {data.clusters.length > 0 && (
                <form action="/queries" method="get" className="flex items-center gap-1.5">
                  {url && <input type="hidden" name="url" value={url} />}
                  {eng !== "Яндекс" && <input type="hidden" name="engine" value={eng} />}
                  {sortKey !== "position" && <input type="hidden" name="sort" value={sortKey} />}
                  <select name="cluster" defaultValue={cluster || ""} className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
                    <option value="">Все кластеры</option>
                    {data.clusters.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                  <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs hover:opacity-90 transition">Фильтр</button>
                  {cluster && <Link href={buildHref({ cluster: null })} className="text-xs text-muted hover:text-accent">сброс</Link>}
                </form>
              )}
            </div>
            {/* Сортировка */}
            <div className="inline-flex bg-surface-2 border border-border rounded-lg p-1 gap-0.5">
              {([{ k: "position", l: "По позиции" }, { k: "delta", l: "По росту" }] as { k: string; l: string }[]).map((o) => (
                <Link key={o.k} href={buildHref({ sort: o.k })} className={`px-2.5 py-1 text-xs rounded-md transition ${sortKey === o.k ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>
                  {o.l}
                </Link>
              ))}
            </div>
          </div>

          {/* Таблица */}
          <section className="bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="py-2 pr-4 font-medium">Запрос</th>
                  <th className="py-2 px-3 font-medium">Кластер</th>
                  <th className="py-2 px-3 font-medium text-right">Позиция</th>
                  <th className="py-2 px-3 font-medium text-right">Динамика</th>
                  {!data.filterUrl && <th className="py-2 pl-3 font-medium">Страница</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.query + i} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{r.query}</td>
                    <td className="py-2.5 px-3 text-muted text-xs">{r.cluster || "—"}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                      {r.position !== null ? (
                        <span className={r.position <= 3 ? "text-positive" : r.position <= 10 ? "" : "text-muted"}>{r.position}</span>
                      ) : (
                        <span className="text-muted">вне ТОП</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {r.move === "in" ? (
                        <span className="text-positive" title="впервые в выдаче">▲ вошёл</span>
                      ) : r.move === "out" ? (
                        <span className="text-negative" title="выпал из выдачи">▼ выпал</span>
                      ) : r.delta === null || r.delta === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className={r.delta > 0 ? "text-positive" : "text-negative"}>
                          {r.delta > 0 ? "▲" : "▼"}{Math.abs(r.delta)}
                        </span>
                      )}
                    </td>
                    {!data.filterUrl && (
                      <td className="py-2.5 pl-3 text-muted text-xs">
                        {r.url ? (
                          <Link href={`/queries?url=${encodeURIComponent(r.url)}`} className="hover:text-accent" title={r.url}>
                            {pathOf(r.url)}
                          </Link>
                        ) : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.rows.length === 0 && <p className="text-muted text-sm text-center py-6">По этому фильтру запросов нет.</p>}
            <p className="text-muted text-xs mt-3">
              Источник — Топвизор ({eng}). Позиция — последняя проверка; динамика — к предыдущей
              (▲ = поднялись). «Страница» — relevant_url, по которому запрос ранжируется.
            </p>
          </section>
        </>
      )}

      <footer className="text-center text-muted text-xs mt-12">Дашборд EasyPay · позиции — Топвизор</footer>
    </main>
  );
}
