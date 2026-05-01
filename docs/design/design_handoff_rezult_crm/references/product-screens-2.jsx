// Rezult CRM Product — WhatsApp Inbox + Agente IA screens

const CHATS = [
  { id: "c1", name: "Felipe Costa",    co: "FC Logística", last: "Pode marcar reunião pra quinta às 15h. Vou levar o sócio.", time: "12min", unread: 0, online: true, agentActive: true, score: 94 },
  { id: "c2", name: "Carlos Andrade",  co: "Loja Andrade", last: "Vou pensar e te retorno amanhã.", time: "32min", unread: 2, online: false, agentActive: false, score: 72 },
  { id: "c3", name: "Marina Souza",    co: "Souza Tech",   last: "Sofia: Posso te enviar um material rápido sobre integração?", time: "1h", unread: 0, online: true, agentActive: true, score: 81 },
  { id: "c4", name: "Bruna Lima",      co: "Studio Lima",  last: "Top! Fechado então.", time: "2h", unread: 0, online: false, agentActive: false, score: 78 },
  { id: "c5", name: "Diego Ramos",     co: "Ramos Imóveis",last: "Sofia: Oi Diego! Vi que você baixou nosso material…", time: "3h", unread: 1, online: false, agentActive: true, score: 87 },
  { id: "c6", name: "Patricia Mendes", co: "PM Studio",    last: "Quero saber mais sobre o plano Pro", time: "5h", unread: 0, online: true, agentActive: false, score: 64 },
  { id: "c7", name: "Rafael Klein",    co: "Konsult",      last: "Recebi a proposta, obrigado!", time: "1d", unread: 0, online: false, agentActive: false, score: 88 },
];

const MESSAGES = [
  { who: "agent", time: "14:02", text: "Oi Felipe! Vi que você baixou nosso material sobre CRM pra logística. Posso te ajudar com alguma dúvida?", name: "Sofia · IA" },
  { who: "lead",  time: "14:05", text: "Oi! Sim, tô avaliando algumas opções. Quero entender melhor a parte de WhatsApp." },
  { who: "agent", time: "14:05", text: "Perfeito. A gente integra direto com o WhatsApp Business — você consegue centralizar todas as conversas, atribuir pra time e ainda ter o agente IA respondendo no primeiro contato. Qual o tamanho do seu time hoje?", name: "Sofia · IA" },
  { who: "lead",  time: "14:12", text: "Somos 24 pessoas, 6 no comercial." },
  { who: "agent", time: "14:12", text: "Ótimo. Pra esse tamanho o plano Pro faz mais sentido — R$ 890/mês com 3 agentes IA inclusos. Quer que eu agende uma demo essa semana?", name: "Sofia · IA" },
  { who: "lead",  time: "14:28", text: "Pode marcar reunião pra quinta às 15h. Vou levar o sócio." },
  { who: "system", time: "14:28", text: "Sofia atualizou score para 94 · Marcado como hot lead" },
];

