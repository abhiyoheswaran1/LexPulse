import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AttentionLevel } from "@/lib/simple-ui";

const levelClass: Record<AttentionLevel, string> = {
  review: "bg-[hsl(8_58%_92%)] text-[hsl(8_58%_34%)] border-[hsl(8_46%_72%)]",
  monitor: "bg-[hsl(42_70%_88%)] text-[hsl(38_82%_28%)] border-[hsl(42_54%_68%)]",
  quiet: "bg-[hsl(138_36%_88%)] text-[hsl(145_44%_28%)] border-[hsl(138_30%_68%)]",
};

export function SimplePageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-[hsl(35_24%_80%)] pb-7 md:flex-row md:items-start md:justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-[0.28em] text-[hsl(33_14%_43%)] font-mono">
          {eyebrow}
        </div>
        <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight leading-[1.05] text-[hsl(34_24%_14%)] sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[hsl(33_14%_36%)]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function SimpleCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[hsl(35_24%_80%)] bg-[hsl(42_44%_97%)] shadow-[0_1px_0_hsl(0_0%_100%_/_0.7)_inset]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SimpleCardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[hsl(35_24%_84%)] px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-[hsl(34_24%_14%)]">{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-5 text-[hsl(33_14%_43%)]">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function AttentionPill({ level, label }: { level: AttentionLevel; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        levelClass[level],
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-75" />
      {label}
    </span>
  );
}

export function SimpleTabs({
  active,
}: {
  active: "queue" | "map";
}) {
  return (
    <div className="inline-flex rounded-lg border border-[hsl(35_24%_78%)] bg-[hsl(37_32%_90%)] p-1 text-sm">
      <TabLink href="/simple" active={active === "queue"}>
        Queue
      </TabLink>
      <TabLink href="/simple?view=map" active={active === "map"}>
        Map
      </TabLink>
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 transition",
        active
          ? "bg-[hsl(34_24%_14%)] text-[hsl(42_44%_97%)]"
          : "text-[hsl(33_14%_33%)] hover:bg-[hsl(38_30%_84%)]",
      )}
    >
      {children}
    </Link>
  );
}

export function SimpleActionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-md border border-[hsl(35_24%_76%)] bg-[hsl(42_44%_97%)] px-3 py-2 text-sm font-medium text-[hsl(34_24%_18%)] transition hover:border-[hsl(34_82%_34%)] hover:text-[hsl(34_82%_34%)]"
    >
      {children}
    </Link>
  );
}
