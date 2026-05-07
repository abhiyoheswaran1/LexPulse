import { cn } from "@/lib/utils";

export function Panel({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-panel shadow-card", className)}>
      {(title || right) && (
        <header className="flex items-end justify-between px-5 pt-4 pb-3 border-b border-border">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel px-5 py-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  );
}
