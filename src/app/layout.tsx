import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { Activity, Bell, LayoutDashboard, Search } from "lucide-react";

export const metadata: Metadata = {
  title: "LexPulse — litigation intelligence",
  description: "Company-level litigation risk for investors, strategy, insurers, and compliance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <TopBar />
            <div className="px-8 py-6 max-w-[1400px] mx-auto">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-panel">
      <div className="px-5 py-5 border-b border-border flex items-center gap-2">
        <div className="size-7 rounded bg-accent/15 border border-accent/40 grid place-items-center">
          <Activity className="size-4 text-accent" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">LexPulse</div>
          <div className="text-[10px] uppercase tracking-wider text-muted">litigation intel</div>
        </div>
      </div>
      <nav className="p-3 space-y-1 text-sm">
        <NavItem href="/" icon={<LayoutDashboard className="size-4" />} label="Dashboard" />
        <NavItem href="/search" icon={<Search className="size-4" />} label="Search" />
        <NavItem href="/alerts" icon={<Bell className="size-4" />} label="Alerts" />
      </nav>
      <div className="px-5 py-4 mt-4 text-[11px] text-muted leading-relaxed">
        v0.1 — heuristic risk model. Read{" "}
        <span className="text-fg/80">README.md</span> for scoring details.
      </div>
    </aside>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2 rounded-md text-fg/80 hover:bg-panel2 hover:text-fg transition"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function TopBar() {
  return (
    <div className="h-12 border-b border-border bg-panel/60 backdrop-blur flex items-center justify-between px-8">
      <div className="text-xs text-muted tracking-wider uppercase">Litigation intelligence</div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="size-1.5 rounded-full bg-ok inline-block" />
        live
      </div>
    </div>
  );
}
