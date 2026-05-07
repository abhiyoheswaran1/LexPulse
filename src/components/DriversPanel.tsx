import { Panel } from "./Panel";

export type Driver = {
  label: string;
  weight: number;
  type: string;
  evidence?: Record<string, unknown>;
};

const TYPE_COLOR: Record<string, string> = {
  risk_jump: "bg-bad/15 text-bad border-bad/30",
  decay: "bg-ok/15 text-ok border-ok/30",
  case_spike: "bg-warn/15 text-warn border-warn/30",
  severe_filing: "bg-bad/15 text-bad border-bad/30",
  category_concentration: "bg-elev/15 text-elev border-elev/30",
  federal_circuit_focus: "bg-elev/15 text-elev border-elev/30",
  dormant_to_active: "bg-warn/15 text-warn border-warn/30",
};

export function DriversPanel({ drivers }: { drivers: Driver[] }) {
  if (!drivers || drivers.length === 0) {
    return (
      <Panel title="Drivers">
        <div className="text-xs text-muted py-2">
          No notable signals. Score reflects steady-state activity.
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="Drivers" subtitle={`${drivers.length} signal${drivers.length === 1 ? "" : "s"}`}>
      <ul className="space-y-1.5">
        {drivers.map((d, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs ${
              TYPE_COLOR[d.type] ?? "bg-panel border-border"
            }`}
            title={JSON.stringify(d.evidence ?? {}, null, 2)}
          >
            <span className="size-1.5 rounded-full bg-current mt-1.5 opacity-70" />
            <span className="flex-1">{d.label}</span>
            <span className="tabular text-[10px] opacity-70">w {d.weight.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
