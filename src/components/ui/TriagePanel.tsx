import { ListChecks } from "lucide-react";
import { Panel } from "@/components/Panel";
import { MetricStrip, type MetricStripItem } from "./MetricStrip";
import { cn } from "@/lib/utils";

export function TriagePanel({
  title,
  subtitle,
  metrics,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  metrics: MetricStripItem[];
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Panel title={title} subtitle={subtitle} right={<ListChecks className="size-4 text-muted" />} className={className}>
      <div className="space-y-5">
        <MetricStrip items={metrics} columns={3} />
        {children && <div className={cn("border-t border-border/70 pt-5")}>{children}</div>}
      </div>
    </Panel>
  );
}
