import { cn } from "@/lib/utils";

export type MetricStripItem = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
};

export function MetricStrip({
  items,
  columns = "auto",
  className,
}: {
  items: MetricStripItem[];
  columns?: "auto" | 2 | 3 | 4;
  className?: string;
}) {
  const gridClass =
    columns === "auto"
      ? "grid-cols-1 sm:grid-cols-3"
      : columns === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : columns === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : "grid-cols-2 sm:grid-cols-4";

  return (
    <dl className={cn("grid gap-3", gridClass, className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border/75 bg-panel2/35 px-3 py-3">
          <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">{item.label}</dt>
          <dd className="mt-1.5 font-mono text-xl font-semibold leading-none tabular text-fg">
            {item.value}
          </dd>
          {item.hint && <dd className="mt-1 text-xs leading-5 text-muted">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
