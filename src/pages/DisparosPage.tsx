import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateDisparoWizard } from "@/components/disparos/CreateDisparoWizard";
import { fetchDisparos, DISPARO_STATUS_META, type Disparo } from "@/data/disparos";
import { Rocket, Plus, Search, Users, Workflow } from "lucide-react";

function fmtDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function DisparosPage() {
  const { company } = useCompany();
  const navigate = useNavigate();
  const [disparos, setDisparos] = useState<Disparo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      setDisparos(await fetchDisparos(company.id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => disparos.filter(d => d.title.toLowerCase().includes(search.toLowerCase()) || (d.description ?? "").toLowerCase().includes(search.toLowerCase())),
    [disparos, search]
  );

  return (
    // Espaçamento igual ao de /dashboard: 40px no topo, 30px nos outros lados.
    // Saiu o degrau responsivo (24px que virava 32px no md): com as páginas
    // padronizadas em valores fixos, um degrau só aqui faria o conteúdo saltar
    // de lugar ao navegar entre elas na mesma janela.
    <div className="pt-[40px] px-[30px] pb-[30px] max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Disparos</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Gerencie seus disparos de automação, acompanhe o progresso dos leads em tempo real e controle execuções.{" "}
            <a href="https://help.rezultcrm.com" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">
              Entenda como os disparos funcionam clicando aqui.
            </a>
          </p>
        </div>
        <Button onClick={() => setWizardOpen(true)} className="gap-2">
          <Plus size={16} /> Criar disparo
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 mt-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar..." className="pl-9 h-9 w-64" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <span className="text-sm text-muted-foreground">{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Rocket size={26} className="text-primary" />
          </div>
          <p className="text-base font-semibold">{disparos.length === 0 ? "Nenhum disparo ainda" : "Nenhum resultado"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {disparos.length === 0 ? "Crie seu primeiro disparo para executar uma automação em massa." : "Tente outro termo de busca."}
          </p>
          {disparos.length === 0 && (
            <Button onClick={() => setWizardOpen(true)} className="gap-2 mt-4"><Plus size={16} /> Criar disparo</Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 mt-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {filtered.map(d => {
            const meta = DISPARO_STATUS_META[d.status];
            const date = fmtDate(d.scheduled_at) ?? fmtDate(d.completed_at) ?? fmtDate(d.created_at);
            return (
              <button
                key={d.id}
                onClick={() => navigate(`/disparos/${d.id}`)}
                className="text-left bg-card border border-card-border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all"
              >
                <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{d.description || "—"}</p>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-primary/10 text-primary rounded px-2 py-0.5 mt-2">
                  <Workflow size={11} /> Automação
                </span>
                <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                    <span style={{ color: meta.color }} className="font-medium">{meta.label}</span>
                  </span>
                  <span className="inline-flex items-center gap-1"><Users size={12} /> {d.total_leads.toLocaleString("pt-BR")} Leads</span>
                  {date && <span className="inline-flex items-center gap-1"><Rocket size={11} /> {date}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <CreateDisparoWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={(id) => { setWizardOpen(false); navigate(`/disparos/${id}`); }}
      />
    </div>
  );
}
