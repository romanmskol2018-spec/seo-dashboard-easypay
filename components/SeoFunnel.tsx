// SEO-подворонка: визиты (весь трафик) → SEO-лиды, доля SEO в лидах.
// Честная оговорка: трафик в Метрике не разбит по источнику, поэтому CR —
// нижняя оценка эффективности органики (визиты = весь трафик, не только SEO).
import type { FunnelData } from "@/lib/data";
import { formatNumber, formatPct } from "@/lib/format";
import { Icon } from "@/components/Icon";

export function SeoFunnel({ data }: { data: FunnelData }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <h3 className="font-medium text-sm flex items-center gap-2 mb-1">
        <Icon name="search" className="w-4 h-4 text-accent" />
        SEO в воронке
      </h3>
      <p className="text-muted text-xs mb-4">органика как источник лидов</p>

      {/* Доля SEO среди всех лидов */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm text-muted">Доля SEO в лидах</span>
          <span className="text-2xl font-semibold text-positive">
            {data.seoShare === null ? "—" : formatPct(data.seoShare, 0)}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-positive"
            style={{ width: `${data.seoShare ?? 0}%` }}
          />
        </div>
        <div className="text-muted text-xs mt-1.5">
          {formatNumber(data.seoLeads)} из {formatNumber(data.leads)} лидов — из
          поиска
        </div>
      </div>

      {/* Мини-цепочка визиты → SEO-лиды */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-3 border-t border-border">
        <Stat
          label="Визиты (всего)"
          value={data.visits === null ? "—" : formatNumber(data.visits)}
        />
        <div className="text-center">
          <div className="text-muted text-[11px]">CR в SEO-лид</div>
          <div className="text-accent font-semibold text-sm">
            {data.seoCrVisit === null ? "—" : formatPct(data.seoCrVisit, 2)}
          </div>
        </div>
        <Stat label="SEO-лиды" value={formatNumber(data.seoLeads)} accent />
      </div>

      <p className="text-muted text-[11px] mt-3">
        Трафик в Метрике не разбит по источнику, поэтому визиты — весь трафик, а
        CR — нижняя оценка отдачи органики.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-muted text-[11px]">{label}</div>
      <div
        className={`text-lg font-semibold tabular-nums ${accent ? "text-positive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
