"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  Bookmark,
  BookOpen,
  ClipboardList,
  Database,
  LayoutDashboard,
  ListChecks,
  Map,
  Search,
  Settings,
} from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { useWorkflowState } from "./workflow/useWorkflowState";
import { StatusPill } from "./platform/StatusPill";
import { cn } from "@/lib/utils";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/simple") || pathname?.startsWith("/brief")) {
    return <SimpleChrome pathname={pathname}>{children}</SimpleChrome>;
  }
  return <AdvancedChrome pathname={pathname ?? "/"}>{children}</AdvancedChrome>;
}

function AdvancedChrome({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdvancedSidebar pathname={pathname} />
      <main className="flex-1 min-w-0">
        <AdvancedTopBar onOpenPalette={() => setPaletteOpen(true)} />
        <div className="mx-auto max-w-[1520px] px-5 py-6 pb-24 sm:px-8 sm:py-8 md:pb-8 2xl:px-10">
          {children}
        </div>
        <AdvancedFooter />
      </main>
      <AdvancedMobileNav pathname={pathname} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function AdvancedSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="w-full shrink-0 border-b border-border bg-panel/40 backdrop-blur-sm md:w-56 md:border-b-0 md:border-r">
      <Link href="/" className="block px-5 py-5 border-b border-border group md:py-6">
        <div className="flex items-baseline gap-2">
          <span className="editorial text-2xl tracking-tight">Lex</span>
          <span className="editorial text-2xl tracking-tight italic text-accent group-hover:text-fg transition">
            Pulse
          </span>
        </div>
        <div className="text-[9px] uppercase tracking-[0.32em] text-muted mt-1.5 font-mono">
          litigation intel
        </div>
      </Link>
      <nav className="hidden p-3 text-sm md:block md:space-y-0.5">
        <AdvancedNavItem href="/" icon={<LayoutDashboard className="size-4" />} label="Dashboard" pathname={pathname} />
        <AdvancedNavItem href="/watchlist" icon={<Bookmark className="size-4" />} label="Watchlist" pathname={pathname} />
        <AdvancedNavItem href="/workflow" icon={<ClipboardList className="size-4" />} label="Workflow" pathname={pathname} />
        <AdvancedNavItem href="/search" icon={<Search className="size-4" />} label="Search" pathname={pathname} />
        <AdvancedNavItem
          href="/alerts"
          icon={
            <span className="relative">
              <Bell className="size-4" />
              <UnreadDot />
            </span>
          }
          label="Alerts"
          pathname={pathname}
        />
        <AdvancedNavItem href="/calibration" icon={<BarChart3 className="size-4" />} label="Calibration" pathname={pathname} />
        <AdvancedNavItem href="/methodology" icon={<BookOpen className="size-4" />} label="Methodology" pathname={pathname} />
        <AdvancedNavItem href="/coverage" icon={<Database className="size-4" />} label="Coverage" pathname={pathname} />
        <AdvancedNavItem href="/settings" icon={<Settings className="size-4" />} label="Settings" pathname={pathname} />
        <AdvancedNavItem href="/status" icon={<span className="size-2 rounded-full bg-accent" />} label="Status" pathname={pathname} />
        <AdvancedNavItem href="/api" icon={<span className="font-mono text-xs">{`{}`}</span>} label="API" pathname={pathname} />
      </nav>
      <div className="hidden px-5 py-4 mt-4 text-[11px] text-muted leading-relaxed border-t border-border font-display italic md:block">
        <div className="not-italic text-fg/80 font-sans font-medium mb-1.5 text-xs">v3.0, backtested</div>
        IC 0.06 at 180-day horizon vs SEC 8-K disclosures.{" "}
        <Link href="/calibration" className="not-italic text-accent hover:underline font-sans">
          numbers
        </Link>
      </div>
    </aside>
  );
}

function AdvancedNavItem({
  href,
  icon,
  label,
  pathname,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  pathname: string;
}) {
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-fg/75 transition hover:bg-panel2 hover:text-fg",
        active && "bg-panel2 text-fg shadow-[inset_0_0_0_1px_hsl(35_10%_24%)]",
      )}
    >
      <span className={cn("grid size-5 place-items-center text-muted", active && "text-accent")}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function AdvancedTopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <div className="min-h-12 border-b border-border bg-panel/40 backdrop-blur flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
      <div className="text-[10px] text-muted tracking-[0.24em] uppercase font-mono sm:tracking-[0.32em]">
        Litigation Intelligence
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onOpenPalette}
          className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:border-accent/60 hover:text-accent"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Command</span>
          <span className="hidden rounded border border-border/70 px-1.5 py-0.5 text-[9px] sm:inline">⌘K</span>
        </button>
        <Link href="/settings" className="text-[11px] text-muted hover:text-accent font-mono tracking-[0.18em] uppercase transition">
          Settings
        </Link>
        <StatusPill />
      </div>
    </div>
  );
}

function AdvancedMobileNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-xl border border-border bg-panel/95 p-1 shadow-2xl shadow-black/30 backdrop-blur md:hidden">
      <MobileNavItem href="/" icon={<LayoutDashboard className="size-4" />} label="Home" pathname={pathname} />
      <MobileNavItem href="/workflow" icon={<ClipboardList className="size-4" />} label="Flow" pathname={pathname} />
      <MobileNavItem href="/search" icon={<Search className="size-4" />} label="Search" pathname={pathname} />
      <MobileNavItem
        href="/alerts"
        icon={
          <span className="relative">
            <Bell className="size-4" />
            <UnreadDot />
          </span>
        }
        label="Alerts"
        pathname={pathname}
      />
      <MobileNavItem href="/settings" icon={<Settings className="size-4" />} label="Settings" pathname={pathname} />
    </nav>
  );
}

function MobileNavItem({
  href,
  icon,
  label,
  pathname,
  light = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  pathname: string;
  light?: boolean;
}) {
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] transition",
        light
          ? "text-[hsl(33_14%_38%)] hover:bg-[hsl(38_30%_84%)] hover:text-[hsl(34_24%_14%)]"
          : "text-muted hover:bg-panel2 hover:text-fg",
        active && (light ? "bg-[hsl(38_30%_84%)] text-[hsl(34_24%_14%)]" : "bg-panel2 text-fg"),
      )}
    >
      <span className={cn(active && (light ? "text-[hsl(34_82%_34%)]" : "text-accent"))}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function UnreadDot() {
  const count = useUnreadAlertCount();
  if (count === 0) return null;
  return <span className="absolute -right-1 -top-1 size-2 rounded-full bg-bad ring-2 ring-panel" />;
}

