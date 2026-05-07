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
        bg: "hsl(220 18% 7%)",
        panel: "hsl(220 16% 10%)",
        panel2: "hsl(220 14% 13%)",
        border: "hsl(220 12% 18%)",
        muted: "hsl(220 8% 60%)",
        fg: "hsl(220 15% 92%)",
        accent: "hsl(190 95% 55%)",
        ok: "hsl(150 70% 45%)",
        warn: "hsl(45 95% 55%)",
        bad: "hsl(0 80% 60%)",
        elev: "hsl(28 90% 58%)",
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: "0 1px 0 0 hsl(220 14% 18%) inset, 0 8px 24px -16px hsl(220 60% 2%)",
      },
    },
  },
  plugins: [],
};

export default config;
