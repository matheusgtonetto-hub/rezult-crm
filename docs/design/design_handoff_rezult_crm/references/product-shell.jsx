// Rezult CRM Product — App shell (sidebar + topbar + screen router)

const NAV = [
  { id: "pipeline",    name: "Pipeline",     icon: "pipeline" },
  { id: "leads",       name: "Leads",        icon: "lead" },
  { id: "inbox",       name: "WhatsApp",     icon: "whatsapp", count: 7 },
  { id: "agents",      name: "Agentes IA",   icon: "agent" },
  { id: "automations", name: "Automações",   icon: "automation" },
  { id: "reports",     name: "Relatórios",   icon: "trending" },
  { id: "connections", name: "Conexões",     icon: "plug" },
];

function Sidebar({ current, onNav }) {
  const t = TOKENS;
  return (
    <aside style={{ width: 232, background: t.c.surface, borderRight: `1px solid ${t.c.border}`, padding: "20px 14px", display: "flex", flexDirection: "column", gap: 24, flexShrink: 0 }}>
      <div style={{ padding: "0 6px" }}>
        <Logo size={30} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(it => {
          const active = it.id === current;
          return (
            <div key={it.id} onClick={() => onNav(it.id)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: t.r.md,
              background: active ? t.c.surface2 : "transparent",
              color: active ? t.c.primary : t.c.textMuted,
              fontFamily: t.font.sans, fontSize: 13, fontWeight: active ? 500 : 400,
              cursor: "pointer", position: "relative",
              borderLeft: active ? `2px solid ${t.c.primary}` : "2px solid transparent",
              paddingLeft: active ? 10 : 12,
              transition: "background .15s, color .15s",
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = t.c.surface2; e.currentTarget.style.color = t.c.text; }}}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.c.textMuted; }}}>
              <Icon name={it.icon} size={16} />
              <span style={{ flex: 1 }}>{it.name}</span>
              {it.count != null && (
                <span style={{ background: t.c.primary, color: t.c.textOnPrimary, fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 100, fontFamily: t.font.mono }}>{it.count}</span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ padding: 14, background: `linear-gradient(135deg, ${t.c.surface2}, ${t.c.surface3})`, borderRadius: t.r.md, border: `1px solid ${t.c.border}`, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 100% 0%, ${t.c.glow}, transparent 60%)`, pointerEvents: "none" }} />
          <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: t.c.primary, marginBottom: 8, position: "relative" }}>Plano Pro</div>
          <div style={{ fontFamily: t.font.sans, fontSize: 12, color: t.c.text, fontWeight: 500, marginBottom: 8, position: "relative" }}>284 / 500 leads</div>
          <div style={{ height: 4, background: t.c.surface3, borderRadius: 100, overflow: "hidden", position: "relative" }}>
            <div style={{ width: "57%", height: "100%", background: t.c.primary, boxShadow: `0 0 8px ${t.c.glow}` }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px" }}>
          <Avatar name="Pedro Almeida" size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.font.sans, fontSize: 12, fontWeight: 500, color: t.c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Pedro Almeida</div>
            <div style={{ fontFamily: t.font.sans, fontSize: 10, color: t.c.textSubtle }}>Agência X</div>
          </div>
          <Icon name="settings" size={14} color={TOKENS.c.textSubtle} />
        </div>
      </div>
    </aside>
  );
}

function Topbar({ title, kicker, actions }) {
  const t = TOKENS;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", borderBottom: `1px solid ${t.c.border}`, background: t.c.bg, position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(20px)" }}>
      <div>
        {kicker && <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase" }}>{kicker}</div>}
        <h2 style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 22, letterSpacing: "-0.025em", color: t.c.text, margin: kicker ? "4px 0 0" : 0 }}>{title}</h2>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: "7px 12px", width: 220 }}>
          <Icon name="search" size={14} color={t.c.textSubtle} />
          <input placeholder="Buscar leads, deals…" style={{ background: "transparent", border: "none", outline: "none", color: t.c.text, fontFamily: t.font.sans, fontSize: 12, flex: 1, minWidth: 0 }} />
          <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.c.textSubtle, padding: "1px 5px", border: `1px solid ${t.c.border}`, borderRadius: 4 }}>⌘K</span>
        </div>
        <button style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.c.textMuted, position: "relative" }}>
          <Icon name="bell" size={15} />
          <span style={{ position: "absolute", top: 7, right: 7, width: 6, height: 6, borderRadius: "50%", background: t.c.primary, boxShadow: `0 0 8px ${t.c.primary}` }} />
        </button>
        {actions}
      </div>
    </div>
  );
}

function Shell({ current, onNav, children }) {
  const t = TOKENS;
  return (
    <div style={{ display: "flex", height: "100vh", background: t.c.bg, color: t.c.text, fontFamily: t.font.sans, overflow: "hidden" }}>
      <Sidebar current={current} onNav={onNav} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, Shell, NAV });
