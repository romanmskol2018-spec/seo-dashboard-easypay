// Воронка конверсии. Бары — строго вложенные этапы: Визиты → Лиды (визиты ≥ лиды).
// Продажи и выручка — отдельным «итогом» снизу: они из реестра (по дате продажи),
// независимый источник, поэтому в бары воронки не вкладываются. Кач-лиды (сделка в
// Bitrix) убраны из воронки — при продажах из реестра они только путали.
import type { FunnelData } from "@/lib/data";
import { formatNumber, formatPct } from "@/lib/format";

type Stage = {
  label: string;
  value: number | null;
  color: string;
  hint: string;
};

export function FunnelChart({ data }: { data: FunnelData }) {
  const stages: Stage[] = [
    {
      label: "Визиты",
      value: data.visits,
      color: "#3b82f6",
      hint: data.visits === null ? "после импорта Метрики" : "трафик из поиска",
    },
    {
      label: "Лиды · вал",
      value: data.leads,
      color: "#6366f1",
      hint: "уникальные контакты",
    },
  ];
  const crs: (number | null)[] = [data.crVisitLead];
  const known = stages
    .map((s) => s.value)
    .filter((v): v is number => v !== null);
  const max = Math.max(...known, 1);
  const crVisitSale =
    data.visits && data.visits > 0 ? (data.sales / data.visits) * 100 : null;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-medium flex items-center gap-2">
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-accent/15 text-accent">
              <FunnelIcon />
            </span>
            Воронка конверсии
          </h2>
          <p className="text-muted text-xs mt-1">
            Путь от трафика до выручки
            {data.rangeFrom && ` · ${data.rangeFrom} – ${data.rangeTo}`}
            {data.weeks > 0 && ` · ${data.weeks} нед.`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-positive">
            {formatNumber(data.revenue)} ₽
          </div>
          <div className="text-muted text-xs">
            выручка · ср. чек {formatNumber(data.avgCheck)} ₽ · медиана{" "}
            {formatNumber(data.medianCheck)} ₽
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {stages.map((s, i) => {
          const pct = s.value === null ? 0 : (s.value / max) * 100;
          return (
            <div key={s.label}>
              {/* Полоса этапа */}
              <div className="grid grid-cols-[88px_1fr_auto] sm:grid-cols-[120px_1fr_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.label}</div>
                  <div className="text-muted text-[11px] truncate">{s.hint}</div>
                </div>
                <div className="h-9 rounded-lg bg-surface-2 overflow-hidden relative">
                  {s.value === null ? (
                    <div className="absolute inset-0 border border-dashed border-border rounded-lg grid place-items-center">
                      <span className="text-muted text-[11px]">нет данных</span>
                    </div>
                  ) : (
                    <div
                      className="h-full rounded-lg transition-all"
                      style={{
                        width: `${Math.max(pct, 4)}%`,
                        background: `linear-gradient(90deg, ${s.color}, ${s.color}cc)`,
                      }}
                    />
                  )}
                </div>
                <div className="text-right tabular-nums font-semibold text-sm min-w-[64px]">
                  {s.value === null ? "—" : formatNumber(s.value)}
                </div>
              </div>

              {/* Конверсия к следующему шагу */}
              {i < stages.length - 1 && (
                <div className="grid grid-cols-[88px_1fr_auto] sm:grid-cols-[120px_1fr_auto] gap-3 py-1">
                  <div />
                  <div className="flex items-center gap-2">
                    <span className="text-muted text-xs">↓</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        crs[i] === null
                          ? "text-muted border-border"
                          : "text-accent border-accent/40 bg-accent/10"
                      }`}
                    >
                      {crs[i] === null ? "—" : formatPct(crs[i] as number)}
                    </span>
                    <span className="text-muted text-[11px]">
                      {i === 0 ? "в лид" : "в кач-лид"}
                    </span>
                  </div>
                  <div />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Итог: продажи и выручка (датируются по сделке, не вкладываются в бары) */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-positive" />
            <span className="text-sm font-medium">Продажи</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatNumber(data.sales)}
            </span>
            <span className="text-muted text-xs">оплаченных карт</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <Metric
              label="лид → продажа"
              value={
                data.crLeadSale === null ? "—" : formatPct(data.crLeadSale)
              }
            />
            {crVisitSale !== null && (
              <Metric label="визит → продажа" value={formatPct(crVisitSale, 2)} />
            )}
          </div>
        </div>
        <p className="text-muted text-[11px] mt-2">
          Продажи и выручка — все оплаченные карты периода из реестра (по дате
          продажи), считаются независимо от лидов CRM. «лид → продажа» — отношение
          продаж периода к лидам периода, не строгая воронка.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted text-xs">{label}</span>
      <span className="font-semibold text-accent">{value}</span>
    </div>
  );
}

function FunnelIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </svg>
  );
}
