import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function EntityRow({
  href,
  title,
  subtitle,
  meta,
  right,
  className,
}: {
  href: string;
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-border/70 bg-panel2/30 p-3 transition hover:border-fg/20 hover:bg-panel2/55",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-fg/95 group-hover:text-accent">{title}</span>
        {subtitle && <span className="mt-1 block text-xs leading-5 text-muted">{subtitle}</span>}
        {meta && <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{meta}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {right}
        <ArrowUpRight className="size-3.5 text-muted/70 transition group-hover:text-accent" />
      </span>
    </a>
  );
}
