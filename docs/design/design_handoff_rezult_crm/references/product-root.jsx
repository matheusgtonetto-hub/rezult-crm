// Rezult CRM Product — root with router

function ProductApp() {
  const [screen, setScreen] = React.useState("pipeline");
  const [lead, setLead] = React.useState(null);

  const onNav = (id) => { setScreen(id); setLead(null); };
  const onLead = (l) => { setLead(l); setScreen("leadDetail"); };
  const onBack = () => { setScreen("pipeline"); setLead(null); };

  let content;
  switch (screen) {
    case "pipeline":     content = <PipelineScreen onLead={onLead} />; break;
    case "leadDetail":   content = <LeadDetailScreen lead={lead} onBack={onBack} />; break;
    case "leads":        content = <PipelineScreen onLead={onLead} />; break;
    case "inbox":        content = <InboxScreen />; break;
    case "agents":       content = <AgentScreen />; break;
    case "automations":  content = <AutomationsScreen />; break;
    case "reports":      content = <ReportsScreen />; break;
    case "connections":  content = <ConnectionsScreen />; break;
    default:             content = <PipelineScreen onLead={onLead} />;
  }

  return <Shell current={screen === "leadDetail" ? "pipeline" : screen} onNav={onNav}>{content}</Shell>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<ProductApp />);
