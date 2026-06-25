import Link from "next/link";
import { getDashboardData, getLeadsData, getSalesData } from "@/lib/data";
import type { LeadsData, SalesData } from "@/lib/data";
import { getSessionUser } from "@/lib/auth";
import { StatCard } from "@/components/StatCard";
import { PeriodSwitcher } from "@/components/PeriodSwitcher";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { EngineSwitcher } from "@/components/EngineSwitcher";
import { TrafficChart } from "@/components/TrafficChart";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Icon } from "@/components/Icon";
import type { Granularity } from "@/lib/data";
import { VisibilityChart } from "@/components/VisibilityChart";
import {
  formatNumber,
  formatPct,
  formatDelta,
  formatDateShort,
} from "@/lib/format";

export const dynamic = "force-dynamic";

// Значение с инлайн-стрелкой прироста/падения (запросы в топе, визиты и т.п.)
function TopCell({
  value,
  delta,
  display,
}: {
  value: number;
  delta: number | null;
  display?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <span>{display ?? value}</span>
      {delta !== null && delta !== 0 && (
        <span
          className={`text-xs ${delta > 0 ? "text-positive" : "text-negative"}`}
        >
          {delta > 0 ? "▲" : "▼"}
          {formatNumber(Math.abs(delta))}
        </span>
      )}
    </div>
  );
}

const LEAD_PROJECTS = [
  "Easypay.World",
  "4YouCards",
  "VisaMasterCards",
  "AVO.cards",
  "Visatut",
];

