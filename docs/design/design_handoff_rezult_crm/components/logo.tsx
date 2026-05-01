// =============================================================
// Rezult CRM — SVG logos
// All four variants from the brandbook, exported as React components.
// They use currentColor / theme vars so they auto-adapt to the theme.
// =============================================================

import * as React from "react";

type LogoProps = React.SVGProps<SVGSVGElement> & { size?: number };

// 1) Filled monogram — gradient mark + wordmark. Default product logo.
export function RezultLogoFilled({ size = 32, ...rest }: LogoProps) {
  return (
    <svg width={size * 3.5} height={size} viewBox="0 0 112 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <defs>
        <linearGradient id="rz-fill-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--rz-green-300, #33F5AE)" />
          <stop offset="100%" stopColor="var(--rz-green-500, #00C77F)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#rz-fill-grad)" />
      <path
        d="M9 9h7.4c2.7 0 4.7 1.7 4.7 4.3 0 1.9-1 3.3-2.6 4l3.4 5.7H18l-2.9-5h-3v5H9V9zm6.9 5.6c1.2 0 2-0.6 2-1.6s-0.8-1.6-2-1.6h-3.8v3.2h3.8z"
        fill="var(--rz-text-on-primary, #001A0F)"
      />
      <text x="40" y="22" fill="currentColor" fontFamily="Geist, sans-serif" fontSize="16" fontWeight="600" letterSpacing="-0.025em">
        Rezult
      </text>
    </svg>
  );
}

// 2) Outline monogram — neon ring. Hero / dark surfaces.
export function RezultLogoOutline({ size = 32, ...rest }: LogoProps) {
  return (
    <svg width={size * 3.5} height={size} viewBox="0 0 112 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="7.25" stroke="var(--rz-primary, #00E599)" strokeWidth="1.5" />
      <path
        d="M9 9h7.4c2.7 0 4.7 1.7 4.7 4.3 0 1.9-1 3.3-2.6 4l3.4 5.7H18l-2.9-5h-3v5H9V9zm6.9 5.6c1.2 0 2-0.6 2-1.6s-0.8-1.6-2-1.6h-3.8v3.2h3.8z"
        fill="var(--rz-primary, #00E599)"
      />
      <text x="40" y="22" fill="currentColor" fontFamily="Geist, sans-serif" fontSize="16" fontWeight="600" letterSpacing="-0.025em">
        Rezult
      </text>
    </svg>
  );
}

// 3) Glyph only — favicon, app icon, small surfaces.
export function RezultGlyph({ size = 32, ...rest }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <defs>
        <linearGradient id="rz-glyph-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--rz-green-300, #33F5AE)" />
          <stop offset="100%" stopColor="var(--rz-green-500, #00C77F)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#rz-glyph-grad)" />
      <path
        d="M9 9h7.4c2.7 0 4.7 1.7 4.7 4.3 0 1.9-1 3.3-2.6 4l3.4 5.7H18l-2.9-5h-3v5H9V9zm6.9 5.6c1.2 0 2-0.6 2-1.6s-0.8-1.6-2-1.6h-3.8v3.2h3.8z"
        fill="var(--rz-text-on-primary, #001A0F)"
      />
    </svg>
  );
}

// 4) Wordmark only — narrow surfaces, footers.
export function RezultWordmark({ size = 24, ...rest }: LogoProps) {
  return (
    <svg width={size * 4} height={size} viewBox="0 0 96 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>
      <text x="0" y="18" fill="currentColor" fontFamily="Geist, sans-serif" fontSize="18" fontWeight="600" letterSpacing="-0.03em">
        Rezult
      </text>
      <circle cx="80" cy="11" r="3" fill="var(--rz-primary, #00E599)" style={{ filter: "drop-shadow(0 0 6px var(--rz-glow))" }} />
    </svg>
  );
}
