// Сквозной период для CRM-секции (воронка/лиды/продажи): 4 нед / 8 нед / Всё.
// Сохраняет остальные параметры URL (period/group/engine/proj).
import Link from "next/link";

const OPTIONS = [
  { v: "4", label: "4 нед" },
  { v: "8", label: "8 нед" },
  { v: "all", label: "Всё" },
];

export function CrmPeriodSwitcher({
  current,
  params,
}: {
  current: string;
  params: { period?: string; group?: string; engine?: string; proj?: string };
}) {
  const href = (w: string) => {
    const sp = new URLSearchParams();
    if (params.period) sp.set("period", params.period);
    if (params.group) sp.set("group", params.group);
    if (params.engine) sp.set("engine", params.engine);
    if (params.proj) sp.set("proj", params.proj);
    sp.set("weeks", w);
    return `/?${sp.toString()}`;
  };
  return (
    <div className="inline-flex bg-surface-2 border border-border rounded-lg p-1">
      {OPTIONS.map((o) => (
        <Link
          key={o.v}
          href={href(o.v)}
          scroll={false}
          className={`px-3 py-1 text-xs rounded-md transition ${
            current === o.v
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