function InboxScreen() {
  const t = TOKENS;
  const [active, setActive] = React.useState("c1");
  const chat = CHATS.find(c => c.id === active);

  return (
    <>
      <Topbar
        kicker="WhatsApp · Conectado · +55 11 99999-0000"
        title="Caixa de entrada"
        actions={<>
          <Btn variant="secondary" icon="filter" size="md">Filtros</Btn>
          <Btn variant="outline" icon="agent" size="md">Atribuir IA</Btn>
        </>}
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "320px 1fr 280px", overflow: "hidden" }}>
        {/* Chat list */}
        <div style={{ borderRight: `1px solid ${t.c.border}`, background: t.c.surface, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.c.border}`, display: "flex", gap: 8 }}>
            {["Todos", "IA ativa", "Não lidos"].map((f, i) => (
              <span key={i} style={{ fontFamily: t.font.sans, fontSize: 11, fontWeight: 500, padding: "5px 10px", borderRadius: 100, background: i === 0 ? t.c.surface2 : "transparent", color: i === 0 ? t.c.text : t.c.textMuted, cursor: "pointer", border: `1px solid ${i === 0 ? t.c.border : "transparent"}` }}>{f}</span>
            ))}
          </div>
          {CHATS.map(c => {
            const isActive = c.id === active;
            return (
              <div key={c.id} onClick={() => setActive(c.id)} style={{ padding: "14px 16px", borderBottom: `1px solid ${t.c.border}`, background: isActive ? t.c.surface2 : "transparent", cursor: "pointer", display: "flex", gap: 12, position: "relative" }}>
                {isActive && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: t.c.primary, boxShadow: `0 0 12px ${t.c.glow}` }} />}
                <div style={{ position: "relative" }}>
                  <Avatar name={c.name} size={38} />
                  {c.online && <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", background: t.c.success, border: `2px solid ${t.c.surface}` }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ fontFamily: t.font.sans, fontWeight: 500, fontSize: 13, color: t.c.text, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                      {c.agentActive && <span title="Agente IA ativo" style={{ display: "inline-flex" }}><Icon name="agent" size={11} color={t.c.primary} /></span>}
                    </div>
                    <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.c.textSubtle, flexShrink: 0 }}>{c.time}</span>
                  </div>
                  <div style={{ fontFamily: t.font.sans, fontSize: 11, color: t.c.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>{c.last}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ fontFamily: t.font.mono, fontSize: 9, color: t.c.textSubtle, letterSpacing: "0.04em" }}>{c.co.toUpperCase()}</span>
                    {c.unread > 0 && <span style={{ background: t.c.primary, color: t.c.textOnPrimary, fontFamily: t.font.mono, fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 100 }}>{c.unread}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Conversation */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: t.c.bg }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.c.border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={chat.name} size={36} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 14, color: t.c.text, letterSpacing: "-0.01em" }}>{chat.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: t.font.sans, fontSize: 11, color: t.c.textMuted }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: chat.online ? t.c.success : t.c.textSubtle }} />
                {chat.online ? "Online" : "Visto há 12min"} · {chat.co}
              </div>
            </div>
            <Badge tone="success" dot>IA ativa · Sofia</Badge>
            <Icon name="phone" size={16} color={t.c.textMuted} />
            <Icon name="more" size={16} color={t.c.textMuted} />
          </div>
          <div style={{ flex: 1, padding: "20px 24px", overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            {MESSAGES.map((m, i) => {
              if (m.who === "system") return (
                <div key={i} style={{ alignSelf: "center", fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.08em", color: t.c.primary, background: t.c.successBg, padding: "4px 12px", borderRadius: 100, textTransform: "uppercase" }}>
                  ✓ {m.text} · {m.time}
                </div>
              );
              const isAgent = m.who === "agent";
              return (
                <div key={i} style={{ alignSelf: isAgent ? "flex-start" : "flex-end", maxWidth: "70%" }}>
                  {m.name && <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.1em", color: t.c.primary, textTransform: "uppercase", marginBottom: 4, marginLeft: 4 }}>{m.name}</div>}
                  <div style={{
                    background: isAgent ? t.c.surface2 : t.c.primary,
                    color: isAgent ? t.c.text : t.c.textOnPrimary,
                    border: isAgent ? `1px solid ${t.c.border}` : "none",
                    padding: "10px 14px", borderRadius: t.r.md,
                    borderTopLeftRadius: isAgent ? 4 : t.r.md,
                    borderTopRightRadius: isAgent ? t.r.md : 4,
                    fontFamily: t.font.sans, fontSize: 13, lineHeight: 1.5, letterSpacing: "-0.005em",
                  }}>{m.text}</div>
                  <div style={{ fontFamily: t.font.mono, fontSize: 9, color: t.c.textSubtle, marginTop: 4, textAlign: isAgent ? "left" : "right", padding: "0 4px" }}>{m.time}</div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${t.c.border}`, background: t.c.surface }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: t.c.surface2, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: "8px 12px" }}>
              <Icon name="paperclip" size={16} color={t.c.textMuted} />
              <input placeholder="Digite uma mensagem ou /comando..." style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: t.c.text, fontFamily: t.font.sans, fontSize: 13 }} />
              <Icon name="smile" size={16} color={t.c.textMuted} />
              <button style={{ background: t.c.primary, color: t.c.textOnPrimary, border: "none", width: 30, height: 30, borderRadius: t.r.sm, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: `0 0 12px ${t.c.glow}` }}>
                <Icon name="send" size={14} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {["💬 Saudação", "📅 Agendar demo", "💰 Enviar proposta", "🤖 Passar pra Sofia"].map((s, i) => (
                <span key={i} style={{ fontFamily: t.font.sans, fontSize: 11, color: t.c.textMuted, background: t.c.surface2, border: `1px solid ${t.c.border}`, borderRadius: 100, padding: "4px 10px", cursor: "pointer" }}>{s}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right context rail */}
        <aside style={{ borderLeft: `1px solid ${t.c.border}`, background: t.c.surface, padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: t.c.surface2, borderRadius: t.r.md, padding: 14, border: `1px solid ${t.c.borderActive}`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 100% 0%, ${t.c.glow}, transparent 60%)` }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, position: "relative" }}>
              <Icon name="agent" size={14} color={t.c.primary} />
              <span style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.primary, textTransform: "uppercase" }}>Sofia · sugestão</span>
            </div>
            <div style={{ fontFamily: t.font.sans, fontSize: 12, color: t.c.text, lineHeight: 1.55, position: "relative" }}>Lead pediu reunião quinta 15h. Posso criar evento no Google Calendar e enviar confirmação?</div>
            <div style={{ display: "flex", gap: 6, marginTop: 12, position: "relative" }}>
              <Btn variant="primary" size="sm">Aprovar</Btn>
              <Btn variant="ghost" size="sm">Editar</Btn>
            </div>
          </div>

          <div>
            <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.16em", color: t.c.textSubtle, textTransform: "uppercase", marginBottom: 10 }}>Lead info</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: t.font.sans }}><span style={{ color: t.c.textMuted }}>Score</span><span style={{ color: t.c.primary, fontWeight: 600, fontFamily: t.font.mono }}>{chat.score}/100</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: t.font.sans }}><span style={{ color: t.c.textMuted }}>Estágio</span><Badge tone="warning">Qualificado</Badge></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: t.font.sans }}><span style={{ color: t.c.textMuted }}>Valor</span><span style={{ color: t.c.text, fontWeight: 500 }}>R$ 21.000</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: t.font.sans }}><span style={{ color: t.c.textMuted }}>Origem</span><span style={{ color: t.c.text }}>Indicação</span></div>
            </div>
          </div>

          <div>
            <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.16em", color: t.c.textSubtle, textTransform: "uppercase", marginBottom: 10 }}>Próximas ações</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[{ icon: "calendar", text: "Reunião quinta · 15:00" }, { icon: "mail", text: "Enviar proposta após call" }].map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: t.c.surface2, borderRadius: t.r.sm, border: `1px solid ${t.c.border}` }}>
                  <Icon name={a.icon === "calendar" ? "clock" : a.icon} size={12} color={t.c.primary} />
                  <span style={{ fontFamily: t.font.sans, fontSize: 11, color: t.c.text }}>{a.text}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function AgentScreen() {
  const t = TOKENS;
  return (
    <>
      <Topbar
        kicker="Agente IA · Sofia · ativa"
        title="Configuração do agente"
        actions={<>
          <Btn variant="secondary" size="md">Pausar</Btn>
          <Btn variant="primary" icon="check" size="md">Salvar alterações</Btn>
        </>}
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", overflow: "hidden" }}>
        {/* Config */}
        <div style={{ padding: "24px 28px", overflow: "auto", borderRight: `1px solid ${t.c.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, padding: 16, background: t.c.surface, border: `1px solid ${t.c.borderActive}`, borderRadius: t.r.lg, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 0% 50%, ${t.c.glow}, transparent 60%)` }} />
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${t.c.primary}, ${t.c.primaryHover})`, display: "flex", alignItems: "center", justifyContent: "center", color: t.c.textOnPrimary, fontFamily: t.font.sans, fontWeight: 700, fontSize: 20, position: "relative", boxShadow: `0 0 24px ${t.c.glow}` }}>S</div>
            <div style={{ flex: 1, position: "relative" }}>
              <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 16, color: t.c.text, letterSpacing: "-0.02em" }}>Sofia</div>
              <div style={{ fontFamily: t.font.sans, fontSize: 12, color: t.c.textMuted }}>Qualificadora · Tráfego pago · Agência X</div>
            </div>
            <Badge tone="success" dot>Online · respondeu 847</Badge>
          </div>

          {[
            { label: "Persona", val: "Consultiva, direta, jamais agressiva. Trata o lead pelo nome, fala em PT-BR informal." },
            { label: "Objetivo", val: "Qualificar leads de tráfego pago em até 3 mensagens: confirmar fit (porte, dor, orçamento) e agendar demo." },
            { label: "Base de conhecimento", val: "12 documentos · pricing.pdf, faq.md, casos-de-sucesso.json + integração com calendário", icon: true },
            { label: "Quando escalar pra humano", val: "Se lead pedir desconto > 20%, mencionar concorrente direto, ou após 5 mensagens sem avanço." },
          ].map((s, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.primary, textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
              <div style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: 14, fontFamily: t.font.sans, fontSize: 13, color: t.c.text, lineHeight: 1.55 }}>{s.val}</div>
            </div>
          ))}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.primary, textTransform: "uppercase", marginBottom: 8 }}>Ferramentas conectadas</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[{ name: "WhatsApp Business", on: true }, { name: "Google Calendar", on: true }, { name: "Meta Lead Ads", on: true }, { name: "Stripe (em breve)", on: false }].map((tool, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.sm }}>
                  <span style={{ fontFamily: t.font.sans, fontSize: 12, color: tool.on ? t.c.text : t.c.textSubtle }}>{tool.name}</span>
                  <span style={{ width: 28, height: 16, borderRadius: 100, background: tool.on ? t.c.primary : t.c.surface3, position: "relative", boxShadow: tool.on ? `0 0 8px ${t.c.glow}` : "none" }}>
                    <span style={{ position: "absolute", top: 2, left: tool.on ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 24 }}>
            {[{ l: "Resp. hoje", v: "127" }, { l: "Conversões", v: "18" }, { l: "Taxa qualif.", v: "62%" }].map((m, i) => (
              <div key={i} style={{ background: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: t.r.md, padding: 12 }}>
                <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.14em", color: t.c.textSubtle, textTransform: "uppercase" }}>{m.l}</div>
                <div style={{ fontFamily: t.font.sans, fontWeight: 600, fontSize: 20, color: t.c.text, letterSpacing: "-0.025em", marginTop: 4 }}>{m.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live chat preview */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: t.c.bg }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.c.danger, boxShadow: `0 0 8px ${t.c.danger}` }} />
              <span style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: "0.14em", color: t.c.textMuted, textTransform: "uppercase" }}>Live · 7 conversas ativas</span>
            </div>
            <span style={{ fontFamily: t.font.sans, fontSize: 12, color: t.c.text, fontWeight: 500 }}>Felipe Costa · FC Logística</span>
          </div>
          <div style={{ flex: 1, padding: "20px 24px", overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            {MESSAGES.slice(0, 6).map((m, i) => {
              const isAgent = m.who === "agent";
              return (
                <div key={i} style={{ alignSelf: isAgent ? "flex-start" : "flex-end", maxWidth: "75%" }}>
                  {m.name && <div style={{ fontFamily: t.font.mono, fontSize: 9, letterSpacing: "0.1em", color: t.c.primary, textTransform: "uppercase", marginBottom: 4, marginLeft: 4 }}>{m.name}</div>}
                  <div style={{
                    background: isAgent ? t.c.surface2 : t.c.primary,
                    color: isAgent ? t.c.text : t.c.textOnPrimary,
                    border: isAgent ? `1px solid ${t.c.border}` : "none",
                    padding: "10px 14px", borderRadius: t.r.md,
                    borderTopLeftRadius: isAgent ? 4 : t.r.md,
                    borderTopRightRadius: isAgent ? t.r.md : 4,
                    fontFamily: t.font.sans, fontSize: 13, lineHeight: 1.5,
                  }}>{m.text}</div>
                </div>
              );
            })}
            <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: t.c.surface2, border: `1px solid ${t.c.border}`, borderRadius: t.r.md }}>
              <span style={{ display: "flex", gap: 3 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: t.c.primary, animation: "pulse 1.4s infinite" }} />
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: t.c.primary, animation: "pulse 1.4s infinite .2s" }} />
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: t.c.primary, animation: "pulse 1.4s infinite .4s" }} />
              </span>
              <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.c.textSubtle, letterSpacing: "0.06em" }}>Sofia digitando…</span>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3 } 50% { opacity: 1 } }`}</style>
    </>
  );
}

Object.assign(window, { InboxScreen, AgentScreen });
