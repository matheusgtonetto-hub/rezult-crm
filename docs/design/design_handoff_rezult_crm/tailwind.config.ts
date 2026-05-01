import type { Config } from "tailwindcss";

/**
 * Rezult CRM — Tailwind config
 *
 * Pairs with tokens.css. The CSS file owns the values; Tailwind exposes them
 * as utilities (text-rz-primary, bg-rz-surface, etc.) and re-uses the
 * shadcn aliases for zero-config compat with shadcn/ui.
 *
 * Usage:
 *   1. Drop tokens.css into app/globals.css (or import it there).
 *   2. Use this as your tailwind.config.ts.
 *   3. Toggle theme with <html data-theme="dark|light"> OR class="dark".
 */

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Rezult brand palette (raw values, theme-independent)
        rz: {
          green: {
            50:  "var(--rz-green-50)",
            100: "var(--rz-green-100)",
            200: "var(--rz-green-200)",
            300: "var(--rz-green-300)",
            400: "var(--rz-green-400)",
            500: "var(--rz-green-500)",
            600: "var(--rz-green-600)",
            700: "var(--rz-green-700)",
            800: "var(--rz-green-800)",
            900: "var(--rz-green-900)",
          },
          // Theme-aware semantic surfaces
          bg:           "var(--rz-bg)",
          surface:      "var(--rz-surface)",
          "surface-2":  "var(--rz-surface-2)",
          "surface-3":  "var(--rz-surface-3)",
          border:       "var(--rz-border)",
          "border-active": "var(--rz-border-active)",
          text:         "var(--rz-text)",
          "text-muted": "var(--rz-text-muted)",
          "text-subtle":"var(--rz-text-subtle)",
          primary:      "var(--rz-primary)",
          "primary-hover":  "var(--rz-primary-hover)",
          "primary-active": "var(--rz-primary-active)",
          "on-primary": "var(--rz-text-on-primary)",
          success: "var(--rz-success)",
          warning: "var(--rz-warning)",
          danger:  "var(--rz-danger)",
          info:    "var(--rz-info)",
          purple:  "var(--rz-purple)",
        },
        // shadcn aliases — kept for zero-config compatibility
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        xs: "var(--rz-radius-xs)",
        sm: "var(--rz-radius-sm)",
        md: "var(--rz-radius-md)",
        lg: "var(--rz-radius-lg)",
        xl: "var(--rz-radius-xl)",
        DEFAULT: "var(--rz-radius)",
      },
      boxShadow: {
        "rz-sm": "var(--rz-shadow-sm)",
        "rz-md": "var(--rz-shadow-md)",
        "rz-lg": "var(--rz-shadow-lg)",
        "rz-glow": "var(--rz-shadow-glow)",
      },
      transitionTimingFunction: {
        rz: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      keyframes: {
        "rz-pulse": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
        "rz-glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 16px var(--rz-glow)" },
          "50%":      { boxShadow: "0 0 32px var(--rz-glow)" },
        },
      },
      animation: {
        "rz-pulse": "rz-pulse 1.4s var(--rz-ease) infinite",
        "rz-glow":  "rz-glow-pulse 2.4s var(--rz-ease) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
