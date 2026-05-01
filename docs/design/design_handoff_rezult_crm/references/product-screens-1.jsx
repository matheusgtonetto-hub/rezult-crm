// Rezult CRM Product — Pipeline + Lead Detail screens

const SAMPLE_LEADS = {
  novo: [
    { id: "l1", name: "Diego Ramos", co: "Ramos Imóveis",     val: 12000, src: "Google Ads", srcIcon: "google", time: "2min", score: 87, hot: true },
    { id: "l2", name: "Patricia Mendes", co: "PM Studio",     val: 4800,  src: "Meta Ads",  srcIcon: "meta",   time: "18min", score: 64 },
  ],
  qualif: [
    { id: "l3", name: "Carlos Andrade", co: "Loja Andrade",   val: 3500,  src: "Meta Ads",  srcIcon: "meta",   time: "1h", score: 72 },
    { id: "l4", name: "Marina Souza",   co: "Souza Tech",     val: 9200,  src: "LinkedIn",  srcIcon: "lead",   time: "3h", score: 81 },
    { id: "l5", name: "Felipe Costa",   co: "FC Logística",   val: 21000, src: "Indicação", srcIcon: "star",   time: "5h", score: 94, hot: true },
  ],
  neg: [
    { id: "l6", name: "Bruna Lima",     co: "Studio Lima",    val: 8200,  src: "Indicação", srcIcon: "star",   time: "1d", score: 78 },
    { id: "l7", name: "Rafael Klein",   co: "Konsult",        val: 15500, src: "Meta Ads",  srcIcon: "meta",   time: "2d", score: 88 },
  ],
  fechado: [
    { id: "l8", name: "Joana Reis",     co: "JR Decor",       val: 6700,  src: "Google Ads",srcIcon: "google", time: "Hoje", score: 100 },
  ],
};

function fmt(v) { return "R$ " + v.toLocaleString("pt-BR"); }

