"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";

const TABS: { href: string; label: string; icon: IconName; soon?: boolean }[] = [
  { href: "/", label: "Обзор", icon: "chart" },
  { href: "/articles", label: "Статьи", icon: "search" },
  { href: "/queries", label: "Запросы", icon: "target" },
  { href: "/placements", label: "Площадки", icon: "link" },
];

export function TabNav() {
  const pathname = usePathname();
  const sp = useSearchParams();
  // Переносим глобальный период (и проект) между вкладками
  const keep = new URLSearchParams();
  for (const k of ["from", "to", "proj"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString();
  const withPeriod = (base: string) => (qs ? `${base}?${qs}` : base);
  return (
    <nav className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-border">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        if (t.soon) {
          return (
            <span
              key={t.href}
              title="Скоро"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-muted/50 cursor-not-allowed select-none"
            >
              <Icon name={t.icon} className="w-4 h-4" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="text-[10px] uppercase tracking-wide bg-surface-2 rounded px-1 py-0.5">
                скоро
              </span>
            </span>
          );
        }
        return (
          <Link
            key={t.href}
            href={withPeriod(t.href)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition ${
              active
                ? "bg-accent/15 text-accent font-medium"
                : "text-muted hover:text-foreground hover:bg-surface-2"
            }`}
          >
            <Icon name={t.icon} className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
