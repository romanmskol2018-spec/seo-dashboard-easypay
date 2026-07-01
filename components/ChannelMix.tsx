// Каналы привлечения лидов: стэк-бар по неделям + SEO-сплит Google/Яндекс.
// Серверный компонент. Отвечает на вопрос «какой канал приносит лиды».
import type { LeadWeek } from "@/lib/data";
import { formatNumber, formatPct } from "@/lib/format";

type Channel = { key: keyof LeadWeek; label: string; color: string };

const CHANNELS: Channel[] = [
  { key: "seo", label: "SEO", color: "#22c55e" },
  { key: "direct", label: "Директ", color: "#3b82f6" },
  { key: "recom", label: "Прямые/неизв.", color: "#a855f7" },
  { key: "klerk", label: "Клерк", color: "#f59e0b" },
  { key: "insta", label: "Инста", color: "#ec4899" },
  { key: "karty", label: "Карты", color: "#14b8a6" },
  { key: "dzen", label: "Дзен", color: "#ef4444" },
  { key: "youtube", label: "Ютуб", color: "#f97316" },
  { key: "partner", label: "Партнёры", color: "#8b5cf6" },
];

export function ChannelMix({ weeks }: { weeks: LeadWeek[] }) {
  // Итоги по каждому каналу за всё окно — для легенды и сортировки
  const totals = CHANNELS.map((c) => ({
    ...c,
    total: weeks.reduce((s, w) => s + (w[c.key] as number), 0),
  })).filter((c) => c.total > 0);
  const grand = totals.reduce((s, c) => s + c.total, 0) || 1;
  // Явный диапазon дат блока: старт первой недели – конец последней
  const rangeLabel =
    weeks.length > 0
      ? `${weeks[0].label.split("–")[0]} – ${weeks[weeks.length - 1].label.split("–")[1] ?? weeks[weeks.length - 1].label}`
      : "";

  // SEO-сплит
  const g = weeks.reduce((s, w) => s + w.seoGoogle, 0);
  const y = weeks.reduce((s, w) => s + w.seoYandex, 0);
  const u = weeks.reduce((s, w) => s + w.seoUnknown, 0);
  const seoTotal = g + y + u || 1;

  return (
    <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
      {/* Стэк по неделям */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h3 className="font-medium text-sm mb-1">Лиды по каналам</h3>
        <p className="text-muted text-xs mb-4">
          состав источников по неделям (вал){rangeLabel && ` · ${rangeLabel}`}
        </p>

        {/* Легенда */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-4">
          {totals
            .slice()
            .sort((a, b) => b.total - a.total)
            .map((c) => (
              <div key={c.key} className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ background: c.color }}
                />
                <span>{c.label}</span>
                <span className="text-muted">
                  {formatPct((c.total / grand) * 100, 0)}
                </span>
              </div>
            ))}
        </div>

        {/* Полосы по неделям */}
        <div className="space-y-2">
          {weeks.map((w) => {
            const total = CHANNELS.reduce(
              (s, c) => s + (w[c.key] as number),
              0
            );
            return (
              <div
                key={w.weekStart}
                className="grid grid-cols-[86px_1fr_auto] items-center gap-3"
              >
                <div className="text-muted text-xs tabular-nums">{w.label}</div>
                <div className="h-6 rounded-md overflow-hidden flex bg-surface-2">
                  {total === 0 ? null : (
                    CHANNELS.map((c) => {
                      const v = w[c.key] as number;
                      if (!v) return null;
                      return (
                        <div
                          key={c.key}
                          style={{
                            width: `${(v / total) * 100}%`,
                            background: c.color,
                          }}
                          title={`${c.label}: ${v}`}
                        />
                      );
                    })
                  )}
                </div>
                <div className="text-right tabular-nums text-sm font-semibold min-w-[40px]">
                  {formatNumber(total)}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-muted text-[11px] mt-3">
          «Прямые/неизв.» — прямые заходы, звонки, повторные обращения и лиды без
          явной метки источника.
        </p>
      </div>

      {/* SEO-сплит */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h3 className="font-medium text-sm mb-1">SEO-лиды: поисковик</h3>
        <p className="text-muted text-xs mb-4">откуда органика</p>

        <div className="h-6 rounded-md overflow-hidden flex bg-surface-2 mb-4">
          <div style={{ width: `${(y / seoTotal) * 100}%`, background: "#ef4444" }} />
          <div style={{ width: `${(g / seoTotal) * 100}%`, background: "#3b82f6" }} />
          <div style={{ width: `${(u / seoTotal) * 100}%`, background: "#475569" }} />
        </div>

        <div className="space-y-2.5">
          <SplitRow color="#ef4444" label="Яндекс" value={y} total={seoTotal} />
          <SplitRow color="#3b82f6" label="Google" value={g} total={seoTotal} />
          <SplitRow
            color="#475569"
            label="Распределено"
            value={u}
            total={seoTotal}
          />
        </div>
        <p className="text-muted text-[11px] mt-4">
          «Распределено» — лиды без явного поисковика, отнесённые к SEO.
        </p>
      </div>
    </div>
  );
}

function SplitRow({
  color,
  label,
  value,
  total,
}: {
  color: string;
  label: string;
  value: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      <span className="flex-1">{label}</span>
      <span className="tabular-nums font-semibold">{formatNumber(value)}</span>
      <span className="text-muted text-xs w-12 text-right">
        {formatPct((value / total) * 100, 0)}
      </span>
    </div>
  );
}
