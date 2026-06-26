import Link from "next/link";
import {
  getDashboardData,
  getLeadsData,
  getSalesData,
  getFunnelData,
  getAvailableWeeks,
} from "@/lib/data";
import type { LeadsData, SalesData, FunnelData } from "@/lib/data";
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
import { FunnelChart } from "@/components/FunnelChart";
import { ChannelMix } from "@/components/ChannelMix";
import { RevenueBars } from "@/components/RevenueBars";
import { WeekRangePicker } from "@/components/WeekRangePicker";
import { SeoFunnel } from "@/components/SeoFunnel";
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

// Заголовок раздела (с опциональным управляющим элементом справа)
function SectionTitle({
  icon,
  title,
  sub,
  action,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5 mt-12 first:mt-0">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent/15 text-accent shrink-0">
        <Icon name={icon} className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        {sub && <p className="text-muted text-xs">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
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
    weeks?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { period, group, engine, proj, weeks, from, to } =
    await props.searchParams;
  const project =
    proj && ["ALL", ...LEAD_PROJECTS].includes(proj) ? proj : "ALL";
  // Старый параметр weeks ("4"|"8"|"all") поддерживаем для обратной совместимости
  const weeksParam = ["4", "8", "all"].includes(String(weeks))
    ? (weeks as string)
    : null;
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

  // Бизнес-данные из CRM (отдельно: таблицы могут быть ещё не созданы)
  let leads: LeadsData | null = null;
  let sales: SalesData | null = null;
  let funnel: FunnelData | null = null;
  let availableWeeks: { weekStart: string; label: string }[] = [];
  let rangeFrom: string | null = null;
  let rangeTo: string | null = null;
  try {
    availableWeeks = await getAvailableWeeks();
    const starts = availableWeeks.map((w) => w.weekStart);
    // Резолвим диапазон: from/to из URL → иначе старый weeks → иначе всё
    rangeFrom = from && starts.includes(from) ? from : null;
    rangeTo = to && starts.includes(to) ? to : null;
    if (!rangeFrom && !rangeTo && weeksParam && starts.length) {
      if (weeksParam === "all") {
        rangeFrom = starts[0];
        rangeTo = starts[starts.length - 1];
      } else {
        const n = Number(weeksParam);
        rangeFrom = starts[Math.max(0, starts.length - n)];
        rangeTo = starts[starts.length - 1];
      }
    }
    if (!rangeFrom) rangeFrom = starts[0] ?? null;
    if (!rangeTo) rangeTo = starts[starts.length - 1] ?? null;
    if (rangeFrom && rangeTo && rangeFrom > rangeTo) rangeFrom = rangeTo;

    funnel = await getFunnelData(rangeFrom, rangeTo);
    [leads, sales] = await Promise.all([
      getLeadsData(project, rangeFrom, rangeTo),
      getSalesData(
        funnel.windowFrom || undefined,
        funnel.windowTo || undefined
      ),
    ]);
  } catch {
    leads = null;
    sales = null;
    funnel = null;
  }

  // Ссылка на тот же дашборд со сменой проекта (период/группировка/движок/окно сохраняются)
  const projHref = (p: string) => {
    const sp = new URLSearchParams();
    if (period) sp.set("period", String(period));
    if (group) sp.set("group", String(group));
    if (engine) sp.set("engine", String(engine));
    if (rangeFrom) sp.set("from", rangeFrom);
    if (rangeTo) sp.set("to", rangeTo);
    sp.set("proj", p);
    return `/?${sp.toString()}`;
  };

  // Суффикс для SEO-переключателей, чтобы они сохраняли окно воронки и проект
  const seoSuffix =
    (rangeFrom ? `&from=${rangeFrom}` : "") +
    (rangeTo ? `&to=${rangeTo}` : "") +
    (project !== "ALL" ? `&proj=${encodeURIComponent(project)}` : "");

  // Подписи периодов для таблицы трафика (было → стало)
  const prevRange = data
    ? `${formatDateShort(data.period.prevStart)} – ${formatDateShort(data.period.prevEnd)}`
    : "";
  const currRange = data
    ? `${formatDateShort(data.period.currStart)} – ${formatDateShort(data.period.currEnd)}`
    : "";

  const hasSeo =
    !!data && (data.sites.length > 0 || data.projects.length > 0);
  const hasBusiness = !!funnel && (funnel.leads > 0 || funnel.sales > 0);

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Шапка */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent/15 text-accent shrink-0">
            <Icon name="chart" />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">
              Дашборд EasyPay
            </h1>
            <p className="text-muted text-sm">
              Воронка: трафик → лиды → продажи · SEO-видимость
            </p>
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

      {dbError && (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="text-lg font-medium mb-2">База данных не подключена</div>
          <p className="text-muted text-sm">
            Укажи строку подключения Neon в файле <code>.env</code> и выполни
            миграцию. Подробности — в README проекта.
          </p>
        </div>
      )}

      {/* ===================== БИЗНЕС: ВОРОНКА И ДЕНЬГИ ===================== */}
      {hasBusiness && funnel && (
        <>
          {/* Гибкий выбор периода по неделям (воронка/лиды/продажи) */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2 text-sm">
              <Icon name="sliders" className="w-4 h-4 text-muted" />
              <span className="font-medium">Воронка и продажи</span>
              {funnel.rangeFrom && (
                <span className="text-muted">
                  · {funnel.weeks} нед · {funnel.rangeFrom} – {funnel.rangeTo}
                </span>
              )}
            </div>
            {rangeFrom && rangeTo && (
              <WeekRangePicker
                weeks={availableWeeks}
                from={rangeFrom}
                to={rangeTo}
              />
            )}
          </div>

          {/* KPI-табло про деньги */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard
              label="Выручка"
              value={`${formatNumber(funnel.revenue)} ₽`}
              delta={funnel.revenueDeltaPct}
              hint="к пред. периоду"
              icon="chart"
            />
            <StatCard
              label="Карт продано"
              value={formatNumber(funnel.sales)}
              delta={funnel.salesDeltaPct}
              hint="к пред. периоду"
              icon="trending"
            />
            <StatCard
              label="Чек: средний"
              value={`${formatNumber(funnel.avgCheck)} ₽`}
              hint={`медиана ${formatNumber(funnel.medianCheck)} ₽`}
              icon="spark"
            />
            <StatCard
              label="Кач-лиды"
              value={formatNumber(funnel.qual)}
              delta={funnel.qualDeltaPct}
              hint="к пред. периоду"
              icon="users"
            />
          </section>

          {/* Воронка + SEO-подворонка */}
          <section className="grid lg:grid-cols-[2fr_1fr] gap-4 mb-2">
            <FunnelChart data={funnel} />
            <SeoFunnel data={funnel} />
          </section>
        </>
      )}

      {/* ===================== ЛИДЫ: КАНАЛЫ ===================== */}
      {leads && leads.weeks.length > 0 && (
        <section>
          <SectionTitle
            icon="users"
            title="Лиды и каналы привлечения"
            sub={`${project === "ALL" ? "все проекты" : project} · откуда приходят и что конвертит`}
          />
          {/* Фильтр проектов */}
          <div className="flex flex-wrap gap-1.5 mb-4">
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

          <ChannelMix weeks={leads.weeks} />

          {/* Детализация — под спойлером */}
          <details className="mt-4 bg-surface border border-border rounded-2xl overflow-hidden group">
            <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium flex items-center gap-2 hover:bg-surface-2 transition">
              <Icon
                name="sliders"
                className="w-4 h-4 text-muted group-open:text-accent"
              />
              Детализация по неделям и источникам
            </summary>
            <div className="px-5 pb-5 overflow-x-auto">
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
                Метрики). Кач-лиды — общие по проектам (DEAL не разбит по
                проектам).
              </p>
            </div>
          </details>
        </section>
      )}

      {/* ===================== ПРОДАЖИ КАРТ ===================== */}
      {sales && sales.cards > 0 && (
        <section>
          <SectionTitle
            icon="trending"
            title="Продажи карт"
            sub="реально оплаченные сделки, без разового импорта истории 25–28.05"
          />
          <div className="grid lg:grid-cols-2 gap-4">
            {sales.byWeek.length > 0 && <RevenueBars weeks={sales.byWeek} />}
            <div className="bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
              <h3 className="font-medium mb-1 text-sm">Тип карты по банку</h3>
              <p className="text-muted text-xs mb-4">где указан тип</p>
              {sales.byBank.length === 0 ? (
                <p className="text-muted text-sm">Тип карты пока не заполнен.</p>
              ) : (
                <div className="space-y-2.5">
                  {(() => {
                    const max = Math.max(...sales.byBank.map((b) => b.cards), 1);
                    return sales.byBank.map((b) => (
                      <div key={b.bank} className="flex items-center gap-3">
                        <div className="w-28 sm:w-36 text-sm truncate shrink-0">
                          {b.bank}
                        </div>
                        <div className="flex-1 h-6 rounded-md bg-surface-2 overflow-hidden">
                          <div
                            className="h-full rounded-md"
                            style={{
                              width: `${(b.cards / max) * 100}%`,
                              background:
                                "linear-gradient(90deg,#3b82f6,#6366f1)",
                            }}
                          />
                        </div>
                        <div className="tabular-nums text-sm font-semibold w-10 text-right">
                          {b.cards}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ===================== SEO: ТРАФИК И ПОЗИЦИИ ===================== */}
      {data && (
        <section>
          <SectionTitle
            icon="search"
            title="SEO: трафик и позиции"
            sub={`Метрика и Топвизор · ${currRange}`}
            action={
              hasSeo ? (
                <PeriodSwitcher
                  current={days}
                  group={granularity}
                  engine={searchEngine}
                  suffix={seoSuffix}
                />
              ) : undefined
            }
          />

          {!hasSeo ? (
            <div className="bg-surface border border-border rounded-2xl p-8 text-center">
              <div className="font-medium mb-1">SEO-данные ещё не загружены</div>
              <p className="text-muted text-sm">
                Запусти <code>npm run import:metrika</code> и{" "}
                <code>npm run import:topvisor</code>, либо добавь сайты и проекты
                в админке.
              </p>
            </div>
          ) : (
            <>
              {/* Сводные карточки */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
              <section className="bg-surface border border-border rounded-2xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Icon name="trending" className="w-5 h-5 text-accent" />
                    Трафик по сайтам
                  </h3>
                  <GroupSwitcher
                    current={granularity}
                    period={days}
                    engine={searchEngine}
                    suffix={seoSuffix}
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
              {data.sites.length > 0 && (
                <section className="bg-surface border border-border rounded-2xl p-5 mb-6 overflow-x-auto">
                  <h3 className="font-medium mb-4 flex items-center gap-2">
                    <Icon name="globe" className="w-5 h-5 text-accent" />
                    Трафик по Метрике
                  </h3>
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
                              {s.prevVisits > 0
                                ? formatNumber(s.prevVisits)
                                : "—"}
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
                </section>
              )}

              {/* График видимости */}
              <section className="bg-surface border border-border rounded-2xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Icon name="search" className="w-5 h-5 text-accent" />
                    Видимость в ТОП-10 по проектам
                  </h3>
                  <EngineSwitcher
                    current={searchEngine}
                    period={days}
                    group={granularity}
                    suffix={seoSuffix}
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
              {data.projects.length > 0 && (
                <section className="bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Icon name="target" className="w-5 h-5 text-accent" />
                      Проекты (видимость) · {searchEngine}
                    </h3>
                    <EngineSwitcher
                      current={searchEngine}
                      period={days}
                      group={granularity}
                    />
                  </div>
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
                        <th className="py-2 px-4 font-medium text-right">
                          ТОП-10
                        </th>
                        <th className="py-2 px-4 font-medium text-right">
                          ТОП-50
                        </th>
                        <th className="py-2 pl-4 font-medium text-right">
                          Динамика
                        </th>
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
                </section>
              )}
            </>
          )}
        </section>
      )}

      <footer className="text-center text-muted text-xs mt-12">
        Дашборд EasyPay · воронка и продажи — импорт из CRM · трафик и позиции —
        Метрика / Топвизор
      </footer>
    </main>
  );
}
