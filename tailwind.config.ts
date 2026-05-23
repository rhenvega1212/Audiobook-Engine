import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#F8F4ED",
        "warm-sand": "#E8DCC7",
        burgundy: "#6B1F2C",
        "dark-red": "#4A1620",
        teal: "#2D6E6E",
        sage: "#9CA88E",
        ink: "#1F1A17",
        slate: "#5C534E",
        bone: "#FFFBF5",
        border: "#D9CFC0",
        "border-muted": "#E8DCC7",
        success: "#3B7A4E",
        warning: "#B8842B",
        danger: "#A8362A",
        "ai-reviewed": "#5E4B8B",
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        input: "var(--input)",
        ring: "var(--ring)",
      },
      fontFamily: {
        serif: ["var(--font-lora)", "Georgia", "serif"],
        sans: ["var(--font-poppins)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      fontSize: {
        display: ["36px", { lineHeight: "1.2", fontWeight: "600" }],
        h1: ["28px", { lineHeight: "1.25", fontWeight: "600" }],
        h2: ["22px", { lineHeight: "1.3", fontWeight: "600" }],
        h3: ["16px", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["15px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-sm": ["13px", { lineHeight: "1.5", fontWeight: "400" }],
        label: ["12px", { lineHeight: "1.4", fontWeight: "500", letterSpacing: "0.05em" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(31, 26, 23, 0.05)",
        md: "0 4px 6px -1px rgba(31, 26, 23, 0.08), 0 2px 4px -2px rgba(31, 26, 23, 0.05)",
        lg: "0 10px 15px -3px rgba(31, 26, 23, 0.1), 0 4px 6px -4px rgba(31, 26, 23, 0.05)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
