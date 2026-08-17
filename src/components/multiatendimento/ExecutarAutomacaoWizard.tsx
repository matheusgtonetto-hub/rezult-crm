import { useEffect, useMemo, useState } from "react";
import { useCompany } from "@/context/CompanyContext";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchLeadManualAutomations, type AutomationOption } from "@/data/disparos";
import { Search, Check, Play, AlertTriangle } from "lucide-react";

/**
 * "Executar automação" do Multiatendimento, no mesmo formato do Criar disparo.
 *
 * Antes era um popup curto que listava as automações e disparava no primeiro
 * clique -- sem dizer em quem ia executar e sem chance de conferir antes. Com
 * conversa errada selecionada, a mensagem saía para o cliente errado e não
 * havia como voltar atrás.
 *
 * O wizard herda o formato da tela de disparos de propósito: é a mesma tarefa
 * (escolher automação, escolher em quem roda), e duas telas com o mesmo
 * propósito e desenhos diferentes obrigam o atendente a aprender duas vezes.
 *
 * A diferença é que aqui o passo 2 já vem resolvido -- as conversas foram
 * escolhidas na tela -- então ele deixa de ser um filtro e vira uma
 * conferência, que é o único momento em que dá para perceber que a automação
 * ia para a pessoa errada.
 */

export interface ConversaAlvo {
  id: string;
  nome: string;
  telefone?: string;
  /** Sem negócio vinculado a automação não roda: ela age sobre o negócio. */
  temNegocio: boolean;
}

/**
 * Como chamar o alvo na tela.
 *
 * O mesmo wizard atende dois pontos de partida: o Multiatendimento age sobre
 * conversas, a lista de leads age sobre leads. Chamar tudo de "destinatário"
 * para servir aos dois deixaria os dois textos igualmente estranhos.
 */
export interface TermoDoAlvo { singular: string; plural: string }
const TERMO_PADRAO: TermoDoAlvo = { singular: "conversa", plural: "conversas" };

type Passo = 1 | 2;
const PASSOS: { n: Passo; label: string }[] = [
  { n: 1, label: "Selecionar automação" },
  { n: 2, label: "Confirmar destinatários" },
];

