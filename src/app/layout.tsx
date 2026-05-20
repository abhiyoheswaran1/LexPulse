import type { Metadata } from "next";
import { IBM_Plex_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/AppChrome";

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
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
