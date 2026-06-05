"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBucketLabel, formatNumber } from "@/lib/format";
import { useChartTheme } from "@/components/useChartTheme";
import type { TrendRow, Granularity } from "@/lib/data";

type Series = { id: string; name: string; color: string };

export function TrafficChart({
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
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient
                key={s.id}
                id={`grad-${s.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
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
            tickFormatter={(v) => formatNumber(v)}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: t.tooltipBg,
              border: `1px solid ${t.tooltipBorder}`,
              borderRadius: 12,
              color: t.tooltipText,
            }}
            labelFormatter={(l) => labelFmt(String(l))}
            formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
          />
          {series.map((s) => (
            <Area
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stackId="1"
              stroke={s.color}
              fill={`url(#grad-${s.id})`}
              strokeWidth={2}
              hide={hidden.has(s.id)}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend series={series} hidden={hidden} onToggle={toggle} />
    </div>
  );
}

export function ChartLegend({
  series,
  hidden,
  onToggle,
}: {
  series: Series[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
      {series.map((s) => {
        const off = hidden.has(s.id);
        return (
          <button
            key={s.id}
            onClick={() => onToggle(s.id)}
            className={`flex items-center gap-1.5 text-xs transition ${
              off ? "opacity-40 line-through" : "opacity-100"
            } hover:opacity-80`}
            title={off ? "Показать" : "Скрыть"}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: s.color }}
            />
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
