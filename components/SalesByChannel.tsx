// Выручка по каналам привлечения — откуда пришли деньги, а не только лиды.
// Канал продажи = канал ПЕРВОГО лида Bitrix с телефоном покупателя
// (first-touch, связка по телефону из реестра). Серверный компонент.
import { formatNumber, formatPct } from "@/lib/format";

type Row = { source: string | null; cards: number; revenue: number };

// Подписи и цвета каналов — те же, что в ChannelMix (лиды по каналам),
// чтобы блоки читались как одна система.
const META: Record<string, { label: string; color: string }> = {
  seo: { label: "SEO", color: "#22c55e" },
  direct: { label: "Директ", color: "#3b82f6" },
  messenger: { label: "Мессенджеры", color: "#06b6d4" },
  call: { label: "Звонки", color: "#eab308" },
  recom: { label: "Повторные/прямые", color: "#a855f7" },
  klerk: { label: "Клерк", color: "#f59e0b" },
  insta: { label: "Инста", color: "#ec4899" },
  karty: { label: "Карты", color: "#14b8a6" },
  dzen: { label: "Дзен", color: "#ef4444" },
  youtube: { label: "Ютуб", color: "#f97316" },
  partner: { label: "Партнёры", color: "#8b5cf6" },
  unknown: { label: "Без метки", color: "#475569" },
};
const NO_LEAD = { label: "Не определён", color: "#64748b" };

export function SalesByChannel({ rows }: { rows: Row[] }) {
  const total = rows.reduce((s, r) => s + r.revenue, 0) || 1;
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <h3 className="font-medium text-sm mb-1">Выручка по каналам</h3>
      <p className="text-muted text-xs mb-4">
        канал первого обращения клиента (по телефону из реестра)
      </p>
      {rows.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-muted text-xs">
          Нет продаж за выбранный период
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const m = r.source ? META[r.source] ?? { label: r.source, color: "#64748b" } : NO_LEAD;
            return (
              <div key={r.source ?? "—"} className="flex items-center gap-2.5 text-sm">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: m.color }}
                />
                <span className="w-32 shrink-0 truncate" title={`${r.cards} карт`}>
                  {m.label}
                </span>
                <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden min-w-[40px]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((r.revenue / max) * 100, 3)}%`,
                      background: m.color,
                    }}
                  />
                </div>
                <span className="tabular-nums font-semibold w-20 text-right">
                  {r.revenue >= 1000
                    ? `${Math.round(r.revenue / 1000)}k ₽`
                    : `${formatNumber(r.revenue)} ₽`}
                </span>
                <span className="text-muted text-xs w-10 text-right">
                  {formatPct((r.revenue / total) * 100, 0)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-muted text-[11px] mt-4">
        «Мессенджеры» и «Звонки» — клиент написал/позвонил сам, откуда узнал —
        неизвестно. Если у клиента есть лид с явной меткой (SEO, Директ…) —
        считается она. «Не определён» — в реестре нет телефона или лид не
        нашёлся.
      </p>
    </div>
  );
}
