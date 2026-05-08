import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Activity, Bell, LayoutDashboard, Search } from "lucide-react";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "LexPulse — litigation intelligence",
  description: "Company-level litigation risk for investors, strategy, insurers, and compliance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <TopBar />
            <div className="px-8 py-8 max-w-[1400px] mx-auto">{children}</div>
            <Footer />
          </main>
        </div>
      </body>
    </html>
  );
}

function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-panel">
      <div className="px-5 py-5 border-b border-border flex items-center gap-2.5">
        <div className="size-8 rounded-md bg-panel2 border border-accent/40 grid place-items-center">
          <Activity className="size-4 text-accent" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight font-display">LexPulse</div>
          <div className="text-xs uppercase tracking-[0.14em] text-muted">litigation intel</div>
        </div>
      </div>
      <nav className="p-3 space-y-0.5 text-sm">
        <NavItem href="/" icon={<LayoutDashboard className="size-4" />} label="Dashboard" />
        <NavItem href="/search" icon={<Search className="size-4" />} label="Search" />
        <NavItem href="/alerts" icon={<Bell className="size-4" />} label="Alerts" />
        <NavItem href="/api" icon={<span className="font-mono text-xs">{`{}`}</span>} label="API" />
      </nav>
      <div className="px-5 py-4 mt-4 text-xs text-muted leading-relaxed border-t border-border">
        <div className="text-fg/80 font-medium mb-1">v3.0 methodology</div>
        Federal civil dockets only. Methodology doc:{" "}
        <Link
          href="https://github.com/abhiyoheswaran1/LexPulse/blob/main/docs/methodology/risk-score-v3.md"
          className="text-accent hover:underline"
        >
          read →
        </Link>
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
      <span className="grid size-5 place-items-center text-muted">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function TopBar() {
  return (
    <div className="h-12 border-b border-border bg-panel/60 backdrop-blur flex items-center justify-between px-8">
      <div className="text-xs text-muted tracking-[0.16em] uppercase">Litigation intelligence</div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
        </span>
        live
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-border bg-panel/40 px-8 py-6 text-xs text-muted">
      <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4">
        <div>
          Litigation data via{" "}
          <Link href="https://www.courtlistener.com/" className="text-fg/80 hover:text-accent">
            CourtListener / Free Law Project
          </Link>
          , licensed CC BY-ND 4.0.
        </div>
        <div className="flex items-center gap-4">
          <Link href="/api" className="hover:text-fg">API</Link>
          <Link
            href="https://github.com/abhiyoheswaran1/LexPulse"
            className="hover:text-fg"
          >
            GitHub
          </Link>
          <span className="text-muted/60">v0.3 · LexPulse</span>
        </div>
      </div>
    </footer>
  );
}
