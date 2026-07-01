import Link from "next/link";
import type { Granularity } from "@/lib/data";

const OPTIONS: { group: Granularity; label: string }[] = [
  { group: "day", label: "Дни" },
  { group: "week", label: "Недели" },
  { group: "month", label: "Месяцы" },
];

export function GroupSwitcher({
  current,
  engine,
  suffix = "",
}: {
  current: Granularity;
  engine: string;
  suffix?: string;
}) {
  return (
    <div className="inline-flex bg-surface-2 border border-border rounded-lg p-1">
      {OPTIONS.map((o) => (
        <Link
          key={o.group}
          href={`/?group=${o.group}&engine=${encodeURIComponent(engine)}${suffix}`}
          scroll={false}
          className={`px-3 py-1 text-xs rounded-md transition ${
            current === o.group
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
