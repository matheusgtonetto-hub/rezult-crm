// Rezult CRM Product Prototype — tokens & shared primitives
// Locked aesthetic from brandbook: dark · neon · geist · outline · radius 12 · moderno

const TOKENS = {
  c: {
    primary:      "#00E599",
    primaryHover: "#00C885",
    primarySoft:  "#7CFFCB",
    accent:       "#7CFFCB",
    glow:         "rgba(0,229,153,.32)",
    glowStrong:   "rgba(0,229,153,.55)",

    bg:           "#070A09",
    bgElevated:   "#0C100E",
    surface:      "#0F1412",
    surface2:     "#161D1A",
    surface3:     "#1D2622",
    surfaceHover: "#1A2421",

    border:       "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.16)",
    borderActive: "rgba(0,229,153,0.5)",

    text:         "#F4F2EC",
    textMuted:    "rgba(244,242,236,0.62)",
    textSubtle:   "rgba(244,242,236,0.38)",
    textOnPrimary:"#06120D",

    success:      "#00E599",
    successBg:    "rgba(0,229,153,0.12)",
    warning:      "#F59E0B",
    warningBg:    "rgba(245,158,11,0.14)",
    danger:       "#EF4444",
    dangerBg:     "rgba(239,68,68,0.14)",
    info:         "#3B82F6",
    infoBg:       "rgba(59,130,246,0.14)",
    purple:       "#A855F7",
    purpleBg:     "rgba(168,85,247,0.14)",
  },
  font: {
    sans: "'Geist', ui-sans-serif, system-ui, sans-serif",
    mono: "'Geist Mono', ui-monospace, monospace",
  },
  r: { sm: 8, md: 12, lg: 16, xl: 20 },
};

// ── Logo (outline neon) ─────────────────────────────────────────────────
function Logo({ size = 32, showWordmark = true }) {
  const t = TOKENS;
  const radius = Math.round((size / 64) * 14);
  const monoSize = Math.round(size * 0.42);
  const Icon = (
    <div style={{ width: size, height: size, borderRadius: radius, border: `1.5px solid ${t.c.primary}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: `0 0 24px ${t.c.glow}` }}>
      <span style={{ fontFamily: t.font.sans, fontWeight: 700, fontSize: monoSize, color: t.c.primary, letterSpacing: "-0.04em", lineHeight: 1 }}>RZ</span>
    </div>
  );
  if (!showWordmark) return Icon;
  const wordmarkSize = Math.round(size * 0.62);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.32) }}>
      {Icon}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: wordmarkSize, letterSpacing: "-0.04em", lineHeight: 0.95, color: t.c.text }}>
          Re<span style={{ color: t.c.primary }}>zult</span>
        </span>
        <div style={{ fontFamily: t.font.sans, fontSize: Math.max(9, Math.round(size * 0.16)), letterSpacing: "0.32em", textTransform: "uppercase", color: t.c.textSubtle, fontWeight: 500 }}>CRM</div>
      </div>
    </div>
  );
}

// ── Avatar with initials & color from name ─────────────────────────────
function Avatar({ name, size = 32, square }) {
  const t = TOKENS;
  const initials = name.split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();
  const palette = ["#00E599", "#3B82F6", "#A855F7", "#F59E0B", "#EC4899", "#06B6D4"];
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const c = palette[hash % palette.length];
  return (
    <div style={{
      width: size, height: size,
      borderRadius: square ? TOKENS.r.sm : "50%",
      background: `linear-gradient(135deg, ${c}, ${c}aa)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#06120D",
      fontFamily: t.font.sans, fontWeight: 600, fontSize: Math.round(size * 0.4),
      letterSpacing: "-0.02em",
      flexShrink: 0,
    }}>{initials}</div>
  );
}

