import Link from "next/link";
import { Panel } from "./Panel";
import { RiskBadge } from "./RiskBadge";

export type MoverRow = {
  id: string;
  name: string;
  ticker: string | null;
  score: number;
  band: string;
  delta7d: number;
};

export function MoversPanel({ rows }: { rows: MoverRow[] }) {
  if (rows.length === 0) {
    return (
      <Panel title="Biggest movers (7d)">
        <div className="text-xs text-muted py-2">No movement in the last 7 days.</div>
      </Panel>
    );
  }
  return (
    <Panel title="Biggest movers (7d)" subtitle={`${rows.length}`}>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-1.5 text-xs">
            <Link href={`/companies/${r.id}`} className="hover:underline truncate flex-1">
              <span className="font-medium">{r.name}</span>
              {r.ticker && <span className="text-muted ml-1.5">{r.ticker}</span>}
            </Link>
            <RiskBadge score={r.score} band={r.band} delta={r.delta7d} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
