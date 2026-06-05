import { formatDelta } from "@/lib/format";

export function StatCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
}) {
  const d = delta !== undefined ? formatDelta(delta) : null;
  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="text-muted text-sm">{label}</div>
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
