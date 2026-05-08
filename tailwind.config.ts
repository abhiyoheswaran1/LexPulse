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
        // Tinted toward our accent hue for warmth — pure-black backgrounds
        // read as harsh on financial-dashboard surfaces, slight brand tint
        // makes the panel hierarchy more legible.
        bg: "hsl(220 22% 6%)",
        panel: "hsl(220 18% 9%)",
        panel2: "hsl(220 16% 12%)",
        border: "hsl(220 14% 17%)",
        muted: "hsl(220 8% 62%)",
        fg: "hsl(220 15% 94%)",
        accent: "hsl(190 95% 55%)",
        ok: "hsl(150 70% 48%)",
        warn: "hsl(45 95% 58%)",
        bad: "hsl(0 80% 62%)",
        elev: "hsl(28 92% 60%)",
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
