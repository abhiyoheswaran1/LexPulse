"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type Bucket = { month: string; count: number };

export function CaseTimeline({ data }: { data: Bucket[] }) {
  if (!data.length) {
    return (
      <div className="h-56 grid place-items-center text-sm text-muted">No filing history.</div>
    );
  }
  return (
    <div className="h-56 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="caseBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(190 95% 55%)" stopOpacity={0.95} />
              <stop offset="100%" stopColor="hsl(190 95% 55%)" stopOpacity={0.45} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(220 14% 17%)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "hsl(220 8% 62%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "hsl(220 8% 62%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: "hsl(220 16% 12% / 0.7)" }}
            contentStyle={{
              background: "hsl(220 18% 9%)",
              border: "1px solid hsl(220 14% 17%)",
              fontSize: 12,
              borderRadius: 8,
              padding: "8px 12px",
              boxShadow: "0 8px 24px -16px hsl(220 60% 2%)",
            }}
            labelStyle={{ color: "hsl(220 15% 92%)", fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: "hsl(220 15% 92%)" }}
          />
          <Bar dataKey="count" fill="url(#caseBar)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
