// Выручка по неделям — вертикальные бары с подписями. Серверный компонент.
import { formatNumber } from "@/lib/format";

type Week = { label: string; cards: number; revenue: number };

export function RevenueBars({ weeks }: { weeks: Week[] }) {
  const max = Math.max(...weeks.map((w) => w.revenue), 1);
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <h3 className="font-medium text-sm mb-1">Выручка по неделям</h3>
      <p className="text-muted text-xs mb-4">оплаченные карты, ₽</p>
      <div className="flex items-end gap-2 h-40">
        {weeks.map((w) => (
          <div
            key={w.label}
            className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0 group"
          >
            <div className="text-[11px] font-semibold tabular-nums opacity-70 group-hover:opacity-100 transition">
              {w.revenue >= 1000
                ? `${Math.round(w.revenue / 1000)}k`
                : formatNumber(w.revenue)}
            </div>
            <div
              className="w-full max-w-[44px] rounded-t-md transition-all"
              style={{
                height: `${Math.max((w.revenue / max) * 100, 2)}%`,
                background: "linear-gradient(180deg, #22c55e, #16a34a)",
              }}
              title={`${w.label}: ${formatNumber(w.revenue)} ₽ · ${w.cards} карт`}
            />
            <div className="text-muted text-[10px] truncate w-full text-center">
              {w.label.replace("с ", "")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
