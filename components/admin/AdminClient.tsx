"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

type Site = {
  id: string;
  name: string;
  domain: string;
  metrikaCounter: string | null;
  color: string;
  _count?: { traffic: number; projects: number };
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
  _count?: { visibility: number };
};

const TABS = [
  { key: "sites", label: "Сайты" },
  { key: "projects", label: "Проекты" },
  { key: "traffic", label: "Данные: трафик" },
  { key: "visibility", label: "Данные: видимость" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const today = () => new Date().toISOString().slice(0, 10);

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

export function AdminClient({ userName }: { userName: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("sites");
  const [sites, setSites] = useState<Site[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  async function importMetrika(days: number) {
    setImporting(true);
    setImportMsg("");
    setError("");
    try {
      const res = await api("/api/import/metrika", "POST", { days });
      setImportMsg(
        `Метрика: обновлено ${res.okCount}/${res.sites} сайтов, ${res.totalRows} записей за ${days} дн.`
      );
      router.refresh();
    } catch (e) {
      setError("Импорт из Метрики: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function importTopvisor(days: number) {
    setImporting(true);
    setImportMsg("");
    setError("");
    try {
      const res = await api("/api/import/topvisor", "POST", { days });
      setImportMsg(
        `Топвизор: ${res.imported} проверок (${(res.engines || []).join(", ")}) за ${days} дн.`
      );
      router.refresh();
    } catch (e) {
      setError("Импорт из Топвизора: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
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

  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Админ-панель</h1>
          <p className="text-muted text-sm">{userName}</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/"
            className="px-4 py-2 text-sm rounded-lg bg-surface border border-border hover:border-accent transition"
          >
            ← К дашборду
          </Link>
          <button
            onClick={logout}
            className="px-4 py-2 text-sm rounded-lg bg-surface border border-border hover:border-negative transition"
          >
            Выйти
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 text-sm text-negative bg-negative/10 border border-negative/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Импорт данных */}
      <div className="mb-6 grid md:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-4">
          <div className="font-medium">Трафик из Яндекс.Метрики</div>
          <div className="text-muted text-sm mb-3">
            Визиты, посетители, отказы (только SEO/органика)
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => importMetrika(90)}
              disabled={importing}
              className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border hover:border-accent disabled:opacity-60 transition"
            >
              90 дней
            </button>
            <button
              onClick={() => importMetrika(180)}
              disabled={importing}
              className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent/90 text-white disabled:opacity-60 transition"
            >
              {importing ? "Импорт…" : "Обновить (180 дн.)"}
            </button>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-4">
          <div className="font-medium">Видимость из Топвизора</div>
          <div className="text-muted text-sm mb-3">
            Видимость, средняя позиция, ТОП-3/10/50 по проектам
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => importTopvisor(90)}
              disabled={importing}
              className="px-3 py-2 text-sm rounded-lg bg-surface-2 border border-border hover:border-accent disabled:opacity-60 transition"
            >
              90 дней
            </button>
            <button
              onClick={() => importTopvisor(180)}
              disabled={importing}
              className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent/90 text-white disabled:opacity-60 transition"
            >
              {importing ? "Импорт…" : "Обновить (180 дн.)"}
            </button>
          </div>
        </div>
      </div>

      {importMsg && (
        <div className="mb-6 text-sm text-positive bg-positive/10 border border-positive/30 rounded-lg px-3 py-2">
          {importMsg}
        </div>
      )}

      {/* Табы */}
      <div className="flex flex-wrap gap-1 bg-surface border border-border rounded-lg p-1 mb-6 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-md transition ${
              tab === t.key
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sites" && (
        <SitesTab sites={sites} reload={loadAll} onError={setError} />
      )}
      {tab === "projects" && (
        <ProjectsTab
          projects={projects}
          sites={sites}
          reload={loadAll}
          onError={setError}
        />
      )}
      {tab === "traffic" && <TrafficTab sites={sites} onError={setError} />}
      {tab === "visibility" && (
        <VisibilityTab projects={projects} onError={setError} />
      )}
    </main>
  );
}

/* ---------------- Вкладка: Сайты ---------------- */
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
    <div className="grid lg:grid-cols-3 gap-6">
      <form
        onSubmit={add}
        className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit"
      >
        <h2 className="font-medium">Добавить сайт</h2>
        <Input
          label="Название"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          required
        />
        <Input
          label="Домен"
          value={form.domain}
          onChange={(v) => setForm({ ...form, domain: v })}
          placeholder="example.ru"
          required
        />
        <Input
          label="ID счётчика Метрики (необязательно)"
          value={form.metrikaCounter}
          onChange={(v) => setForm({ ...form, metrikaCounter: v })}
          placeholder="12345678"
        />
        <div>
          <label className="block text-sm text-muted mb-1">Цвет на графике</label>
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="w-full h-10 bg-surface-2 border border-border rounded-lg cursor-pointer"
          />
        </div>
        <button
          disabled={saving}
          className="w-full bg-accent hover:bg-accent/90 disabled:opacity-60 text-white rounded-lg py-2.5 transition"
        >
          {saving ? "Сохранение…" : "Добавить"}
        </button>
      </form>

      <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
        <h2 className="font-medium mb-4">Сайты ({sites.length})</h2>
        {sites.length === 0 ? (
          <p className="text-muted text-sm">Пока нет сайтов.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-left border-b border-border">
                <th className="py-2 pr-4 font-medium">Сайт</th>
                <th className="py-2 px-4 font-medium">Метрика</th>
                <th className="py-2 px-4 font-medium text-right">Записей</th>
                <th className="py-2 pl-4 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
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
                        <div className="text-muted text-xs">{s.domain}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted">
                    {s.metrikaCounter || "—"}
                  </td>
                  <td className="py-3 px-4 text-right text-muted">
                    {s._count?.traffic ?? 0}
                  </td>
                  <td className="py-3 pl-4 text-right">
                    <button
                      onClick={() => remove(s.id)}
                      className="text-negative hover:underline text-xs"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------- Вкладка: Проекты ---------------- */
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
    <div className="grid lg:grid-cols-3 gap-6">
      <form
        onSubmit={add}
        className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit"
      >
        <h2 className="font-medium">Добавить проект</h2>
        <Input
          label="Название"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          required
        />
        <Input
          label="ID проекта в Топвизоре (необязательно)"
          value={form.topvisorId}
          onChange={(v) => setForm({ ...form, topvisorId: v })}
        />
        <div>
          <label className="block text-sm text-muted mb-1">Поисковик</label>
          <select
            value={form.searchEngine}
            onChange={(e) => setForm({ ...form, searchEngine: e.target.value })}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 outline-none focus:border-accent"
          >
            <option>Яндекс</option>
            <option>Google</option>
          </select>
        </div>
        <Input
          label="Регион (необязательно)"
          value={form.region}
          onChange={(v) => setForm({ ...form, region: v })}
          placeholder="Москва"
        />
        <div>
          <label className="block text-sm text-muted mb-1">
            Связать с сайтом (необязательно)
          </label>
          <select
            value={form.siteId}
            onChange={(e) => setForm({ ...form, siteId: e.target.value })}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 outline-none focus:border-accent"
          >
            <option value="">— не выбрано —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-muted mb-1">Цвет на графике</label>
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="w-full h-10 bg-surface-2 border border-border rounded-lg cursor-pointer"
          />
        </div>
        <button
          disabled={saving}
          className="w-full bg-accent hover:bg-accent/90 disabled:opacity-60 text-white rounded-lg py-2.5 transition"
        >
          {saving ? "Сохранение…" : "Добавить"}
        </button>
      </form>

      <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
        <h2 className="font-medium mb-4">Проекты ({projects.length})</h2>
        {projects.length === 0 ? (
          <p className="text-muted text-sm">Пока нет проектов.</p>
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
                    <button
                      onClick={() => remove(p.id)}
                      className="text-negative hover:underline text-xs"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------- Вкладка: Данные трафика ---------------- */
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

  if (sites.length === 0)
    return (
      <p className="text-muted text-sm">
        Сначала добавь хотя бы один сайт на вкладке «Сайты».
      </p>
    );

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <form
        onSubmit={save}
        className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit"
      >
        <h2 className="font-medium">Внести трафик за день</h2>
        <div>
          <label className="block text-sm text-muted mb-1">Сайт</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 outline-none focus:border-accent"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Дата"
          type="date"
          value={form.date}
          onChange={(v) => setForm({ ...form, date: v })}
          required
        />
        <Input
          label="Визиты"
          type="number"
          value={form.visits}
          onChange={(v) => setForm({ ...form, visits: v })}
        />
        <Input
          label="Посетители"
          type="number"
          value={form.visitors}
          onChange={(v) => setForm({ ...form, visitors: v })}
        />
        <Input
          label="Просмотры"
          type="number"
          value={form.pageviews}
          onChange={(v) => setForm({ ...form, pageviews: v })}
        />
        <Input
          label="Отказы, %"
          type="number"
          value={form.bounceRate}
          onChange={(v) => setForm({ ...form, bounceRate: v })}
        />
        <Input
          label="Ср. время, сек"
          type="number"
          value={form.avgDuration}
          onChange={(v) => setForm({ ...form, avgDuration: v })}
        />
        <button
          disabled={saving}
          className="w-full bg-accent hover:bg-accent/90 disabled:opacity-60 text-white rounded-lg py-2.5 transition"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </form>

      <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
        <h2 className="font-medium mb-4">Последние записи</h2>
        {rows.length === 0 ? (
          <p className="text-muted text-sm">Нет данных по этому сайту.</p>
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
                <tr
                  key={r.id}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-2 pr-4">{r.date.slice(0, 10)}</td>
                  <td className="py-2 px-4 text-right">{r.visits}</td>
                  <td className="py-2 px-4 text-right">{r.visitors}</td>
                  <td className="py-2 px-4 text-right">{r.pageviews}</td>
                  <td className="py-2 px-4 text-right">{r.bounceRate}%</td>
                  <td className="py-2 pl-4 text-right">
                    <button
                      onClick={() => remove(r.id)}
                      className="text-negative hover:underline text-xs"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------- Вкладка: Данные видимости ---------------- */
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

  if (projects.length === 0)
    return (
      <p className="text-muted text-sm">
        Сначала добавь хотя бы один проект на вкладке «Проекты».
      </p>
    );

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <form
        onSubmit={save}
        className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit"
      >
        <h2 className="font-medium">Внести видимость за день</h2>
        <div>
          <label className="block text-sm text-muted mb-1">Проект</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 outline-none focus:border-accent"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Дата"
          type="date"
          value={form.date}
          onChange={(v) => setForm({ ...form, date: v })}
          required
        />
        <Input
          label="Видимость, %"
          type="number"
          value={form.visibility}
          onChange={(v) => setForm({ ...form, visibility: v })}
        />
        <Input
          label="Средняя позиция"
          type="number"
          value={form.avgPosition}
          onChange={(v) => setForm({ ...form, avgPosition: v })}
        />
        <Input
          label="Запросов в ТОП-3"
          type="number"
          value={form.top3}
          onChange={(v) => setForm({ ...form, top3: v })}
        />
        <Input
          label="Запросов в ТОП-10"
          type="number"
          value={form.top10}
          onChange={(v) => setForm({ ...form, top10: v })}
        />
        <Input
          label="Запросов в ТОП-50"
          type="number"
          value={form.top50}
          onChange={(v) => setForm({ ...form, top50: v })}
        />
        <Input
          label="Всего запросов"
          type="number"
          value={form.queriesTotal}
          onChange={(v) => setForm({ ...form, queriesTotal: v })}
        />
        <button
          disabled={saving}
          className="w-full bg-accent hover:bg-accent/90 disabled:opacity-60 text-white rounded-lg py-2.5 transition"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </form>

      <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 overflow-x-auto">
        <h2 className="font-medium mb-4">Последние записи</h2>
        {rows.length === 0 ? (
          <p className="text-muted text-sm">Нет данных по этому проекту.</p>
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
                <tr
                  key={r.id}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-2 pr-4">{r.date.slice(0, 10)}</td>
                  <td className="py-2 px-4 text-right">{r.visibility}%</td>
                  <td className="py-2 px-4 text-right">{r.avgPosition}</td>
                  <td className="py-2 px-4 text-right">{r.top3}</td>
                  <td className="py-2 px-4 text-right">{r.top10}</td>
                  <td className="py-2 px-4 text-right">{r.top50}</td>
                  <td className="py-2 pl-4 text-right">
                    <button
                      onClick={() => remove(r.id)}
                      className="text-negative hover:underline text-xs"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ---------------- Переиспользуемый input ---------------- */
function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
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
    </div>
  );
}
