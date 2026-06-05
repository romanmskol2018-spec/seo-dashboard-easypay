import Link from "next/link";
import type { Granularity } from "@/lib/data";

const ENGINES = ["Яндекс", "Google"];

export function EngineSwitcher({
  current,
  period,
  group,
}: {
  current: string;
  period: number;
  group: Granularity;
}) {
  return (
    <div className="inline-flex bg-surface-2 border border-border rounded-lg p-1">
      {ENGINES.map((e) => (
        <Link
          key={e}
          href={`/?period=${period}&group=${group}&engine=${encodeURIComponent(e)}`}
          scroll={false}
          className={`px-3 py-1 text-xs rounded-md transition ${
            current === e
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          {e}
        </Link>
      ))}
    </div>
  );
}
