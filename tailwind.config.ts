import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.25rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // Background sits just shy of black with a brand-hued tint —
        // pure #000 reads as harsh on financial-dashboard surfaces, but
        // we don't want it visibly blue either. Slight neutral warmth.
        bg: "hsl(225 16% 8%)",
        panel: "hsl(225 13% 11%)",
        panel2: "hsl(225 11% 14%)",
        border: "hsl(225 10% 19%)",
        muted: "hsl(225 8% 64%)",
        fg: "hsl(225 14% 95%)",
        // Accent: deliberately a sophisticated teal, not the neon cyan that
        // immediately reads as "AI-generated SaaS". Lower saturation, mid
        // value — distinct from band colors (ok green, warn amber, bad red).
        accent: "hsl(178 55% 50%)",
        ok: "hsl(155 55% 50%)",
        warn: "hsl(42 80% 58%)",
        bad: "hsl(0 72% 62%)",
        elev: "hsl(28 80% 58%)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        tight: "-0.011em",
      },
      boxShadow: {
        card: "0 1px 0 0 hsl(220 14% 18%) inset, 0 8px 24px -16px hsl(220 60% 2%)",
        glow: "0 0 0 1px hsl(190 95% 55% / 0.4), 0 0 24px -4px hsl(190 95% 55% / 0.4)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 240ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