export default async function DashboardPage(props: {
  searchParams: Promise<{
    period?: string;
    group?: string;
    engine?: string;
    proj?: string;
  }>;
}) {
  const { period, group, engine, proj } = await props.searchParams;
  const project =
    proj && ["ALL", ...LEAD_PROJECTS].includes(proj) ? proj : "ALL";
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

  // Лиды и продажи из CRM (отдельно: таблицы могут быть ещё не созданы)
  let leads: LeadsData | null = null;
  let sales: SalesData | null = null;
  try {
    [leads, sales] = await Promise.all([getLeadsData(project), getSalesData()]);
  } catch {
    leads = null;
    sales = null;
  }

  // Ссылка на тот же дашборд со сменой проекта (период/группировка/движок сохраняются)
  const projHref = (p: string) => {
    const sp = new URLSearchParams();
    if (period) sp.set("period", String(period));
    if (group) sp.set("group", String(group));
    if (engine) sp.set("engine", String(engine));
    sp.set("proj", p);
    return `/?${sp.toString()}`;
  };

  // Подписи периодов для таблицы трафика (было → стало)
  const prevRange = data
    ? `${formatDateShort(data.period.prevStart)} – ${formatDateShort(data.period.prevEnd)}`
    : "";
  const currRange = data
    ? `${formatDateShort(data.period.currStart)} – ${formatDateShort(data.period.currEnd)}`
    : "";

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Шапка */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent/15 text-accent shrink-0">
            <Icon name="chart" />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">
              SEO Дашборд EasyPay
            </h1>
            <p className="text-muted text-sm">
              Трафик из Яндекс.Метрики · Видимость из Топвизора
            </p>
          </div>
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
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-surface border border-border hover:border-accent transition"
          >
            <Icon name={user ? "gear" : "login"} className="w-4 h-4" />
            {user ? "Админка" : "Войти"}
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
              icon="trending"
            />
            <StatCard
              label="Посетители"
              value={formatNumber(data.totals.visitors)}
              icon="users"
            />
            <StatCard
              label="Просмотры"
              value={formatNumber(data.totals.pageviews)}
              icon="eye"
            />
            <StatCard
              label="Видимость в ТОП-10 (ср.)"
              value={formatPct(data.totals.avgVisibility)}
              delta={data.totals.visibilityDeltaPct}
              hint="к пред. периоду"
              icon="search"
            />
          </section>

          {/* График трафика */}
          <section className="bg-surface border border-border rounded-2xl p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium flex items-center gap-2">
                <Icon name="trending" className="w-5 h-5 text-accent" />
                Трафик по сайтам
              </h2>
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
            <h2 className="font-medium mb-4 flex items-center gap-2">
              <Icon name="globe" className="w-5 h-5 text-accent" />
              Трафик по Метрике
            </h2>
            {data.sites.length === 0 ? (
              <p className="text-muted text-sm">
                Пока нет сайтов. Добавь их в админке.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-border align-bottom">
                    <th className="py-2 pr-4 font-medium">Сайт</th>
                    <th className="py-2 px-4 font-medium text-right">
                      <div>Визиты: было</div>
                      <div className="text-xs font-normal text-muted/70">
                        {prevRange}
                      </div>
                    </th>
                    <th className="py-2 px-4 font-medium text-right">
                      <div>Визиты: стало</div>
                      <div className="text-xs font-normal text-muted/70">
                        {currRange}
                      </div>
                    </th>
                    <th className="py-2 pl-4 font-medium text-right">
                      Динамика, %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.sites.map((s) => {
                    const d = formatDelta(s.deltaPct);
                    const visitsDelta =
                      s.prevVisits > 0 ? s.visits - s.prevVisits : null;
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
                        <td className="py-3 px-4 text-right text-muted">
                          {s.prevVisits > 0 ? formatNumber(s.prevVisits) : "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <TopCell
                            value={s.visits}
                            delta={visitsDelta}
                            display={formatNumber(s.visits)}
                          />
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
              <h2 className="font-medium flex items-center gap-2">
                <Icon name="search" className="w-5 h-5 text-accent" />
                Видимость в ТОП-10 по проектам
              </h2>
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
              <h2 className="font-medium flex items-center gap-2">
                <Icon name="target" className="w-5 h-5 text-accent" />
                Проекты (видимость) · {searchEngine}
              </h2>
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

      {/* ===================== ЛИДЫ (CRM) ===================== */}
      {leads && leads.weeks.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 mt-8 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="font-medium flex items-center gap-2">
              <Icon name="users" className="w-5 h-5 text-accent" />
              Лиды по неделям · {project === "ALL" ? "все проекты" : project}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {["ALL", ...leads.projects].map((p) => (
                <Link
                  key={p}
                  href={projHref(p)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                    p === project
                      ? "bg-accent/15 text-accent border-accent"
                      : "bg-surface text-muted border-border hover:border-accent"
                  }`}
                >
                  {p === "ALL" ? "Все проекты" : p}
                </Link>
              ))}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-left border-b border-border">
                <th className="py-2 pr-4 font-medium">Неделя</th>
                <th className="py-2 px-3 font-medium text-right">Вал</th>
                <th className="py-2 px-3 font-medium text-right">Кач</th>
                <th className="py-2 px-3 font-medium text-right">SEO</th>
                <th className="py-2 px-3 font-medium text-right">Реком.</th>
                <th className="py-2 px-3 font-medium text-right">Директ</th>
                <th className="py-2 px-3 font-medium text-right">Клерк</th>
                <th className="py-2 px-3 font-medium text-right">Инст.</th>
                <th className="py-2 px-3 font-medium text-right">Карты</th>
                <th className="py-2 px-3 font-medium text-right">Дзен</th>
                <th className="py-2 px-3 font-medium text-right">Ютуб</th>
                <th className="py-2 pl-3 font-medium text-right">Партн.</th>
              </tr>
            </thead>
            <tbody>
              {leads.weeks.map((w) => (
                <tr
                  key={w.weekStart}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-2.5 pr-4 font-medium">{w.label}</td>
                  <td className="py-2.5 px-3 text-right font-semibold">
                    {formatNumber(w.val)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-positive">
                    {w.qual === null ? "—" : formatNumber(w.qual)}
                  </td>
                  <td className="py-2.5 px-3 text-right">{w.seo || "—"}</td>
                  <td className="py-2.5 px-3 text-right">{w.recom || "—"}</td>
                  <td className="py-2.5 px-3 text-right">{w.direct || "—"}</td>
                  <td className="py-2.5 px-3 text-right">{w.klerk || "—"}</td>
                  <td className="py-2.5 px-3 text-right">{w.insta || "—"}</td>
                  <td className="py-2.5 px-3 text-right">{w.karty || "—"}</td>
                  <td className="py-2.5 px-3 text-right">{w.dzen || "—"}</td>
                  <td className="py-2.5 px-3 text-right">{w.youtube || "—"}</td>
                  <td className="py-2.5 pl-3 text-right">{w.partner || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted text-xs mt-3">
            Уникальный лид = уникальный контакт (мобильный клиента или визит
            Метрики). Кач-лиды — общие по проектам (DEAL не разбит по проектам).
          </p>
        </section>
      )}

      {/* ===================== ПРОДАЖИ КАРТ (CRM) ===================== */}
      {sales && sales.cards > 0 && (
        <section className="mt-8">
          <h2 className="font-medium flex items-center gap-2 mb-4">
            <Icon name="trending" className="w-5 h-5 text-accent" />
            Продажи карт (реальные — оплаченные, без импорта)
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <StatCard
              label="Карт продано"
              value={formatNumber(sales.cards)}
              icon="trending"
            />
            <StatCard
              label="Выручка"
              value={`${formatNumber(sales.revenue)} ₽`}
              icon="chart"
            />
            <StatCard
              label="Средний чек"
              value={`${formatNumber(sales.avg)} ₽`}
            />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
              <h3 className="font-medium mb-3 text-sm">Продажи по неделям</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-border">
                    <th className="py-2 pr-4 font-medium">Неделя</th>
                    <th className="py-2 px-3 font-medium text-right">Карт</th>
                    <th className="py-2 pl-3 font-medium text-right">
                      Выручка ₽
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sales.byWeek.map((w) => (
                    <tr
                      key={w.label}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-2.5 pr-4">{w.label}</td>
                      <td className="py-2.5 px-3 text-right font-semibold">
                        {w.cards}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        {formatNumber(w.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
              <h3 className="font-medium mb-3 text-sm">
                Тип карты по банку{" "}
                <span className="text-muted font-normal">
                  (где указан)
                </span>
              </h3>
              {sales.byBank.length === 0 ? (
                <p className="text-muted text-sm">Тип карты пока не заполнен.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted text-left border-b border-border">
                      <th className="py-2 pr-4 font-medium">Банк / тип</th>
                      <th className="py-2 pl-3 font-medium text-right">Карт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.byBank.map((b) => (
                      <tr
                        key={b.bank}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2.5 pr-4">{b.bank}</td>
                        <td className="py-2.5 pl-3 text-right font-semibold">
                          {b.cards}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <p className="text-muted text-xs mt-3">
            Продажа = реально оплаченная сделка (поле «Оплаченная сумма») за
            период, без разового импорта истории 25–28.05.
          </p>
        </section>
      )}

      <footer className="text-center text-muted text-xs mt-10">
        SEO Дашборд EasyPay · трафик и позиции — из админки · лиды и продажи —
        импорт из CRM (npm run import:crm)
      </footer>
    </main>
  );
}