function useUnreadAlertCount() {
  const workflow = useWorkflowState();
  const [alertIds, setAlertIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alerts?limit=200")
      .then((response) => response.json())
      .then((payload: { alerts?: Array<{ id: string }> }) => {
        if (!cancelled) setAlertIds((payload.alerts ?? []).map((alert) => alert.id));
      })
      .catch(() => {
        if (!cancelled) setAlertIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return alertIds.filter((id) => !workflow.isAlertRead(id)).length;
}

function AdvancedFooter() {
  return (
    <footer className="mt-12 border-t border-border bg-panel/40 px-5 py-6 text-xs text-muted sm:px-8">
      <div className="mx-auto flex max-w-[1520px] flex-wrap items-center justify-between gap-4">
        <div>
          Litigation data via{" "}
          <Link href="https://www.courtlistener.com/" className="text-fg/80 hover:text-accent">
            CourtListener / Free Law Project
          </Link>
          , licensed CC BY-ND 4.0.
        </div>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="hover:text-fg">
            Settings
          </Link>
          <Link href="/api" className="hover:text-fg">
            API
          </Link>
          <Link href="/status" className="hover:text-fg">
            Status
          </Link>
          <Link href="/coverage" className="hover:text-fg">
            Coverage
          </Link>
          <Link href="/support" className="hover:text-fg">
            Support
          </Link>
          <Link href="/legal" className="hover:text-fg">
            Legal
          </Link>
          <Link href="https://github.com/abhiyoheswaran1/LexPulse" className="hover:text-fg">
            GitHub
          </Link>
          <span className="text-muted/60">v0.3, LexPulse</span>
        </div>
      </div>
    </footer>
  );
}

function SimpleChrome({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[hsl(38_36%_94%)] text-[hsl(34_24%_14%)]">
      <div className="flex min-h-screen flex-col md:flex-row">
        <SimpleSidebar pathname={pathname} />
        <main className="flex-1 min-w-0">
          <SimpleTopBar onOpenPalette={() => setPaletteOpen(true)} />
          <div className="mx-auto max-w-[1320px] px-5 py-6 pb-24 sm:px-8 sm:py-8 md:pb-8">{children}</div>
          <SimpleFooter />
        </main>
        <SimpleMobileNav pathname={pathname} />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </div>
  );
}

function SimpleSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="w-full shrink-0 border-b border-[hsl(35_24%_80%)] bg-[hsl(37_32%_90%)] md:w-56 md:border-b-0 md:border-r">
      <Link href="/brief" className="block px-5 py-5 border-b border-[hsl(35_24%_80%)] group md:py-6">
        <div className="flex items-baseline gap-2">
          <span className="editorial text-2xl tracking-tight">Lex</span>
          <span className="editorial text-2xl tracking-tight italic text-[hsl(34_82%_34%)] group-hover:text-[hsl(34_24%_14%)] transition">
            Pulse
          </span>
        </div>
        <div className="text-[9px] uppercase tracking-[0.32em] text-[hsl(33_14%_43%)] mt-1.5 font-mono">
          brief workspace
        </div>
      </Link>
      <nav className="hidden p-3 text-sm md:block md:space-y-0.5">
        <SimpleNavItem href="/brief" icon={<ListChecks className="size-4" />} label="Queue" pathname={pathname} />
        <SimpleNavItem href="/brief?view=map" icon={<Map className="size-4" />} label="Map" pathname={pathname} />
        <SimpleNavItem href="/brief/search" icon={<Search className="size-4" />} label="Search" pathname={pathname} />
        <SimpleNavItem
          href="/brief/alerts"
          icon={
            <span className="relative">
              <Bell className="size-4" />
              <UnreadDot />
            </span>
          }
          label="Alerts"
          pathname={pathname}
        />
        <SimpleNavItem href="/settings" icon={<Settings className="size-4" />} label="Settings" pathname={pathname} />
      </nav>
      <div className="hidden px-5 py-4 mt-4 text-[11px] text-[hsl(33_14%_43%)] leading-relaxed border-t border-[hsl(35_24%_80%)] md:block">
        Brief prioritizes what needs review. Workspace switching lives in Settings.
      </div>
    </aside>
  );
}

function SimpleNavItem({
  href,
  icon,
  label,
  pathname,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  pathname: string;
}) {
  const normalizedHref = href.split("?")[0];
  const hasQuery = href.includes("?");
  const active =
    !hasQuery &&
    (normalizedHref === "/brief"
      ? pathname === "/brief"
      : pathname === normalizedHref || pathname.startsWith(`${normalizedHref}/`));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-[hsl(33_14%_33%)] transition hover:bg-[hsl(38_30%_84%)] hover:text-[hsl(34_24%_14%)]",
        active && "bg-[hsl(38_30%_84%)] text-[hsl(34_24%_14%)] shadow-[inset_0_0_0_1px_hsl(35_24%_76%)]",
      )}
    >
      <span className={cn("grid size-5 place-items-center text-[hsl(33_14%_43%)]", active && "text-[hsl(34_82%_34%)]")}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function SimpleTopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <div className="min-h-12 border-b border-[hsl(35_24%_80%)] bg-[hsl(38_36%_94%)] flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
      <div className="text-[10px] text-[hsl(33_14%_43%)] tracking-[0.24em] uppercase font-mono sm:tracking-[0.32em]">
        Brief Portfolio Monitor
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onOpenPalette}
          className="inline-flex items-center gap-2 rounded-md border border-[hsl(35_24%_80%)] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(33_14%_43%)] transition hover:border-[hsl(34_82%_34%)] hover:text-[hsl(34_82%_34%)]"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Command</span>
          <span className="hidden rounded border border-[hsl(35_24%_78%)] px-1.5 py-0.5 text-[9px] sm:inline">⌘K</span>
        </button>
        <Link
          href="/settings"
          className="text-[11px] text-[hsl(33_14%_43%)] hover:text-[hsl(34_82%_34%)] font-mono tracking-[0.18em] uppercase transition"
        >
          Settings
        </Link>
        <StatusPill light />
      </div>
    </div>
  );
}

function SimpleMobileNav({ pathname }: { pathname: string }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-xl border border-[hsl(35_24%_80%)] bg-[hsl(38_36%_94%)] p-1 shadow-2xl shadow-black/15 md:hidden">
      <MobileNavItem href="/brief" icon={<ListChecks className="size-4" />} label="Queue" pathname={pathname} light />
      <MobileNavItem href="/brief/search" icon={<Search className="size-4" />} label="Search" pathname={pathname} light />
      <MobileNavItem href="/brief/alerts" icon={<Bell className="size-4" />} label="Alerts" pathname={pathname} light />
      <MobileNavItem href="/settings" icon={<Settings className="size-4" />} label="Settings" pathname={pathname} light />
    </nav>
  );
}

function SimpleFooter() {
  return (
    <footer className="mt-12 border-t border-[hsl(35_24%_80%)] px-8 py-6 text-xs text-[hsl(33_14%_43%)]">
      <div className="max-w-[1320px] mx-auto flex flex-wrap items-center justify-between gap-4">
        <div>
          Litigation data via{" "}
          <Link href="https://www.courtlistener.com/" className="text-[hsl(34_24%_20%)] hover:text-[hsl(34_82%_34%)]">
            CourtListener / Free Law Project
          </Link>
          , licensed CC BY-ND 4.0.
        </div>
        <div className="flex items-center gap-4">
          <Link href="/settings" className="hover:text-[hsl(34_24%_14%)]">
            Settings
          </Link>
          <Link href="/api" className="hover:text-[hsl(34_24%_14%)]">
            API
          </Link>
          <Link href="/status" className="hover:text-[hsl(34_24%_14%)]">
            Status
          </Link>
          <Link href="/support" className="hover:text-[hsl(34_24%_14%)]">
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
