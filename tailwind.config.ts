import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // TheBRB brand: bold red on dark
        brb: {
          red: "#E10600",         // primary action red
          redHover: "#C00500",    // pressed/hover state
          redGlow: "#FF1A0E",     // accent glow
          bg: "#0A0A0B",          // app background (near-black)
          surface: "#141416",     // card / panel surface
          border: "#26262B",      // hairline borders
          muted: "#8A8A93",       // secondary text
          text: "#F5F5F7",        // primary text on dark
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      boxShadow: {
        "red-glow": "0 0 0 4px rgba(225, 6, 0, 0.15), 0 8px 32px rgba(225, 6, 0, 0.35)",
      },
      animation: {
        "pulse-red": "pulse-red 2s ease-in-out infinite",
      },
      keyframes: {
        "pulse-red": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(225, 6, 0, 0.6)" },
          "50%": { boxShadow: "0 0 0 16px rgba(225, 6, 0, 0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
