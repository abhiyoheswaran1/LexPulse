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
    <section
      className={cn(
        "rounded-xl border border-border bg-panel/60 transition hover:bg-panel/80",
        className,
      )}
    >
      {(title || right) && (
        <header className="flex items-end justify-between px-5 pt-4 pb-3 border-b border-border">
          <div>
            {title && (
              <h2 className="text-sm font-semibold tracking-tight font-display">{title}</h2>
            )}
            {subtitle && (
              <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-panel/60 px-5 py-4 transition hover:bg-panel/80">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-semibold tabular tracking-tight">{value}</div>
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
    </div>
  );
}
