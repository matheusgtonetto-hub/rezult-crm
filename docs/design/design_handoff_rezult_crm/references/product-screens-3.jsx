// Rezult CRM Product — Automations (node-based) + Reports + Connections

function AutomationsScreen() {
  const t = TOKENS;
  // Node positions in a 1100x460 canvas
  const nodes = [
    { id: "trig",  x: 40,  y: 200, w: 220, h: 90, kind: "trigger",  icon: "meta",       title: "Lead Ad · Meta Ads", sub: "Campanha 'Logística PRO'" },
    { id: "cond",  x: 320, y: 200, w: 220, h: 90, kind: "condition", icon: "filter",    title: "Se score > 60", sub: "Condição IA" },
    { id: "act1",  x: 600, y: 80,  w: 240, h: 110, kind: "action",   icon: "agent",     title: "Sofia inicia conversa", sub: "WhatsApp · Template 'oi-traf'" },
    { id: "act2",  x: 600, y: 320, w: 240, h: 90,  kind: "action",   icon: "mail",      title: "Email nutrição D0", sub: "Sequence 'baixo-score'" },
    { id: "wait",  x: 900, y: 80,  w: 180, h: 90,  kind: "delay",    icon: "clock",     title: "Aguarda resposta", sub: "Timeout 24h" },
  ];
  const edges = [
    { from: "trig", to: "cond", label: "" },
    { from: "cond", to: "act1", label: "TRUE" },
    { from: "cond", to: "act2", label: "FALSE" },
    { from: "act1", to: "wait", label: "" },
  ];

  const nodeStyle = (kind) => {
    const map = {
      trigger:   { color: t.c.primary, label: "GATILHO" },
      condition: { color: t.c.warning, label: "CONDIÇÃO" },
      action:    { color: t.c.info,    label: "AÇÃO" },
      delay:     { color: t.c.purple,  label: "DELAY" },
    };
    return map[kind];
  };

  const getEdgePath = (from, to) => {
    const f = nodes.find(n => n.id === from);
    const tn = nodes.find(n => n.id === to);
    const x1 = f.x + f.w, y1 = f.y + f.h / 2;
    const x2 = tn.x, y2 = tn.y + tn.h / 2;
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  };

  return (
    <>
      <Topbar
        kicker="Automação · Qualificação Tráfego Pago"
        title="Builder de fluxo"
        actions={<>
          <Btn variant="secondary" size="md">Histórico</Btn>
          <Btn variant="outline" size="md">Testar</Btn>
          <Btn variant="primary" icon="zap" size="md">Publicar</Btn>
        </>}
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "240px 1fr", overflow: "hidden" }}>
        {/* Node palette */}
        <aside style={{ background: t.c.surface, borderRight: `1px solid ${t.c.border}`, padding: 18, overflow: "auto" }}>
          <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.16em", color: t.c.textSubtle, textTransform: "uppercase", marginBottom: 12 }}>Blocos</div>
          {[
            { kind: "trigger", items: [["meta", "Meta Lead Ad"], ["google", "Google Form"], ["plug", "Webhook"]] },
            { kind: "condition", items: [["filter", "If/Else"], ["agent", "Score IA"]] },
            { kind: "action", items: [["whatsapp", "Enviar WhatsApp"], ["mail", "Enviar email"], ["agent", "Atribuir agente IA"], ["lead", "Mover de etapa"]] },
            { kind: "delay", items: [["clock", "Aguardar X tempo"], ["clock", "Aguardar resposta"]] },
          ].map((group, gi) => {
            const meta = nodeStyle(group.kind);
            return (
              <div key={gi} style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.14em", color: meta.color, textTransform: "uppercase", marginBottom: 8 }}>{meta.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {group.items.map(([icon, name], i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: t.c.surface2, border: `1px solid ${t.c.border}`, borderRadius: t.r.sm, cursor: "grab", fontFamily: t.font.sans, fontSize: 12, color: t.c.text }}>
                      <Icon name={icon} size={13} color={meta.color} />
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </aside>

        {/* Canvas */}
        <div style={{ position: "relative", background: t.c.bg, overflow: "auto", backgroundImage: `radial-gradient(circle, ${t.c.border} 1px, transparent 1px)`, backgroundSize: "24px 24px" }}>
          <div style={{ position: "relative", width: 1140, height: 500, margin: 24 }}>
            <svg width="1140" height="500" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0 0 L10 5 L0 10 z" fill={t.c.primary} />
                </marker>
              </defs>
              {edges.map((e, i) => (
                <g key={i}>
                  <path d={getEdgePath(e.from, e.to)} stroke={t.c.primary} strokeWidth="1.5" fill="none" markerEnd="url(#arr)" style={{ filter: `drop-shadow(0 0 4px ${t.c.glow})` }} />
                  {e.label && (() => {
                    const f = nodes.find(n => n.id === e.from);
                    const tn = nodes.find(n => n.id === e.to);
                    const mx = (f.x + f.w + tn.x) / 2;
                    const my = (f.y + f.h / 2 + tn.y + tn.h / 2) / 2;
                    return (
                      <g>
                        <rect x={mx - 22} y={my - 10} width="44" height="20" rx="10" fill={t.c.surface2} stroke={t.c.border} />
                        <text x={mx} y={my + 4} textAnchor="middle" fontSize="10" fontFamily={t.font.mono} fill={e.label === "TRUE" ? t.c.primary : t.c.danger} letterSpacing="0.08em">{e.label}</text>
                      </g>
                    );
                  })()}
                </g>
              ))}
            </svg>

            {nodes.map(n => {
              const meta = nodeStyle(n.kind);
              return (
                <div key={n.id} style={{
                  position: "absolute", left: n.x, top: n.y, width: n.w,
                  background: t.c.surface, border: `1px solid ${n.id === "act1" ? t.c.borderActive : t.c.border}`,
                  borderRadius: t.r.md, padding: 14,
                  boxShadow: n.id === "act1" ? `0 0 0 3px ${t.c.glow}` : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: meta.color + "22", display: "flex", alignItems: "center", justifyContent: "center", color: meta.color }}>
                      <Icon name={n.icon} size={13} />
                    </div>
                    <span style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.14em", color: meta.color, textTransform: "uppercase" }}>{meta.label}</span>
                    <span style={{ marginLeft: "auto" }}><Icon name="more" size={12} color={t.c.textSubtle} /></span>
                  </div>
                  <div style={{ fontFamily: t.font.sans, fontWeight: 500, fontSize: 13, color: t.c.text, letterSpacing: "-0.01em" }}>{n.title}</div>
                  <div style={{ fontFamily: t.font.sans, fontSize: 11, color: t.c.textMuted, marginTop: 3 }}>{n.sub}</div>
                  {/* I/O dots */}
                  {n.kind !== "trigger" && <div style={{ position: "absolute", left: -5, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: t.c.surface, border: `1.5px solid ${t.c.primary}` }} />}
                  <div style={{ position: "absolute", right: -5, top: "50%", transform: "translateY(-50%)", width: 10, height: 10, borderRadius: "50%", background: t.c.primary, boxShadow: `0 0 8px ${t.c.glow}` }} />
                </div>
              );
            })}
          </div>

          {/* Floating stats */}
          <div style={{ position: "absolute", bottom: 20, right: 20, background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: 14, display: "flex", gap: 24, backdropFilter: "blur(20px)" }}>
            {[{ l: "Execuções 7d", v: "1.847" }, { l: "Sucesso", v: "94%" }, { l: "Tempo médio", v: "1.2s" }].map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase" }}>{s.l}</div>
                <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 16, color: t.c.text, letterSpacing: "-0.02em", marginTop: 2 }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function ReportsScreen() {
  const t = TOKENS;
  const sources = [
    { name: "Meta Ads",   icon: "meta",   leads: 142, cost: 18400, deals: 38, revenue: 142800, roas: 7.76, color: "#3B82F6" },
    { name: "Google Ads", icon: "google", leads: 89,  cost: 12200, deals: 22, revenue: 88600,  roas: 7.26, color: "#00E599" },
    { name: "Indicação",  icon: "star",   leads: 41,  cost: 0,     deals: 19, revenue: 96400,  roas: null,  color: "#F59E0B" },
    { name: "LinkedIn",   icon: "lead",   leads: 23,  cost: 4800,  deals: 4,  revenue: 18200,  roas: 3.79, color: "#A855F7" },
  ];
  const funnel = [
    { stage: "Cliques",       v: 4823, pct: 100 },
    { stage: "Leads",         v: 295,  pct: 6.1 },
    { stage: "Qualificados",  v: 184,  pct: 62.4 },
    { stage: "Proposta",      v: 112,  pct: 60.9 },
    { stage: "Fechados",      v: 83,   pct: 74.1 },
  ];
  const months = ["Nov", "Dez", "Jan", "Fev", "Mar", "Abr"];
  const series = [42, 58, 51, 74, 68, 89];

  return (
    <>
      <Topbar
        kicker="Últimos 30 dias · Comparado a período anterior"
        title="Relatórios"
        actions={<>
          <Btn variant="secondary" icon="filter" size="md">30 dias</Btn>
          <Btn variant="outline" size="md">Exportar</Btn>
        </>}
      />
      <div style={{ flex: 1, padding: "24px 28px", overflow: "auto" }}>
        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { l: "Receita",   v: "R$ 346k", d: "+24%", pos: true },
            { l: "ROAS médio", v: "5.42x",  d: "+0.8x", pos: true },
            { l: "CAC médio", v: "R$ 184", d: "-R$ 32", pos: true },
            { l: "LTV / CAC", v: "15.7x",  d: "+2.1x", pos: true },
          ].map((k, i) => (
            <div key={i} style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: 16 }}>
              <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase" }}>{k.l}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                <span style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 26, color: t.c.text, letterSpacing: "-0.03em" }}>{k.v}</span>
                <span style={{ fontFamily: t.font.mono, fontSize: 11, color: k.pos ? t.c.success : t.c.danger, display: "inline-flex", alignItems: "center", gap: 2 }}>
                  <Icon name={k.pos ? "arrowUp" : "arrowDown"} size={10} />{k.d}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12, marginBottom: 12 }}>
          {/* Revenue chart */}
          <div style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.lg, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase" }}>Receita por mês</div>
                <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 20, color: t.c.text, letterSpacing: "-0.02em", marginTop: 4 }}>R$ 346.200 <span style={{ color: t.c.success, fontSize: 13, fontFamily: t.font.mono }}>+24%</span></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Badge tone="success" dot>Real</Badge>
                <Badge tone="neutral">Meta</Badge>
              </div>
            </div>
            <svg width="100%" height="220" viewBox="0 0 600 220" style={{ overflow: "visible" }}>
              <defs>
                <linearGradient id="rev-grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={t.c.primary} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={t.c.primary} stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map(i => (
                <line key={i} x1="0" x2="600" y1={i * 55 + 10} y2={i * 55 + 10} stroke={t.c.border} strokeDasharray="2 4" />
              ))}
              {(() => {
                const max = Math.max(...series);
                const pts = series.map((v, i) => [i * 110 + 30, 200 - (v / max) * 170]);
                const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
                const areaPath = path + ` L ${pts[pts.length - 1][0]} 200 L ${pts[0][0]} 200 Z`;
                return (
                  <>
                    <path d={areaPath} fill="url(#rev-grad)" />
                    <path d={path} stroke={t.c.primary} strokeWidth="2.5" fill="none" style={{ filter: `drop-shadow(0 0 6px ${t.c.glow})` }} />
                    {pts.map(([x, y], i) => (
                      <g key={i}>
                        <circle cx={x} cy={y} r="4" fill={t.c.bg} stroke={t.c.primary} strokeWidth="2" />
                        <text x={x} y="218" textAnchor="middle" fontSize="11" fontFamily={t.font.mono} fill={t.c.textSubtle}>{months[i]}</text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>

          {/* Funnel */}
          <div style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.lg, padding: 20 }}>
            <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase", marginBottom: 16 }}>Funil de conversão</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {funnel.map((s, i) => {
                const w = (s.v / funnel[0].v) * 100;
                return (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontFamily: t.font.sans, fontSize: 12 }}>
                      <span style={{ color: t.c.text, fontWeight: 500 }}>{s.stage}</span>
                      <span style={{ color: t.c.textMuted, fontFamily: t.font.mono }}>{s.v.toLocaleString("pt-BR")} <span style={{ color: i > 0 ? t.c.success : t.c.textSubtle }}>· {s.pct}%</span></span>
                    </div>
                    <div style={{ height: 8, background: t.c.surface2, borderRadius: 100, overflow: "hidden" }}>
                      <div style={{ width: `${w}%`, height: "100%", background: `linear-gradient(90deg, ${t.c.primary}, ${t.c.primaryHover})`, boxShadow: `0 0 8px ${t.c.glow}` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sources table */}
        <div style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.lg, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase" }}>Performance por origem</div>
            <Btn variant="ghost" size="sm">Ver detalhes</Btn>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: t.font.sans, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.c.border}` }}>
                {["Origem", "Leads", "Investido", "Deals", "Receita", "ROAS"].map((h, i) => (
                  <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "8px 12px", fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => (
                <tr key={i} style={{ borderBottom: i < sources.length - 1 ? `1px solid ${t.c.border}` : "none" }}>
                  <td style={{ padding: "14px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 24, height: 24, borderRadius: 6, background: s.color + "22", display: "flex", alignItems: "center", justifyContent: "center", color: s.color }}>
                        <Icon name={s.icon} size={13} />
                      </span>
                      <span style={{ color: t.c.text, fontWeight: 500 }}>{s.name}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", padding: "14px 12px", fontFamily: t.font.mono, color: t.c.text }}>{s.leads}</td>
                  <td style={{ textAlign: "right", padding: "14px 12px", fontFamily: t.font.mono, color: t.c.textMuted }}>{s.cost ? "R$ " + s.cost.toLocaleString("pt-BR") : "—"}</td>
                  <td style={{ textAlign: "right", padding: "14px 12px", fontFamily: t.font.mono, color: t.c.text }}>{s.deals}</td>
                  <td style={{ textAlign: "right", padding: "14px 12px", fontFamily: t.font.mono, color: t.c.text, fontWeight: 600 }}>R$ {s.revenue.toLocaleString("pt-BR")}</td>
                  <td style={{ textAlign: "right", padding: "14px 12px", fontFamily: t.font.mono, color: s.roas ? t.c.primary : t.c.textSubtle, fontWeight: 600 }}>{s.roas ? s.roas + "x" : "∞"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ConnectionsScreen() {
  const t = TOKENS;
  const integrations = [
    { name: "Meta Ads",         icon: "meta",     status: "connected", account: "Agência X · 4 contas", color: "#3B82F6", desc: "Lead Ads, conversões offline, audiences" },
    { name: "Google Ads",       icon: "google",   status: "connected", account: "agenciax@gmail.com", color: "#00E599",  desc: "Lead form, conversões, remarketing" },
    { name: "WhatsApp Business",icon: "whatsapp", status: "connected", account: "+55 11 99999-0000",  color: "#25D366",  desc: "Inbox unificado, templates, broadcast" },
    { name: "Google Calendar",  icon: "clock",    status: "connected", account: "pedro@agenciax.com.br", color: "#A855F7",desc: "Agendamentos automáticos via Sofia" },
    { name: "Stripe",           icon: "trending", status: "available", account: null,                color: "#635BFF",  desc: "Cobrança recorrente e link de pagamento" },
    { name: "RD Station",       icon: "mail",     status: "available", account: null,                color: "#1FB6E9",  desc: "Importar leads e nutrição" },
    { name: "HubSpot",          icon: "lead",     status: "available", account: null,                color: "#FF7A59",  desc: "Migrar contatos e pipelines" },
    { name: "Zapier",           icon: "zap",      status: "available", account: null,                color: "#FF4F00",  desc: "5.000+ apps via webhooks" },
  ];

  return (
    <>
      <Topbar
        kicker="4 de 8 ativas · Sincronização em tempo real"
        title="Conexões"
        actions={<Btn variant="primary" icon="plus" size="md">Nova integração</Btn>}
      />
      <div style={{ flex: 1, padding: "24px 28px", overflow: "auto" }}>
        {/* Hero status */}
        <div style={{ background: `linear-gradient(135deg, ${t.c.surface}, ${t.c.surface2})`, border: `1px solid ${t.c.borderActive}`, borderRadius: t.r.lg, padding: 24, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 100% 50%, ${t.c.glow}, transparent 60%)` }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.16em", color: t.c.primary, textTransform: "uppercase", marginBottom: 8 }}>Status geral · sincronizado</div>
            <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 22, color: t.c.text, letterSpacing: "-0.02em" }}>Todos os canais conectados estão saudáveis</div>
            <div style={{ fontFamily: t.font.sans, fontSize: 13, color: t.c.textMuted, marginTop: 6 }}>Última sincronização há 12s · 1.247 eventos processados nas últimas 24h</div>
          </div>
          <div style={{ display: "flex", gap: 10, position: "relative" }}>
            {[{ l: "Eventos 24h", v: "1.247" }, { l: "Latência", v: "120ms" }, { l: "Uptime", v: "99.98%" }].map((s, i) => (
              <div key={i} style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: "10px 14px", minWidth: 110 }}>
                <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase" }}>{s.l}</div>
                <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 16, color: t.c.text, letterSpacing: "-0.02em", marginTop: 4 }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["Todas", "Conectadas", "Disponíveis", "Em breve"].map((f, i) => (
            <span key={i} style={{ fontFamily: t.font.sans, fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 100, background: i === 0 ? t.c.surface2 : "transparent", color: i === 0 ? t.c.text : t.c.textMuted, cursor: "pointer", border: `1px solid ${i === 0 ? t.c.border : "transparent"}` }}>{f}</span>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {integrations.map((it, i) => {
            const connected = it.status === "connected";
            return (
              <div key={i} style={{ background: t.c.surface, border: `1px solid ${connected ? t.c.borderActive : t.c.border}`, borderRadius: t.r.lg, padding: 20, position: "relative", overflow: "hidden" }}>
                {connected && <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 100% 0%, ${t.c.glow}33, transparent 60%)`, pointerEvents: "none" }} />}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, position: "relative" }}>
                  <div style={{ width: 44, height: 44, borderRadius: t.r.md, background: it.color + "22", display: "flex", alignItems: "center", justifyContent: "center", color: it.color }}>
                    <Icon name={it.icon} size={22} stroke={1.8} />
                  </div>
                  {connected
                    ? <Badge tone="success" dot>Ativo</Badge>
                    : <Badge tone="neutral">Disponível</Badge>}
                </div>
                <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 15, color: t.c.text, letterSpacing: "-0.015em", position: "relative" }}>{it.name}</div>
                <div style={{ fontFamily: t.font.sans, fontSize: 12, color: t.c.textMuted, marginTop: 4, lineHeight: 1.5, position: "relative" }}>{it.desc}</div>
                {connected && (
                  <div style={{ marginTop: 14, padding: "8px 12px", background: t.c.surface2, borderRadius: t.r.sm, fontFamily: t.font.mono, fontSize: 10, color: t.c.textMuted, letterSpacing: "0.04em", position: "relative" }}>
                    {it.account}
                  </div>
                )}
                <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
                  {connected
                    ? <Btn variant="ghost" size="sm">Configurar</Btn>
                    : <Btn variant="outline" size="sm">Conectar</Btn>}
                  <Icon name="arrowRight" size={14} color={t.c.textSubtle} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { AutomationsScreen, ReportsScreen, ConnectionsScreen });
