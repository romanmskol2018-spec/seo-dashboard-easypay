"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBucketLabel, formatPct } from "@/lib/format";
import { useChartTheme } from "@/components/useChartTheme";
import { ChartLegend } from "@/components/TrafficChart";
import type { TrendRow, Granularity } from "@/lib/data";

type Series = { id: string; name: string; color: string };

export function VisibilityChart({
  data,
  series,
  granularity = "day",
}: {
  data: TrendRow[];
  series: Series[];
  granularity?: Granularity;
}) {
  const t = useChartTheme();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const labelFmt = (v: string) => formatBucketLabel(String(v), granularity);

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-muted">
        Нет данных за выбранный период
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={labelFmt}
            stroke={t.axis}
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            stroke={t.axis}
            fontSize={12}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={45}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: t.tooltipBg,
              border: `1px solid ${t.tooltipBorder}`,
              borderRadius: 12,
              color: t.tooltipText,
            }}
            labelFormatter={(l) => labelFmt(String(l))}
            formatter={(value, name) => [formatPct(Number(value)), String(name)]}
          />
          {series.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls
              hide={hidden.has(s.id)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ChartLegend series={series} hidden={hidden} onToggle={toggle} />
    </div>
  );
}
