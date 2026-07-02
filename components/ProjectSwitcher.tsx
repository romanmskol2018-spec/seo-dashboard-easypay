"use client";
// Глобальный фильтр проекта — действует на всю страницу (воронка, лиды,
// продажи, SEO). Ставит proj в URL, сохраняя остальные параметры.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LEAD_PROJECTS } from "@/lib/projects";

export function ProjectSwitcher({ project }: { project: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const go = (p: string) => {
    const q = new URLSearchParams(sp.toString());
    if (p === "ALL") q.delete("proj");
    else q.set("proj", p);
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {["ALL", ...LEAD_PROJECTS].map((p) => (
        <button
          key={p}
          onClick={() => go(p)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition ${
            p === project
              ? "bg-accent/15 text-accent border-accent"
              : "bg-surface text-muted border-border hover:border-accent"
          }`}
        >
          {p === "ALL" ? "Все проекты" : p}
        </button>
      ))}
    </div>
  );
}
