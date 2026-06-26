import Link from "next/link";
import type { Granularity } from "@/lib/data";

const OPTIONS = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
  { days: 180, label: "Полгода" },
  { days: 365, label: "Год" },
];

export function PeriodSwitcher({
  current,
  group,
  engine,
  suffix = "",
}: {
  current: number;
  group: Granularity;
  engine: string;
  suffix?: string;
}) {
  return (
    <div className="inline-flex bg-surface border border-border rounded-lg p-1">
      {OPTIONS.map((o) => (
        <Link
          key={o.days}
          href={`/?period=${o.days}&group=${group}&engine=${encodeURIComponent(engine)}${suffix}`}
          className={`px-3 py-1.5 text-sm rounded-md transition ${
            current === o.days
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
