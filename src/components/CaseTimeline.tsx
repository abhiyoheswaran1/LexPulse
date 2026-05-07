"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type Bucket = { month: string; count: number };

export function CaseTimeline({ data }: { data: Bucket[] }) {
  if (!data.length) {
    return <div className="text-sm text-muted">No filing history.</div>;
  }
  return (
    <div className="h-56 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="hsl(220 12% 18%)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "hsl(220 8% 60%)", fontSize: 11 }}
            axisLine={{ stroke: "hsl(220 12% 18%)" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "hsl(220 8% 60%)", fontSize: 11 }}
            axisLine={{ stroke: "hsl(220 12% 18%)" }}
            tickLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ fill: "hsl(220 14% 13%)" }}
            contentStyle={{
              background: "hsl(220 14% 13%)",
              border: "1px solid hsl(220 12% 18%)",
              fontSize: 12,
              borderRadius: 6,
            }}
            labelStyle={{ color: "hsl(220 15% 92%)" }}
          />
          <Bar dataKey="count" fill="hsl(190 95% 55%)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
