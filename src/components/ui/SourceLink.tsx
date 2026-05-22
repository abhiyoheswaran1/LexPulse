import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function SourceLink({
  href,
  label = "Source",
  compact = false,
  className,
}: {
  href: string | null | undefined;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  if (!href) {
    return (
      <span className={cn("inline-flex items-center rounded-md border border-border/60 text-xs text-muted/70", compact ? "px-2 py-1" : "px-2.5 py-1.5", className)}>
        No source link
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border text-xs text-muted transition hover:border-accent/60 hover:text-accent",
        compact ? "px-2 py-1" : "px-2.5 py-1.5",
        className,
      )}
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  );
}
