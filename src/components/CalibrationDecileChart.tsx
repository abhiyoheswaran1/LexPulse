"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DecileBucket } from "@/lib/backtest-stats";

export function CalibrationDecileChart({ deciles }: { deciles: DecileBucket[] }) {
  const data = deciles.map((d) => ({
    decile: `D${d.decile}`,
    rate: +(d.rate * 100).toFixed(2),
    lift: +d.lift.toFixed(2),
    n: d.n,
  }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="decile"
            tick={{ fontSize: 11, fill: "hsl(var(--muted))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted))" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={36}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--panel))", opacity: 0.5 }}
            contentStyle={{
              background: "hsl(var(--bg))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--muted))", fontFamily: "var(--font-mono)" }}
            formatter={(_, __, p) => [
              `${p.payload.rate.toFixed(1)}% · ${p.payload.lift.toFixed(2)}× · n=${p.payload.n}`,
              "Rate · Lift · n",
            ]}
          />
          <Bar dataKey="rate" fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
