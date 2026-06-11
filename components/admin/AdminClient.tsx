"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

/* ============================================================
   Типы
   ============================================================ */
type TrafficLatest = {
  date: string;
  visits: number;
  visitors: number;
  bounceRate: number;
};

type Site = {
  id: string;
  name: string;
  domain: string;
  metrikaCounter: string | null;
  color: string;
  traffic?: TrafficLatest[];
  _count?: { traffic: number; projects: number };
};

type VisLatest = {
  date: string;
  visibility: number;
  top10: number;
  top3: number;
  avgPosition: number;
  searchEngine: string;
};

type Project = {
  id: string;
  name: string;
  topvisorId: string | null;
  searchEngine: string;
  region: string | null;
  color: string;
  siteId: string | null;
  site?: { id: string; name: string } | null;
  visibility?: VisLatest[];
  _count?: { visibility: number };
};

/* ============================================================
   Иконки (inline SVG, наследуют цвет через currentColor)
   ============================================================ */
type IconName =
  | "globe"
  | "target"
  | "trending"
  | "search"
  | "refresh"
  | "plus"
  | "trash"
  | "sliders"
  | "info"
  | "back"
  | "logout"
  | "spark"
  | "grid"
  | "check"
  | "warn"
  | "pencil"
  | "link";

function Icon({ name, className = "w-5 h-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.6-4-9s1.5-6.6 4-9z" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.4" />
      </>
    ),
    trending: (
      <>
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="15 7 21 7 21 13" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.6-3.6" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v5h-5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 7h11M19 7h1M4 17h1M9 17h11" />
        <circle cx="17" cy="7" r="2" />
        <circle cx="7" cy="17" r="2" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 7.5h.01" />
      </>
    ),
    back: <path d="M19 12H5M12 19l-7-7 7-7" />,
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5M21 12H9" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
        <path d="M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    check: <path d="M5 12.5l4.5 4.5L19 7" />,
    warn: (
      <>
        <path d="M12 3l9 16H3z" />
        <path d="M12 10v4M12 17.5h.01" />
      </>
    ),
    pencil: (
      <>
        <path d="M4 20h4l10-10-4-4L4 16z" />
        <path d="M13.5 6.5l4 4" />
      </>
    ),
    link: (
      <>
        <path d="M9 15l6-6" />
        <path d="M11 7l1-1a4 4 0 0 1 6 6l-1 1" />
        <path d="M13 17l-1 1a4 4 0 0 1-6-6l1-1" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

/* ============================================================
   Утилиты
   ============================================================ */
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

async function api(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ошибка");
  return data;
}

// Сколько дней прошло с даты (по календарным суткам). null — даты нет.
function daysSince(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const a = new Date().setHours(0, 0, 0, 0);
  const b = new Date(d).setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((a - b) / 86400000));
}

type Tone = "green" | "yellow" | "red";
function freshness(days: number | null): { label: string; tone: Tone } {
  if (days === null) return { label: "нет данных", tone: "red" };
  if (days === 0) return { label: "сегодня", tone: "green" };
  if (days === 1) return { label: "вчера", tone: "green" };
  if (days <= 6) return { label: `${days} дн. назад`, tone: "yellow" };
  return { label: `${days} дн. назад`, tone: "red" };
}

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-positive/15 text-positive",
  yellow: "bg-amber-500/15 text-amber-500",
  red: "bg-negative/15 text-negative",
};
const DOT_CLASS: Record<Tone, string> = {
  green: "bg-positive",
  yellow: "bg-amber-500",
  red: "bg-negative",
};

/* ============================================================
   Главный компонент
   ============================================================ */
type View = "overview" | "manage";

