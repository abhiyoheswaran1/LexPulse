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
        // Warm-neutral dark background with the slightest hue. Stays out of
        // both "cyan terminal" and "purple AI gradient" stylistic clichés.
        bg: "hsl(35 8% 9%)",
        panel: "hsl(35 7% 12%)",
        panel2: "hsl(35 6% 15%)",
        border: "hsl(35 6% 21%)",
        muted: "hsl(35 8% 64%)",
        fg: "hsl(40 14% 94%)",
        // Accent: amber. Bloomberg-terminal lineage. Distinctive against
        // dark warm-neutrals, doesn't read as AI cyan or AI purple. Mid
        // value, slightly desaturated for sophistication.
        accent: "hsl(38 88% 58%)",
        // Bands stay semantic. ok/warn/bad/elev each in a clearly distinct
        // hue from accent and from each other.
        ok: "hsl(150 50% 50%)",
        warn: "hsl(50 80% 58%)",
        bad: "hsl(0 72% 60%)",
        // elev (medium-risk band color) shifts toward magenta to give the
        // band ramp a clear orange→amber→magenta progression — keeps amber
        // (accent) visually separate from the warning ramp.
        elev: "hsl(330 60% 60%)",
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
