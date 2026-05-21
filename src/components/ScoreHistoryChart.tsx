"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export type ScoreHistoryPoint = {
  label: string;
  score: number;
  band: string;
};

export function ScoreHistoryChart({ data }: { data: ScoreHistoryPoint[] }) {
  if (data.length === 0) {
    return <div className="grid h-56 place-items-center text-sm text-muted">No score history yet.</div>;
  }

  return (
    <div className="h-56 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="hsl(35 10% 24%)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "hsl(35 8% 64%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "hsl(35 8% 64%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            cursor={{ stroke: "hsl(38 88% 58% / 0.35)" }}
            contentStyle={{
              background: "hsl(35 14% 15%)",
              border: "1px solid hsl(35 10% 24%)",
              fontSize: 12,
              borderRadius: 8,
              padding: "8px 12px",
              boxShadow: "0 8px 24px -16px hsl(35 60% 2%)",
            }}
            labelStyle={{ color: "hsl(40 14% 94%)", fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: "hsl(40 14% 94%)" }}
            formatter={(value, name, props) => [`${value} (${props.payload.band})`, "Score"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="hsl(38 88% 58%)"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "hsl(38 88% 58%)", strokeWidth: 0 }}
            activeDot={{ r: 4, fill: "hsl(38 88% 58%)", stroke: "hsl(35 14% 15%)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