export function ExecutarAutomacaoWizard({
  open, onOpenChange, conversas, executando, onExecutar, termo = TERMO_PADRAO,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conversas: ConversaAlvo[];
  executando: boolean;
  onExecutar: (automationId: string) => void;
  /** Como nomear o alvo. Padrão "conversa", que é a origem mais frequente. */
  termo?: TermoDoAlvo;
}) {
  const { company } = useCompany();
  const [passo, setPasso] = useState<Passo>(1);
  const [automacoes, setAutomacoes] = useState<AutomationOption[]>([]);
  const [busca, setBusca] = useState("");
  const [automacaoId, setAutomacaoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPasso(1); setAutomacaoId(null); setBusca("");
    if (!company) return;
    setCarregando(true);
    fetchLeadManualAutomations(company.id)
      .then(setAutomacoes)
      .catch(() => setAutomacoes([]))
      .finally(() => setCarregando(false));
    // Depende do id da empresa, não do objeto: `company` troca de identidade a
    // cada recarga do contexto e refaria a busca sem nada ter mudado. Mesmo
    // padrão do CreateDisparoWizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company?.id]);

  // Só automações ativas. Uma inativa aparece na tela de disparos porque lá o
  // disparo pode ser agendado para depois; aqui a execução é agora, e oferecer
  // o que não vai rodar é convidar o atendente a clicar e não entender nada.
  const listadas = useMemo(
    () => automacoes.filter(a => a.active && a.name.toLowerCase().includes(busca.trim().toLowerCase())),
    [automacoes, busca],
  );
  const escolhida = automacoes.find(a => a.id === automacaoId);
  const comNegocio = conversas.filter(c => c.temNegocio);
  const semNegocio = conversas.filter(c => !c.temNegocio);

  return (
    <Dialog open={open} onOpenChange={o => { if (!executando) onOpenChange(o); }}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden" style={{ width: "min(820px, 94vw)" }}>
        {/* O título do diálogo existe para o leitor de tela: o Radix avisa no
            console quando falta, e sem ele quem navega por áudio abre a janela
            sem saber o que ela é. Fica escondido porque o mesmo texto já
            aparece no trilho da esquerda, em tamanho de cabeçalho. */}
        <DialogTitle className="sr-only">Executar automação</DialogTitle>
        <div className="flex" style={{ minHeight: 420 }}>
          {/* Trilho da esquerda */}
          <div className="w-60 shrink-0 border-r border-border p-6 bg-secondary/30">
            <h2 className="text-lg font-bold">Executar automação</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Execute uma automação {termo.singular === "lead" ? "nos leads selecionados" : "nas conversas selecionadas"}. A mensagem sai na hora, pela linha conectada.
            </p>
            <div className="mt-6 space-y-4">
              {PASSOS.map(p => {
                const feito = passo > p.n;
                const ativo = passo === p.n;
                return (
                  <div key={p.n} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{
                        background: feito ? "hsl(var(--primary))" : ativo ? "hsl(var(--primary) / 0.12)" : "transparent",
                        color: feito ? "#fff" : ativo ? "hsl(var(--primary))" : "#94A3B8",
                        border: ativo ? "1.5px solid hsl(var(--primary))" : feito ? "none" : "1.5px solid #CBD5E1",
                      }}
                    >
                      {feito ? <Check size={13} /> : p.n}
                    </div>
                    <span className="text-sm" style={{ color: ativo ? "hsl(var(--foreground))" : "#94A3B8", fontWeight: ativo ? 600 : 400 }}>
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 p-6 overflow-y-auto" style={{ maxHeight: "68vh" }}>
              {passo === 1 && (
                <>
                  <h3 className="text-base font-semibold">Selecione a automação</h3>
                  <p className="text-sm text-muted-foreground">Escolha a automação que será executada.</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2 mb-3">
                    <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/50 flex items-center justify-center text-[9px]">i</span>
                    Somente automações ativas com gatilho de execução manual podem ser selecionadas.
                  </p>
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Pesquisar..." className="pl-9 h-9" value={busca} onChange={e => setBusca(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    {carregando && <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>}
                    {!carregando && listadas.length === 0 && (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        Nenhuma automação ativa com gatilho manual.<br />
                        Crie uma automação com o gatilho "Execução manual por lead" e deixe-a ativa.
                      </p>
                    )}
                    {listadas.map(a => (
                      <button key={a.id} type="button" onClick={() => setAutomacaoId(a.id)}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors"
                        style={{ borderColor: automacaoId === a.id ? "hsl(var(--primary))" : "#E5E7EB", background: automacaoId === a.id ? "hsl(var(--primary) / 0.04)" : "#fff" }}>
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: automacaoId === a.id ? "hsl(var(--primary))" : "#CBD5E1" }}>
                          {automacaoId === a.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className="text-sm font-medium">{a.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {passo === 2 && (
                <>
                  <h3 className="text-base font-semibold">Confirmar destinatários</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    A automação <strong className="text-foreground">{escolhida?.name}</strong> será executada
                    {comNegocio.length === 1 ? ` neste ${termo.singular}` : ` nestes ${comNegocio.length} ${termo.plural}`}.
                  </p>

                  {/* Quem fica de fora aparece ANTES da lista, e com o motivo.
                      Este era o ponto cego do popup antigo: as conversas sem
                      negócio eram descartadas em silêncio e o atendente só
                      descobria pelo aviso no fim, depois de já ter disparado. */}
                  {semNegocio.length > 0 && (
                    <div className="flex gap-2.5 rounded-lg border p-3 mb-3" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" color="#B45309" />
                      <div className="text-xs leading-relaxed" style={{ color: "#92400E" }}>
                        <strong>{semNegocio.length} {semNegocio.length === 1 ? termo.singular : termo.plural} {semNegocio.length === 1 ? "fica" : "ficam"} de fora</strong> por não terem negócio vinculado:
                        a automação age sobre o negócio do contato.
                        <div className="mt-1 opacity-80">{semNegocio.map(c => c.nome).join(", ")}</div>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-border divide-y">
                    {comNegocio.map(c => (
                      <div key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: "#128A68" }}>
                          {c.nome.trim().charAt(0).toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{c.nome}</div>
                          {c.telefone && <div className="text-xs text-muted-foreground truncate">{c.telefone}</div>}
                        </div>
                      </div>
                    ))}
                    {comNegocio.length === 0 && (
                      <p className="text-sm text-muted-foreground py-6 text-center px-4">
                        Nenhum dos selecionados tem negócio vinculado.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Rodapé */}
            <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2">
              {passo > 1 && (
                <Button variant="outline" disabled={executando} onClick={() => setPasso(1)}>Voltar</Button>
              )}
              {passo === 1 && (
                <Button disabled={!automacaoId} onClick={() => setPasso(2)}>Próximo</Button>
              )}
              {passo === 2 && (
                <Button
                  className="gap-2"
                  disabled={executando || comNegocio.length === 0 || !automacaoId}
                  onClick={() => automacaoId && onExecutar(automacaoId)}
                >
                  {executando
                    ? "Executando…"
                    : <><Play size={15} /> Executar em {comNegocio.length} {comNegocio.length === 1 ? termo.singular : termo.plural}</>}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
