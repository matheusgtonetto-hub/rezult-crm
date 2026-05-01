/**
 * Rezult CRM — Design tokens as a TS object.
 * Use when you need to reference values from JS/TS code (charts,
 * canvas, SVG fills, motion configs) instead of CSS.
 *
 * For style-side work, prefer Tailwind classes (bg-rz-primary, etc.)
 * or CSS vars (var(--rz-primary)) — they auto-flip with theme.
 */

export const tokens = {
  brand: {
    name: "Rezult",
    direction: "moderno · neon · geist · outline",
    tagline: "Do clique ao fechamento.",
  },

  color: {
    green: {
      50:  "#E6FFF5",
      100: "#B8FFE0",
      200: "#7AFFCB",
      300: "#33F5AE",
      400: "#00E599", // neon — primary in dark
      500: "#00C77F", // esmeralda — primary in light
      600: "#00A368",
      700: "#007D4F",
      800: "#005536",
      900: "#002E1D",
    },
    semantic: {
      success: "#00C77F",
      warning: "#F59E0B",
      danger:  "#EF4444",
      info:    "#3B82F6",
      purple:  "#A855F7",
    },
    dark: {
      bg:          "#070A09",
      surface:     "#0E1310",
      surface2:    "#161C18",
      surface3:    "#1F2722",
      border:      "rgba(255,255,255,0.08)",
      borderActive:"rgba(0,229,153,0.4)",
      text:        "#F4F2EC",
      textMuted:   "rgba(244,242,236,0.62)",
      textSubtle:  "rgba(244,242,236,0.36)",
      primary:     "#00E599",
      primaryHover:"#33F5AE",
      onPrimary:   "#001A0F",
      glow:        "rgba(0,229,153,0.5)",
    },
    light: {
      bg:          "#FAFAF7",
      surface:     "#FFFFFF",
      surface2:    "#F4F2EC",
      surface3:    "#E8E5DC",
      border:      "rgba(0,0,0,0.08)",
      borderActive:"rgba(0,199,127,0.5)",
      text:        "#0E1310",
      textMuted:   "rgba(14,19,16,0.64)",
      textSubtle:  "rgba(14,19,16,0.40)",
      primary:     "#00C77F",
      primaryHover:"#00A368",
      onPrimary:   "#FFFFFF",
      glow:        "rgba(0,199,127,0.25)",
    },
  },

  font: {
    sans: "Geist, ui-sans-serif, system-ui, sans-serif",
    mono: "Geist Mono, ui-monospace, monospace",
    scale: {
      // size / line-height / letter-spacing / weight
      display: { size: 64, lh: 1.05, ls: "-0.04em", weight: 600 }, // hero
      h1:      { size: 48, lh: 1.1,  ls: "-0.035em", weight: 600 },
      h2:      { size: 32, lh: 1.2,  ls: "-0.025em", weight: 600 },
      h3:      { size: 22, lh: 1.3,  ls: "-0.02em",  weight: 600 },
      title:   { size: 16, lh: 1.4,  ls: "-0.015em", weight: 600 },
      body:    { size: 14, lh: 1.55, ls: "-0.005em", weight: 400 },
      small:   { size: 12, lh: 1.5,  ls: "0",        weight: 400 },
      eyebrow: { size: 10, lh: 1.4,  ls: "0.14em",   weight: 500, transform: "uppercase", font: "mono" },
    },
  },

  radius: { xs: 4, sm: 6, md: 10, lg: 16, xl: 24 },

  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },

  shadow: {
    sm:   "0 1px 2px rgba(0,0,0,0.05)",
    md:   "0 4px 12px rgba(0,0,0,0.08)",
    lg:   "0 12px 32px rgba(0,0,0,0.12)",
    glow: "0 0 24px var(--rz-glow)",
  },

  motion: {
    ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    duration: { fast: 120, base: 200, slow: 400 },
  },
} as const;

export type Tokens = typeof tokens;
