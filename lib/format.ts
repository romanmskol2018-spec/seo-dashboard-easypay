export function formatNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

export function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function formatDelta(delta: number | null): {
  text: string;
  positive: boolean | null;
} {
  if (delta === null) return { text: "—", positive: null };
  const sign = delta > 0 ? "+" : "";
  return { text: `${sign}${delta.toFixed(1)}%`, positive: delta >= 0 };
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

export function formatBucketLabel(
  iso: string,
  group: "day" | "week" | "month"
): string {
  const d = new Date(iso);
  if (group === "month") {
    return new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "2-digit",
    }).format(d);
  }
  if (group === "week") {
    return (
      "с " +
      new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "short",
      }).format(d)
    );
  }
  return formatDateShort(iso);
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
