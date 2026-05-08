import { Panel } from "./Panel";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Layers,
  Building2,
  Activity,
  ZapOff,
  Sparkle,
} from "lucide-react";

export type Driver = {
  label: string;
  weight: number;
  type: string;
  evidence?: Record<string, unknown>;
};

const TYPE_META: Record<string, { tint: string; ring: string; icon: React.ComponentType<{ className?: string }> }> = {
  risk_jump: {
    tint: "bg-bad/10 text-bad",
    ring: "ring-1 ring-bad/30",
    icon: TrendingUp,
  },
  decay: {
    tint: "bg-ok/10 text-ok",
    ring: "ring-1 ring-ok/30",
    icon: TrendingDown,
  },
  case_spike: {
    tint: "bg-warn/10 text-warn",
    ring: "ring-1 ring-warn/30",
    icon: Activity,
  },
  severe_filing: {
    tint: "bg-bad/10 text-bad",
    ring: "ring-1 ring-bad/30",
    icon: AlertTriangle,
  },
  category_concentration: {
    tint: "bg-elev/10 text-elev",
    ring: "ring-1 ring-elev/30",
    icon: Layers,
  },
  federal_circuit_focus: {
    tint: "bg-elev/10 text-elev",
    ring: "ring-1 ring-elev/30",
    icon: Building2,
  },
  dormant_to_active: {
    tint: "bg-warn/10 text-warn",
    ring: "ring-1 ring-warn/30",
    icon: ZapOff,
  },
  judge_skew: {
    tint: "bg-accent/10 text-accent",
    ring: "ring-1 ring-accent/30",
    icon: Sparkle,
  },
};

function formatEvidence(e: Record<string, unknown> | undefined): string {
  if (!e) return "";
  return Object.entries(e)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
}

export function DriversPanel({ drivers }: { drivers: Driver[] }) {
  if (!drivers || drivers.length === 0) {
    return (
      <Panel title="Drivers">
        <div className="flex items-center gap-3 py-3 text-xs text-muted">
          <span className="size-1.5 rounded-full bg-muted/50" />
          No notable signals. Score reflects steady-state activity.
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="Drivers" subtitle={`${drivers.length} signal${drivers.length === 1 ? "" : "s"}`}>
      <ul className="space-y-2">
        {drivers.map((d, i) => {
          const meta = TYPE_META[d.type] ?? {
            tint: "bg-panel2 text-fg/70",
            ring: "ring-1 ring-border",
            icon: Sparkle,
          };
          const Icon = meta.icon;
          return (
            <li
              key={i}
              className={cn(
                "group flex items-start gap-3 rounded-lg px-3 py-2.5 transition",
                meta.tint,
                meta.ring,
              )}
              title={formatEvidence(d.evidence)}
            >
              <Icon className="size-4 mt-0.5 shrink-0 opacity-90" />
              <span className="flex-1 text-sm leading-snug">{d.label}</span>
              <span className="tabular text-xs opacity-70 shrink-0">
                w{d.weight.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
