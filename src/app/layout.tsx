import type { Metadata } from "next";
import { IBM_Plex_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Bell, LayoutDashboard, Search, BarChart3 } from "lucide-react";

// Body sans: IBM Plex Sans. Distinctive corporate-gravitas voice; far
// less generic than Inter. Already common in serious finance/legal
// product lines (Bloomberg-adjacent, IBM Cloud) — fits the lineage we
// want. Has matching Plex Mono if we ever want full IBM-family
// consistency, but JetBrains Mono is more characterful for our
// numerics so we keep that.
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});
// Display: Fraunces (variable serif). Editorial weight, optical
// sizing, characterful at large sizes. Pairs the dashboard with a
// research-note voice for hero moments — calibration page, methodology
// numbers, dashboard lede. The "softness" axis is set to express
// (1) for warmth without veering into novelty.
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "LexPulse — litigation intelligence",
  description: "Company-level litigation risk for investors, strategy, insurers, and compliance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${display.variable} ${mono.variable}`}>
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
    <aside className="w-56 shrink-0 border-r border-border bg-panel/40 backdrop-blur-sm">
      <Link href="/" className="block px-5 py-6 border-b border-border group">
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
      <nav className="p-3 space-y-0.5 text-sm">
        <NavItem href="/" icon={<LayoutDashboard className="size-4" />} label="Dashboard" />
        <NavItem href="/search" icon={<Search className="size-4" />} label="Search" />
        <NavItem href="/alerts" icon={<Bell className="size-4" />} label="Alerts" />
        <NavItem href="/calibration" icon={<BarChart3 className="size-4" />} label="Calibration" />
        <NavItem href="/api" icon={<span className="font-mono text-xs">{`{}`}</span>} label="API" />
      </nav>
      <div className="px-5 py-4 mt-4 text-[11px] text-muted leading-relaxed border-t border-border font-display italic">
        <div className="not-italic text-fg/80 font-sans font-medium mb-1.5 text-xs">v3.0 · backtested</div>
        IC 0.06 at 180-day horizon vs SEC 8-K disclosures.{" "}
        <Link
          href="/calibration"
          className="not-italic text-accent hover:underline font-sans"
        >
          numbers →
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
    <div className="h-12 border-b border-border bg-panel/40 backdrop-blur flex items-center justify-between px-8">
      <div className="text-[10px] text-muted tracking-[0.32em] uppercase font-mono">
        Litigation Intelligence
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted font-mono tracking-[0.18em] uppercase">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
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