// ── Icon set (consistent stroke 1.6) ───────────────────────────────────
const ICONS = {
  pipeline:   <><path d="M4 6h16M4 12h12M4 18h8" strokeLinecap="round" /></>,
  lead:       <><circle cx="12" cy="9" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" /></>,
  whatsapp:   <><path d="M5 19l1.4-3.5A7 7 0 1 1 9 18.5L5 19z" strokeLinejoin="round" /><path d="M9.5 11.5c.5 1.2 1.5 2.2 2.7 2.7l1-1c.3-.3.7-.3 1 0 .8.4 1.6.6 2.2.7" /></>,
  automation: <><path d="M12 4v4m0 8v4M4 12h4m8 0h4" strokeLinecap="round" /><circle cx="12" cy="12" r="3" /></>,
  agent:      <><rect x="5" y="6" width="14" height="12" rx="3" /><circle cx="9" cy="12" r="1.2" fill="currentColor" /><circle cx="15" cy="12" r="1.2" fill="currentColor" /><path d="M12 3v3" strokeLinecap="round" /></>,
  trending:   <><path d="M3 17l5-5 4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 7h6v6" strokeLinecap="round" strokeLinejoin="round" /></>,
  plug:       <><path d="M9 3v6m6-6v6M6 9h12v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9zm6 7v5" strokeLinecap="round" strokeLinejoin="round" /></>,
  search:     <><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" strokeLinecap="round" /></>,
  bell:       <><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 6 1.5 6h-15S6 13 6 9z" strokeLinejoin="round" /><path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" /></>,
  settings:   <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" strokeLinejoin="round" /></>,
  plus:       <><path d="M12 5v14M5 12h14" strokeLinecap="round" /></>,
  arrowRight: <><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></>,
  arrowUp:    <><path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" /></>,
  arrowDown:  <><path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></>,
  filter:     <><path d="M3 6h18l-7 8v6l-4-2v-4L3 6z" strokeLinejoin="round" /></>,
  more:       <><circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/></>,
  check:      <><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></>,
  x:          <><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></>,
  send:       <><path d="M5 12l15-7-7 15-2-7-6-1z" strokeLinejoin="round" /></>,
  paperclip:  <><path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" strokeLinecap="round" strokeLinejoin="round" /></>,
  smile:      <><circle cx="12" cy="12" r="9" /><path d="M9 14c1 1.2 2 1.8 3 1.8s2-.6 3-1.8M9 9.5h.01M15 9.5h.01" strokeLinecap="round" /></>,
  phone:      <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" strokeLinejoin="round"/></>,
  star:       <><path d="M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5-5.5-3.5L6.5 20.5 8 14l-5-4.5 6.5-.5L12 3z" strokeLinejoin="round" /></>,
  flame:      <><path d="M12 3s4 4 4 8a4 4 0 1 1-8 0c0-2 1-3 1-3s0 2 1.5 2.5C10 8 8 6 12 3z" strokeLinejoin="round" /></>,
  chart:      <><path d="M3 20h18M7 16V10M12 16V6M17 16v-4" strokeLinecap="round" /></>,
  meta:       <><path d="M3 12c1-5 4-7 6-7 3 0 5 3 6 6 1-3 3-6 6-6 2 0 5 2 6 7" strokeLinecap="round" /></>,
  google:     <><circle cx="12" cy="12" r="9" /><path d="M12 8v4h5" strokeLinecap="round" /></>,
  zap:        <><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" strokeLinejoin="round" /></>,
  clock:      <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" /></>,
  mail:       <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" /></>,
  building:   <><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" strokeLinecap="round" /></>,
};

function Icon({ name, size = 16, color, stroke = 1.6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={stroke} style={{ flexShrink: 0 }}>
      {ICONS[name]}
    </svg>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────
function Badge({ tone = "neutral", children, dot }) {
  const t = TOKENS;
  const tones = {
    success: { bg: t.c.successBg, fg: t.c.success },
    warning: { bg: t.c.warningBg, fg: t.c.warning },
    danger:  { bg: t.c.dangerBg,  fg: t.c.danger  },
    info:    { bg: t.c.infoBg,    fg: t.c.info    },
    purple:  { bg: t.c.purpleBg,  fg: t.c.purple  },
    neutral: { bg: t.c.surface2,  fg: t.c.textMuted },
  }[tone];
  return (
    <span style={{ background: tones.bg, color: tones.fg, padding: "3px 10px", borderRadius: 100, fontFamily: t.font.sans, fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: tones.fg }} />}
      {children}
    </span>
  );
}

// ── Button ────────────────────────────────────────────────────────────
function Btn({ variant = "primary", children, icon, onClick, size = "md", style }) {
  const t = TOKENS;
  const variants = {
    primary:   { background: t.c.primary, color: t.c.textOnPrimary, border: "none", boxShadow: `0 0 0 1px ${t.c.primary}, 0 6px 20px ${t.c.glow}` },
    secondary: { background: t.c.surface2, color: t.c.text, border: `1px solid ${t.c.border}` },
    outline:   { background: "transparent", color: t.c.primary, border: `1px solid ${t.c.primary}` },
    ghost:     { background: "transparent", color: t.c.text, border: "none" },
    danger:    { background: t.c.danger, color: "#fff", border: "none" },
  }[variant];
  const sizes = { sm: { padding: "6px 12px", fontSize: 12 }, md: { padding: "9px 16px", fontSize: 13 }, lg: { padding: "12px 22px", fontSize: 14 } }[size];
  return (
    <button onClick={onClick} style={{
      ...variants, ...sizes,
      borderRadius: t.r.md,
      fontFamily: t.font.sans, fontWeight: 500, cursor: "pointer",
      display: "inline-flex", alignItems: "center", gap: 8,
      letterSpacing: "-0.005em", transition: "transform .12s, opacity .12s",
      ...style,
    }}
    onMouseEnter={e => { if (variant === "primary") e.currentTarget.style.transform = "translateY(-1px)"; }}
    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
      {icon && <Icon name={icon} size={size === "sm" ? 12 : 14} />}
      {children}
    </button>
  );
}

Object.assign(window, { TOKENS, Logo, Avatar, Icon, ICONS, Badge, Btn });
