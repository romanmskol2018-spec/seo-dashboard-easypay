import { formatDelta } from "@/lib/format";
import { Icon, type IconName } from "@/components/Icon";

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon,
}: {
  label: React.ReactNode;
  value: string;
  delta?: number | null;
  hint?: string;
  icon?: IconName;
}) {
  const d = delta !== undefined ? formatDelta(delta) : null;
  return (
    <div className="bg-surface border border-border rounded-2xl p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="text-muted text-sm">{label}</div>
        {icon && (
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-accent/15 text-accent shrink-0">
            <Icon name={icon} className="w-4 h-4" />
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className="flex items-center gap-2 mt-2 text-sm">
        {d && (
          <span
            className={
              d.positive === null
                ? "text-muted"
                : d.positive
                  ? "text-positive"
                  : "text-negative"
            }
          >
            {d.positive === null ? "" : d.positive ? "▲ " : "▼ "}
            {d.text}
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
    </div>
  );
}