export function AdminClient({ userName }: { userName: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("overview");
  const [sites, setSites] = useState<Site[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState<"" | "metrika" | "topvisor" | "all">("");
  const [importMsg, setImportMsg] = useState("");

  async function importMetrika(days: number, silent = false) {
    if (!silent) setImporting("metrika");
    setError("");
    if (!silent) setImportMsg("");
    try {
      const res = await api("/api/import/metrika", "POST", { days });
      setImportMsg(
        `Метрика: обновлено ${res.okCount}/${res.sites} сайтов, ${res.totalRows} записей за ${days} дн.`
      );
      router.refresh();
      return true;
    } catch (e) {
      setError("Импорт из Метрики: " + (e as Error).message);
      return false;
    } finally {
      if (!silent) setImporting("");
    }
  }

  async function importTopvisor(days: number, silent = false) {
    if (!silent) setImporting("topvisor");
    setError("");
    if (!silent) setImportMsg("");
    try {
      const res = await api("/api/import/topvisor", "POST", { days });
      setImportMsg(
        `Топвизор: ${res.imported} проверок (${(res.engines || []).join(", ")}) за ${days} дн.`
      );
      router.refresh();
      return true;
    } catch (e) {
      setError("Импорт из Топвизора: " + (e as Error).message);
      return false;
    } finally {
      if (!silent) setImporting("");
    }
  }

  async function importAll(days: number) {
    setImporting("all");
    setError("");
    setImportMsg("");
    const m = await importMetrika(days, true);
    const t = await importTopvisor(days, true);
    if (m && t) setImportMsg(`Обновлено: трафик (Метрика) и позиции (Топвизор) за ${days} дн.`);
    setImporting("");
  }

  const loadAll = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api("/api/sites"),
        api("/api/projects"),
      ]);
      setSites(s);
      setProjects(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function logout() {
    await api("/api/auth/logout", "POST");
    router.push("/");
    router.refresh();
  }

  const busy = importing !== "";

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* ---------- Шапка ---------- */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent/15 text-accent">
            <Icon name="sliders" />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Админ-панель</h1>
            <p className="text-muted text-sm">{userName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg bg-surface border border-border hover:border-accent transition"
          >
            <Icon name="back" className="w-4 h-4" />К дашборду
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-lg bg-surface border border-border hover:border-negative transition"
          >
            <Icon name="logout" className="w-4 h-4" />
            Выйти
          </button>
        </div>
      </header>

      {/* ---------- Переключатель «Обзор / Управление» ---------- */}
      <div className="inline-flex p-1 mb-6 rounded-xl bg-surface border border-border">
        <ViewTab
          active={view === "overview"}
          onClick={() => setView("overview")}
          icon="grid"
          label="Обзор"
        />
        <ViewTab
          active={view === "manage"}
          onClick={() => setView("manage")}
          icon="sliders"
          label="Управление"
        />
      </div>

      {/* ---------- Общие баннеры ---------- */}
      {error && (
        <div className="mb-4 flex items-start gap-2 text-sm text-negative bg-negative/10 border border-negative/30 rounded-lg px-3 py-2">
          <Icon name="warn" className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {importMsg && (
        <div className="mb-4 flex items-start gap-2 text-sm text-positive bg-positive/10 border border-positive/30 rounded-lg px-3 py-2">
          <Icon name="check" className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{importMsg}</span>
        </div>
      )}

      {view === "overview" ? (
        <OverviewView
          sites={sites}
          projects={projects}
          importing={importing}
          busy={busy}
          onImportAll={() => importAll(180)}
          onImportMetrika={() => importMetrika(180)}
          onImportTopvisor={() => importTopvisor(180)}
          goManage={() => setView("manage")}
        />
      ) : (
        <ManageView
          sites={sites}
          projects={projects}
          reload={loadAll}
          onError={setError}
        />
      )}
    </main>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition ${
        active
          ? "bg-accent text-white"
          : "text-muted hover:text-foreground"
      }`}
    >
      <Icon name={icon} className="w-4 h-4" />
      {label}
    </button>
  );
}

/* ============================================================
   ОБЗОР
   ============================================================ */
function OverviewView({
  sites,
  projects,
  importing,
  busy,
  onImportAll,
  onImportMetrika,
  onImportTopvisor,
  goManage,
}: {
  sites: Site[];
  projects: Project[];
  importing: "" | "metrika" | "topvisor" | "all";
  busy: boolean;
  onImportAll: () => void;
  onImportMetrika: () => void;
  onImportTopvisor: () => void;
  goManage: () => void;
}) {
  const projectsBySite = new Map<string, Project[]>();
  const orphans: Project[] = [];
  for (const p of projects) {
    if (p.siteId) {
      const arr = projectsBySite.get(p.siteId) || [];
      arr.push(p);
      projectsBySite.set(p.siteId, arr);
    } else {
      orphans.push(p);
    }
  }

  return (
    <div className="space-y-6">
      {/* Обновление данных */}
      <section className="bg-surface border border-border rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Icon name="refresh" className="w-5 h-5 text-accent" />
              Обновить данные
            </h2>
            <p className="text-muted text-sm mt-0.5">
              Тянет свежие цифры из Яндекс.Метрики (трафик) и Топвизора (позиции)
              за последние 180 дней.
            </p>
          </div>
          <button
            onClick={onImportAll}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-accent hover:bg-accent/90 text-white disabled:opacity-60 transition"
          >
            <Icon
              name="refresh"
              className={`w-4 h-4 ${importing === "all" ? "animate-spin" : ""}`}
            />
            {importing === "all" ? "Обновляю…" : "Обновить всё"}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <SourceButton
            icon="trending"
            title="Трафик · Метрика"
            loading={importing === "metrika"}
            disabled={busy}
            onClick={onImportMetrika}
          />
          <SourceButton
            icon="search"
            title="Позиции · Топвизор"
            loading={importing === "topvisor"}
            disabled={busy}
            onClick={onImportTopvisor}
          />
        </div>
      </section>

      {/* Сайты и позиции */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">
            Сайты и позиции{" "}
            <span className="text-muted font-normal">({sites.length})</span>
          </h2>
          <button
            onClick={goManage}
            className="flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            <Icon name="plus" className="w-4 h-4" />
            Добавить / изменить
          </button>
        </div>

        {sites.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl">
            <EmptyState
              icon="globe"
              text="Пока нет сайтов. Перейдите в «Управление», чтобы добавить первый."
            />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {sites.map((s) => (
              <SiteOverviewCard
                key={s.id}
                site={s}
                projects={projectsBySite.get(s.id) || []}
              />
            ))}
          </div>
        )}
      </section>

      {/* Проекты без привязки к сайту */}
      {orphans.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold">Проекты без сайта</h2>
            <InfoBadge text="Свяжите их с сайтом в «Управление → Проекты»" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {orphans.map((p) => (
              <div
                key={p.id}
                className="bg-surface border border-border rounded-2xl p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: p.color }}
                  />
                  <span className="font-medium">{p.name}</span>
                </div>
                <ProjectStat project={p} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SourceButton({
  icon,
  title,
  loading,
  disabled,
  onClick,
}: {
  icon: IconName;
  title: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-surface-2 border border-border hover:border-accent disabled:opacity-60 transition text-left"
    >
      <span className="grid place-items-center w-9 h-9 rounded-lg bg-surface text-accent shrink-0">
        <Icon name={loading ? "refresh" : icon} className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">
          {loading ? "Обновляю…" : "Нажмите, чтобы обновить"}
        </span>
      </span>
    </button>
  );
}

function SiteOverviewCard({
  site,
  projects,
}: {
  site: Site;
  projects: Project[];
}) {
  const traffic = site.traffic?.[0];
  const trafficDays = daysSince(traffic?.date);
  const tf = freshness(trafficDays);

  // самая свежая дата по позициям среди проектов сайта
  const visDates = projects
    .map((p) => p.visibility?.[0]?.date)
    .filter(Boolean) as string[];
  const bestVisDate = visDates.sort().slice(-1)[0];
  const visDays = daysSince(bestVisDate);

  // общий статус карточки — худший из двух
  const worst: Tone =
    [tf.tone, freshness(visDays).tone].includes("red")
      ? "red"
      : [tf.tone, freshness(visDays).tone].includes("yellow")
        ? "yellow"
        : "green";

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: site.color }}
          />
          <div>
            <div className="font-semibold leading-tight">{site.name}</div>
            <div className="text-muted text-xs">{site.domain}</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${TONE_CLASS[worst]}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLASS[worst]}`} />
          {worst === "green" ? "свежие" : worst === "yellow" ? "несвежие" : "устарели"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Трафик */}
        <div className="rounded-xl bg-surface-2/60 border border-border p-3">
          <div className="flex items-center gap-1.5 text-muted text-xs mb-1.5">
            <Icon name="trending" className="w-3.5 h-3.5" />
            Трафик
          </div>
          {traffic ? (
            <>
              <div className="text-lg font-semibold leading-none">
                {fmt(traffic.visits)}
              </div>
              <div className="text-muted text-xs">визитов / сутки</div>
              <FreshLine days={trafficDays} />
            </>
          ) : (
            <div className="text-muted text-sm py-1">нет данных</div>
          )}
        </div>

        {/* Позиции */}
        <div className="rounded-xl bg-surface-2/60 border border-border p-3">
          <div className="flex items-center gap-1.5 text-muted text-xs mb-1.5">
            <Icon name="search" className="w-3.5 h-3.5" />
            Позиции
          </div>
          {projects.length === 0 ? (
            <div className="text-muted text-sm py-1">проект не привязан</div>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <ProjectStat key={p.id} project={p} compact />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectStat({
  project,
  compact,
}: {
  project: Project;
  compact?: boolean;
}) {
  const v = project.visibility?.[0];
  const days = daysSince(v?.date);
  if (!v) {
    return <div className="text-muted text-sm">нет данных позиций</div>;
  }
  return (
    <div>
      {!compact && (
        <div className="text-sm font-medium mb-0.5">{project.name}</div>
      )}
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold leading-none">
          {v.visibility}%
        </span>
        <span className="text-muted text-xs">видимость</span>
      </div>
      <div className="text-muted text-xs mt-0.5">
        ТОП-10: <span className="text-foreground">{v.top10}</span> · ср.поз:{" "}
        <span className="text-foreground">{v.avgPosition}</span>
      </div>
      <FreshLine days={days} />
    </div>
  );
}

function FreshLine({ days }: { days: number | null }) {
  const f = freshness(days);
  return (
    <div className="flex items-center gap-1.5 mt-1.5 text-xs">
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLASS[f.tone]}`} />
      <span className="text-muted">обновлено {f.label}</span>
    </div>
  );
}

function InfoBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Icon name="info" className="w-3.5 h-3.5" />
      {text}
    </span>
  );
}

/* ============================================================
   УПРАВЛЕНИЕ (настройка + ручной ввод)
   ============================================================ */
const TAB_GROUPS = [
  {
    title: "Настройка",
    hint: "Что отслеживаем",
    tabs: [
      { key: "sites", label: "Сайты", sub: "Трафик · Метрика", icon: "globe" as IconName },
      { key: "projects", label: "Проекты", sub: "Позиции · Топвизор", icon: "target" as IconName },
    ],
  },
  {
    title: "Ручной ввод данных",
    hint: "Если не используете авто-импорт",
    tabs: [
      { key: "traffic", label: "Трафик по дням", sub: "Визиты, посетители", icon: "trending" as IconName },
      { key: "visibility", label: "Видимость по дням", sub: "Позиции, ТОП-3/10/50", icon: "search" as IconName },
    ],
  },
] as const;

type TabKey = "sites" | "projects" | "traffic" | "visibility";

function ManageView({
  sites,
  projects,
  reload,
  onError,
}: {
  sites: Site[];
  projects: Project[];
  reload: () => void;
  onError: (s: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("sites");

  return (
    <div>
      {/* Как устроен дашборд */}
      <section className="mb-6 bg-surface border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="info" className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Как устроен дашборд</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <ModelCard
            icon="globe"
            term="Сайт"
            color="bg-accent/15 text-accent"
            text="Ваш сайт. С него собирается ТРАФИК (сколько людей зашло) из Яндекс.Метрики: визиты, посетители, отказы."
          />
          <ModelCard
            icon="target"
            term="Проект"
            color="bg-positive/15 text-positive"
            text="Отслеживание ПОЗИЦИЙ сайта в поиске через Топвизор: видимость и места в ТОП-3/10/50. У одного сайта может быть несколько проектов — например, Яндекс и Google."
          />
        </div>
      </section>

      {/* Навигация по вкладкам */}
      <nav className="mb-6 flex flex-wrap gap-x-8 gap-y-4">
        {TAB_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="flex items-baseline gap-2 mb-2 px-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {group.title}
              </span>
              <span className="text-xs text-muted/70">· {group.hint}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.tabs.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key as TabKey)}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left transition ${
                      active
                        ? "bg-accent text-white border-accent shadow-sm"
                        : "bg-surface border-border text-foreground hover:border-accent"
                    }`}
                  >
                    <Icon
                      name={t.icon}
                      className={`w-5 h-5 shrink-0 ${active ? "text-white" : "text-accent"}`}
                    />
                    <span className="leading-tight">
                      <span className="block text-sm font-medium">{t.label}</span>
                      <span className={`block text-xs ${active ? "text-white/80" : "text-muted"}`}>
                        {t.sub}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {tab === "sites" && (
        <SitesTab sites={sites} reload={reload} onError={onError} />
      )}
      {tab === "projects" && (
        <ProjectsTab
          projects={projects}
          sites={sites}
          reload={reload}
          onError={onError}
        />
      )}
      {tab === "traffic" && <TrafficTab sites={sites} onError={onError} />}
      {tab === "visibility" && (
        <VisibilityTab projects={projects} onError={onError} />
      )}
    </div>
  );
}

function ModelCard({
  icon,
  term,
  text,
  color,
}: {
  icon: IconName;
  term: string;
  text: string;
  color: string;
}) {
  return (
    <div className="flex gap-3 bg-surface-2/60 border border-border rounded-xl p-3.5">
      <span className={`grid place-items-center w-10 h-10 rounded-lg shrink-0 ${color}`}>
        <Icon name={icon} className="w-5 h-5" />
      </span>
      <div>
        <div className="font-medium mb-0.5">{term}</div>
        <p className="text-muted text-sm leading-snug">{text}</p>
      </div>
    </div>
  );
}

function TabIntro({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <span className="grid place-items-center w-10 h-10 rounded-xl bg-accent/15 text-accent shrink-0">
        <Icon name={icon} />
      </span>
      <div>
        <h2 className="font-semibold leading-tight">{title}</h2>
        <p className="text-muted text-sm mt-0.5 max-w-2xl">{children}</p>
      </div>
    </div>
  );
}

/* ============================================================
   Вкладка: Сайты
   ============================================================ */
function SitesTab({
  sites,
  reload,
  onError,
}: {
  sites: Site[];
  reload: () => void;
  onError: (s: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    domain: "",
    metrikaCounter: "",
    color: "#3b82f6",
  });
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      await api("/api/sites", "POST", form);
      setForm({ name: "", domain: "", metrikaCounter: "", color: "#3b82f6" });
      reload();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить сайт со всеми данными трафика?")) return;
    try {
      await api(`/api/sites/${id}`, "DELETE");
      reload();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div>
      <TabIntro icon="globe" title="Сайты — источники трафика">
        Это ваши сайты, по которым в дашборде показывается посещаемость из
        Яндекс.Метрики. Укажите домен и ID счётчика Метрики — тогда трафик можно
        тянуть автоматически кнопкой «Обновить» на вкладке «Обзор».
      </TabIntro>

      <div className="grid lg:grid-cols-3 gap-6">
        <form
          onSubmit={add}
          className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit"
        >
          <h3 className="font-medium flex items-center gap-2">
            <Icon name="plus" className="w-4 h-4 text-accent" />
            Добавить сайт
          </h3>
          <Input
            label="Название"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Например: EasyPay"
            required
          />
          <Input
            label="Домен"
            value={form.domain}
            onChange={(v) => setForm({ ...form, domain: v })}
            placeholder="example.ru"
            hint="Без https:// и www — просто домен."
            required
          />
          <Input
            label="ID счётчика Метрики"
            value={form.metrikaCounter}
            onChange={(v) => setForm({ ...form, metrikaCounter: v })}
            placeholder="12345678"
            hint="Необязательно. Нужен для авто-импорта трафика."
          />
          <ColorField
            value={form.color}
            onChange={(v) => setForm({ ...form, color: v })}
          />
          <SubmitButton saving={saving} label="Добавить сайт" />
        </form>

        <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
          <h3 className="font-medium mb-4">Добавленные сайты ({sites.length})</h3>
          {sites.length === 0 ? (
            <EmptyState icon="globe" text="Пока нет сайтов. Добавьте первый в форме слева." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="py-2 pr-4 font-medium">Сайт</th>
                  <th className="py-2 px-4 font-medium">ID Метрики</th>
                  <th className="py-2 px-4 font-medium text-right">Записей</th>
                  <th className="py-2 pl-4 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: s.color }}
                        />
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-muted text-xs">{s.domain}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted">{s.metrikaCounter || "—"}</td>
                    <td className="py-3 px-4 text-right text-muted">
                      {s._count?.traffic ?? 0}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <DeleteButton onClick={() => remove(s.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Вкладка: Проекты
   ============================================================ */
function ProjectsTab({
  projects,
  sites,
  reload,
  onError,
}: {
  projects: Project[];
  sites: Site[];
  reload: () => void;
  onError: (s: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    topvisorId: "",
    searchEngine: "Яндекс",
    region: "",
    color: "#10b981",
    siteId: "",
  });
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      await api("/api/projects", "POST", form);
      setForm({
        name: "",
        topvisorId: "",
        searchEngine: "Яндекс",
        region: "",
        color: "#10b981",
        siteId: "",
      });
      reload();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить проект со всеми данными видимости?")) return;
    try {
      await api(`/api/projects/${id}`, "DELETE");
      reload();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div>
      <TabIntro icon="target" title="Проекты — отслеживание позиций">
        Проект — это отслеживание позиций сайта в поиске через Топвизор:
        видимость, средняя позиция и запросы в ТОП-3/10/50. У одного сайта может
        быть несколько проектов (например, отдельно Яндекс и Google). Свяжите
        проект с сайтом, чтобы данные легли в нужную карточку «Обзора».
      </TabIntro>

      <div className="grid lg:grid-cols-3 gap-6">
        <form
          onSubmit={add}
          className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit"
        >
          <h3 className="font-medium flex items-center gap-2">
            <Icon name="plus" className="w-4 h-4 text-accent" />
            Добавить проект
          </h3>
          <Input
            label="Название"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Например: visamaster.cards"
            required
          />
          <Input
            label="ID проекта в Топвизоре"
            value={form.topvisorId}
            onChange={(v) => setForm({ ...form, topvisorId: v })}
            placeholder="27375645"
            hint="Необязательно. Нужен для авто-импорта позиций."
          />
          <SelectField
            label="Поисковик"
            value={form.searchEngine}
            onChange={(v) => setForm({ ...form, searchEngine: v })}
            options={[
              { value: "Яндекс", label: "Яндекс" },
              { value: "Google", label: "Google" },
            ]}
          />
          <Input
            label="Регион"
            value={form.region}
            onChange={(v) => setForm({ ...form, region: v })}
            placeholder="Москва"
            hint="Необязательно."
          />
          <SelectField
            label="Связать с сайтом"
            value={form.siteId}
            onChange={(v) => setForm({ ...form, siteId: v })}
            hint="Необязательно, но желательно — связывает позиции с сайтом."
            options={[
              { value: "", label: "— не выбрано —" },
              ...sites.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <ColorField
            value={form.color}
            onChange={(v) => setForm({ ...form, color: v })}
          />
          <SubmitButton saving={saving} label="Добавить проект" />
        </form>

        <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
          <h3 className="font-medium mb-4">Добавленные проекты ({projects.length})</h3>
          {projects.length === 0 ? (
            <EmptyState icon="target" text="Пока нет проектов. Добавьте первый в форме слева." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="py-2 pr-4 font-medium">Проект</th>
                  <th className="py-2 px-4 font-medium">ПС / Регион</th>
                  <th className="py-2 px-4 font-medium">Сайт</th>
                  <th className="py-2 px-4 font-medium text-right">Записей</th>
                  <th className="py-2 pl-4 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: p.color }}
                        />
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted">
                      {p.searchEngine}
                      {p.region ? ` · ${p.region}` : ""}
                    </td>
                    <td className="py-3 px-4 text-muted">{p.site?.name || "—"}</td>
                    <td className="py-3 px-4 text-right text-muted">
                      {p._count?.visibility ?? 0}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <DeleteButton onClick={() => remove(p.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Вкладка: Данные трафика
   ============================================================ */
type TrafficRow = {
  id: string;
  date: string;
  visits: number;
  visitors: number;
  pageviews: number;
  bounceRate: number;
  avgDuration: number;
};

function TrafficTab({
  sites,
  onError,
}: {
  sites: Site[];
  onError: (s: string) => void;
}) {
  const [siteId, setSiteId] = useState("");
  const [rows, setRows] = useState<TrafficRow[]>([]);
  const [form, setForm] = useState({
    date: today(),
    visits: "",
    visitors: "",
    pageviews: "",
    bounceRate: "",
    avgDuration: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        setRows(await api(`/api/traffic?siteId=${id}`));
      } catch (e) {
        onError((e as Error).message);
      }
    },
    [onError]
  );

  useEffect(() => {
    if (!siteId && sites.length) setSiteId(sites[0].id);
  }, [sites, siteId]);

  useEffect(() => {
    if (siteId) load(siteId);
  }, [siteId, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!siteId) return;
    setSaving(true);
    onError("");
    try {
      await api("/api/traffic", "POST", { siteId, ...form });
      setForm({
        date: today(),
        visits: "",
        visitors: "",
        pageviews: "",
        bounceRate: "",
        avgDuration: "",
      });
      load(siteId);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/traffic/${id}`, "DELETE");
      load(siteId);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div>
      <TabIntro icon="trending" title="Трафик по дням — ручной ввод">
        Здесь можно добавить или поправить трафик за конкретный день вручную — на
        случай, если авто-импорт из Метрики недоступен. Обычно эти данные
        приходят сами кнопкой «Обновить» на вкладке «Обзор».
      </TabIntro>

      {sites.length === 0 ? (
        <EmptyState icon="globe" text="Сначала добавьте хотя бы один сайт на вкладке «Сайты»." />
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <form
            onSubmit={save}
            className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit"
          >
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="plus" className="w-4 h-4 text-accent" />
              Внести трафик за день
            </h3>
            <SelectField
              label="Сайт"
              value={siteId}
              onChange={setSiteId}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Input
              label="Дата"
              type="date"
              value={form.date}
              onChange={(v) => setForm({ ...form, date: v })}
              required
            />
            <Input label="Визиты" type="number" value={form.visits} onChange={(v) => setForm({ ...form, visits: v })} />
            <Input label="Посетители" type="number" value={form.visitors} onChange={(v) => setForm({ ...form, visitors: v })} />
            <Input label="Просмотры" type="number" value={form.pageviews} onChange={(v) => setForm({ ...form, pageviews: v })} />
            <Input label="Отказы, %" type="number" value={form.bounceRate} onChange={(v) => setForm({ ...form, bounceRate: v })} />
            <Input label="Ср. время, сек" type="number" value={form.avgDuration} onChange={(v) => setForm({ ...form, avgDuration: v })} />
            <SubmitButton saving={saving} label="Сохранить" />
          </form>

          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
            <h3 className="font-medium mb-4">Последние записи</h3>
            {rows.length === 0 ? (
              <EmptyState icon="trending" text="Нет данных по этому сайту." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-border">
                    <th className="py-2 pr-4 font-medium">Дата</th>
                    <th className="py-2 px-4 font-medium text-right">Визиты</th>
                    <th className="py-2 px-4 font-medium text-right">Посетители</th>
                    <th className="py-2 px-4 font-medium text-right">Просмотры</th>
                    <th className="py-2 px-4 font-medium text-right">Отказы</th>
                    <th className="py-2 pl-4 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4">{r.date.slice(0, 10)}</td>
                      <td className="py-2 px-4 text-right">{r.visits}</td>
                      <td className="py-2 px-4 text-right">{r.visitors}</td>
                      <td className="py-2 px-4 text-right">{r.pageviews}</td>
                      <td className="py-2 px-4 text-right">{r.bounceRate}%</td>
                      <td className="py-2 pl-4 text-right">
                        <DeleteButton onClick={() => remove(r.id)} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Вкладка: Данные видимости
   ============================================================ */
type VisRow = {
  id: string;
  date: string;
  visibility: number;
  avgPosition: number;
  top3: number;
  top10: number;
  top50: number;
  queriesTotal: number;
};

function VisibilityTab({
  projects,
  onError,
}: {
  projects: Project[];
  onError: (s: string) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [rows, setRows] = useState<VisRow[]>([]);
  const [form, setForm] = useState({
    date: today(),
    visibility: "",
    avgPosition: "",
    top3: "",
    top10: "",
    top50: "",
    queriesTotal: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        setRows(await api(`/api/visibility?projectId=${id}`));
      } catch (e) {
        onError((e as Error).message);
      }
    },
    [onError]
  );

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects, projectId]);

  useEffect(() => {
    if (projectId) load(projectId);
  }, [projectId, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setSaving(true);
    onError("");
    try {
      await api("/api/visibility", "POST", { projectId, ...form });
      setForm({
        date: today(),
        visibility: "",
        avgPosition: "",
        top3: "",
        top10: "",
        top50: "",
        queriesTotal: "",
      });
      load(projectId);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/visibility/${id}`, "DELETE");
      load(projectId);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div>
      <TabIntro icon="search" title="Видимость по дням — ручной ввод">
        Здесь можно внести видимость и позиции за конкретный день вручную — если
        не используете авто-импорт из Топвизора. Обычно эти данные приходят сами
        кнопкой «Обновить» на вкладке «Обзор».
      </TabIntro>

      {projects.length === 0 ? (
        <EmptyState icon="target" text="Сначала добавьте хотя бы один проект на вкладке «Проекты»." />
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <form
            onSubmit={save}
            className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit"
          >
            <h3 className="font-medium flex items-center gap-2">
              <Icon name="plus" className="w-4 h-4 text-accent" />
              Внести видимость за день
            </h3>
            <SelectField
              label="Проект"
              value={projectId}
              onChange={setProjectId}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Input label="Дата" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
            <Input label="Видимость, %" type="number" value={form.visibility} onChange={(v) => setForm({ ...form, visibility: v })} />
            <Input label="Средняя позиция" type="number" value={form.avgPosition} onChange={(v) => setForm({ ...form, avgPosition: v })} />
            <Input label="Запросов в ТОП-3" type="number" value={form.top3} onChange={(v) => setForm({ ...form, top3: v })} />
            <Input label="Запросов в ТОП-10" type="number" value={form.top10} onChange={(v) => setForm({ ...form, top10: v })} />
            <Input label="Запросов в ТОП-50" type="number" value={form.top50} onChange={(v) => setForm({ ...form, top50: v })} />
            <Input label="Всего запросов" type="number" value={form.queriesTotal} onChange={(v) => setForm({ ...form, queriesTotal: v })} />
            <SubmitButton saving={saving} label="Сохранить" />
          </form>

          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
            <h3 className="font-medium mb-4">Последние записи</h3>
            {rows.length === 0 ? (
              <EmptyState icon="search" text="Нет данных по этому проекту." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left border-b border-border">
                    <th className="py-2 pr-4 font-medium">Дата</th>
                    <th className="py-2 px-4 font-medium text-right">Вид.</th>
                    <th className="py-2 px-4 font-medium text-right">Ср.поз.</th>
                    <th className="py-2 px-4 font-medium text-right">ТОП-3</th>
                    <th className="py-2 px-4 font-medium text-right">ТОП-10</th>
                    <th className="py-2 px-4 font-medium text-right">ТОП-50</th>
                    <th className="py-2 pl-4 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4">{r.date.slice(0, 10)}</td>
                      <td className="py-2 px-4 text-right">{r.visibility}%</td>
                      <td className="py-2 px-4 text-right">{r.avgPosition}</td>
                      <td className="py-2 px-4 text-right">{r.top3}</td>
                      <td className="py-2 px-4 text-right">{r.top10}</td>
                      <td className="py-2 px-4 text-right">{r.top50}</td>
                      <td className="py-2 pl-4 text-right">
                        <DeleteButton onClick={() => remove(r.id)} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Переиспользуемые поля и кнопки
   ============================================================ */
function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-muted mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        step={type === "number" ? "any" : undefined}
        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 outline-none focus:border-accent transition"
      />
      {hint && <p className="text-xs text-muted/80 mt-1">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-muted mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-muted/80 mt-1">{hint}</p>}
    </div>
  );
}

function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-muted mb-1">Цвет на графике</label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 bg-surface-2 border border-border rounded-lg cursor-pointer"
      />
    </div>
  );
}

function SubmitButton({ saving, label }: { saving: boolean; label: string }) {
  return (
    <button
      disabled={saving}
      className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-60 text-white rounded-lg py-2.5 transition"
    >
      {!saving && <Icon name="plus" className="w-4 h-4" />}
      {saving ? "Сохранение…" : label}
    </button>
  );
}

function DeleteButton({
  onClick,
  compact,
}: {
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title="Удалить"
      className="inline-flex items-center gap-1 text-muted hover:text-negative text-xs transition"
    >
      <Icon name="trash" className="w-4 h-4" />
      {!compact && <span>Удалить</span>}
    </button>
  );
}

function EmptyState({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 text-muted">
      <span className="grid place-items-center w-12 h-12 rounded-xl bg-surface-2 mb-3">
        <Icon name={icon} className="w-6 h-6" />
      </span>
      <p className="text-sm max-w-xs">{text}</p>
    </div>
  );
}