function PipelineScreen({ onLead }) {
  const t = TOKENS;
  const stages = [
    { key: "novo",    name: "Novo lead",      color: t.c.info,    leads: SAMPLE_LEADS.novo },
    { key: "qualif",  name: "Qualificado",    color: t.c.primary, leads: SAMPLE_LEADS.qualif },
    { key: "neg",     name: "Em negociação",  color: t.c.warning, leads: SAMPLE_LEADS.neg },
    { key: "fechado", name: "Fechado",        color: t.c.success, leads: SAMPLE_LEADS.fechado },
  ];

  const Metric = ({ label, val, delta, deltaPos }) => (
    <div style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: 14 }}>
      <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.12em", color: t.c.textSubtle, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 22, color: t.c.text, letterSpacing: "-0.025em" }}>{val}</div>
        <div style={{ fontFamily: t.font.mono, fontSize: 11, color: deltaPos ? t.c.success : t.c.danger }}>{delta}</div>
      </div>
    </div>
  );

  return (
    <>
      <Topbar
        kicker="Workspace · Agência X"
        title="Pipeline de vendas"
        actions={<>
          <Btn variant="secondary" icon="filter" size="md">Filtros</Btn>
          <Btn variant="primary" icon="plus" size="md">Novo lead</Btn>
        </>}
      />
      <div style={{ flex: 1, padding: "20px 28px", overflow: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <Metric label="Pipeline total" val="R$ 84.2k" delta="+18%" deltaPos />
          <Metric label="Taxa fechamento" val="32%" delta="+4pp" deltaPos />
          <Metric label="Tempo médio" val="6.2d" delta="-1.4d" deltaPos />
          <Metric label="Agente IA · resp." val="847" delta="+212" deltaPos />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {stages.map(stage => (
            <div key={stage.key} style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.lg, padding: 12, minHeight: 480 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 8px 14px", borderBottom: `1px solid ${t.c.border}`, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color, boxShadow: `0 0 8px ${stage.color}88` }} />
                  <span style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 12, color: t.c.text, letterSpacing: "-0.01em" }}>{stage.name}</span>
                  <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.c.textSubtle, marginLeft: 4 }}>{stage.leads.length}</span>
                </div>
                <Icon name="more" size={14} color={t.c.textSubtle} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stage.leads.map(lead => (
                  <div key={lead.id} onClick={() => onLead(lead)} style={{ background: t.c.surface2, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: 12, cursor: "pointer", transition: "border-color .15s, transform .15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = t.c.borderActive; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = t.c.border; e.currentTarget.style.transform = "translateY(0)"; }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <Avatar name={lead.name} size={28} square />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontFamily: t.font.sans, fontWeight: 500, fontSize: 12, color: t.c.text, letterSpacing: "-0.005em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.name}</span>
                          {lead.hot && <Icon name="flame" size={11} color={t.c.warning} />}
                        </div>
                        <div style={{ fontFamily: t.font.sans, fontSize: 10, color: t.c.textSubtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.co}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 14, color: t.c.primary, letterSpacing: "-0.02em" }}>{fmt(lead.val)}</span>
                      <span style={{ fontFamily: t.font.mono, fontSize: 9, color: t.c.textSubtle, letterSpacing: "0.04em" }}>{lead.time}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: t.font.mono, fontSize: 9, color: t.c.textMuted, letterSpacing: "0.04em" }}>
                        <Icon name={lead.srcIcon} size={10} />
                        {lead.src}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontFamily: t.font.mono, fontSize: 9, color: t.c.textSubtle }}>SCORE</span>
                        <span style={{ fontFamily: t.font.mono, fontSize: 11, fontWeight: 600, color: lead.score >= 85 ? t.c.primary : t.c.text }}>{lead.score}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "10px 12px", border: `1px dashed ${t.c.border}`, borderRadius: t.r.md, color: t.c.textSubtle, fontFamily: t.font.sans, fontSize: 11, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <Icon name="plus" size={12} /> Adicionar
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function LeadDetailScreen({ lead, onBack }) {
  const t = TOKENS;
  const L = lead || SAMPLE_LEADS.qualif[2]; // Felipe Costa default
  const timeline = [
    { time: "agora", icon: "agent", color: t.c.primary, title: "Agente IA · Sofia atualizou score", body: "Score subiu para 94 após confirmar orçamento (R$ 21k) e timeline (este mês). Marcado como hot lead." },
    { time: "12min", icon: "whatsapp", color: t.c.success, title: "Resposta no WhatsApp", body: "\"Pode marcar reunião pra quinta às 15h. Vou levar o sócio.\"" },
    { time: "1h", icon: "automation", color: t.c.info, title: "Automação executada · Follow-up D1", body: "Mensagem 'Oi Felipe, viu nossa proposta?' enviada via WhatsApp." },
    { time: "5h", icon: "lead", color: t.c.purple, title: "Lead capturado", body: "Origem: Indicação (Marcos Pereira) · Form: /landing-logistica" },
  ];

  return (
    <>
      <Topbar
        kicker={<span style={{ cursor: "pointer" }} onClick={onBack}>← Pipeline / Qualificado</span>}
        title={L.name}
        actions={<>
          <Btn variant="secondary" icon="phone" size="md">Ligar</Btn>
          <Btn variant="secondary" icon="whatsapp" size="md">WhatsApp</Btn>
          <Btn variant="primary" icon="check" size="md">Marcar fechado</Btn>
        </>}
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 320px", overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", overflow: "auto" }}>
          {/* Score card */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
            <div style={{ background: `linear-gradient(135deg, ${t.c.surface}, ${t.c.surface2})`, border: `1px solid ${t.c.borderActive}`, borderRadius: t.r.lg, padding: 18, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 100% 0%, ${t.c.glow}, transparent 60%)` }} />
              <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.primary, textTransform: "uppercase", marginBottom: 8, position: "relative" }}>Score IA</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, position: "relative" }}>
                <span style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 36, color: t.c.primary, letterSpacing: "-0.04em" }}>{L.score}</span>
                <span style={{ fontFamily: t.font.mono, fontSize: 13, color: t.c.textMuted }}>/ 100</span>
                <Icon name="flame" size={18} color={t.c.warning} />
              </div>
              <div style={{ fontFamily: t.font.sans, fontSize: 11, color: t.c.textMuted, marginTop: 6, position: "relative" }}>Hot lead · alta probabilidade</div>
            </div>
            <div style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.lg, padding: 18 }}>
              <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase", marginBottom: 8 }}>Valor estimado</div>
              <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 28, color: t.c.text, letterSpacing: "-0.03em" }}>{fmt(L.val)}</div>
              <div style={{ fontFamily: t.font.sans, fontSize: 11, color: t.c.textMuted, marginTop: 6 }}>Mensal recorrente</div>
            </div>
            <div style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.lg, padding: 18 }}>
              <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase", marginBottom: 8 }}>Tempo no funil</div>
              <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 28, color: t.c.text, letterSpacing: "-0.03em" }}>5h 12min</div>
              <div style={{ fontFamily: t.font.sans, fontSize: 11, color: t.c.textMuted, marginTop: 6 }}>Tempo médio: 2.4d</div>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 16, color: t.c.text, letterSpacing: "-0.02em", margin: 0 }}>Atividade</h3>
            <Btn variant="ghost" size="sm">Ver tudo</Btn>
          </div>
          <div style={{ position: "relative", paddingLeft: 28 }}>
            <div style={{ position: "absolute", left: 11, top: 8, bottom: 8, width: 1, background: t.c.border }} />
            {timeline.map((ev, i) => (
              <div key={i} style={{ position: "relative", marginBottom: 18 }}>
                <div style={{ position: "absolute", left: -28, top: 2, width: 24, height: 24, borderRadius: "50%", background: t.c.surface, border: `1.5px solid ${ev.color}`, display: "flex", alignItems: "center", justifyContent: "center", color: ev.color, boxShadow: `0 0 0 4px ${t.c.bg}` }}>
                  <Icon name={ev.icon} size={12} />
                </div>
                <div style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <span style={{ fontFamily: t.font.sans, fontWeight: 500, fontSize: 13, color: t.c.text, letterSpacing: "-0.005em" }}>{ev.title}</span>
                    <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.c.textSubtle, letterSpacing: "0.04em" }}>{ev.time}</span>
                  </div>
                  <div style={{ fontFamily: t.font.sans, fontSize: 12, color: t.c.textMuted, lineHeight: 1.5 }}>{ev.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right rail */}
        <aside style={{ borderLeft: `1px solid ${t.c.border}`, background: t.c.surface, padding: "24px 22px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingBottom: 20, borderBottom: `1px solid ${t.c.border}` }}>
            <Avatar name={L.name} size={64} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 16, color: t.c.text, letterSpacing: "-0.015em" }}>{L.name}</div>
              <div style={{ fontFamily: t.font.sans, fontSize: 12, color: t.c.textMuted, marginTop: 2 }}>{L.co}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Badge tone="warning" dot>Em qualificação</Badge>
              <Badge tone="purple">B2B</Badge>
            </div>
          </div>

          {[
            { label: "Email",     val: "felipe@fclogistica.com.br", icon: "mail" },
            { label: "Telefone",  val: "+55 11 98432-1100",         icon: "phone" },
            { label: "Empresa",   val: L.co + " · 24 funcionários",  icon: "building" },
            { label: "Origem",    val: L.src,                        icon: L.srcIcon },
            { label: "Responsável", val: "Pedro Almeida",            icon: "lead" },
            { label: "Criado em", val: "Hoje, 14:32",                icon: "clock" },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: t.r.sm, background: t.c.surface2, display: "flex", alignItems: "center", justifyContent: "center", color: t.c.primary, flexShrink: 0 }}>
                <Icon name={f.icon} size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase" }}>{f.label}</div>
                <div style={{ fontFamily: t.font.sans, fontSize: 12, color: t.c.text, marginTop: 2, wordBreak: "break-word" }}>{f.val}</div>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}

Object.assign(window, { PipelineScreen, LeadDetailScreen, SAMPLE_LEADS });
