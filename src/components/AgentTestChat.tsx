// Conversa de teste com o agente, antes de soltá-lo num lead de verdade.
//
// Roda o MESMO prompt da conversa real: o backend reaproveita
// montarExecucaoDoAgente, então o que você lê aqui é o que o lead leria. O que
// muda é só o destino -- nada vai para o WhatsApp e nada é gravado no negócio.
//
// As ações de escrita (qualificar, agendar, mover etapa) aparecem declaradas
// em vez de acontecerem. Ver o que o agente FARIA é a parte que nenhuma
// conversa real entrega antes de já ter acontecido.

import { useState, useRef, useEffect } from "react";
import { Send, RotateCcw, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type Mensagem = { de: "lead" | "agente"; texto: string; acoes?: string[] };

// A conversa fica no navegador, por agente, e só some no "Recomeçar".
//
// Sem isso ela vivia apenas em memória, e o ciclo para o qual esta tela existe
// -- testar, ver algo errado, ir ajustar em Instruções, voltar -- destruía o
// teste toda vez, porque trocar de aba desmonta o componente. Recarregar a
// página tinha o mesmo efeito.
//
// localStorage e não banco: isto é rascunho de quem está configurando, não
// registro do negócio. Guardar no servidor exigiria migração, RLS, política de
// expiração e uma resposta para "quem enxerga o teste de quem" -- peso demais
// para um bloco de notas.
const chaveConversa = (agentId: string) => `rezult:teste-agente:${agentId}`;
// Teto para a conversa não crescer sem fim no armazenamento do navegador.
const MAX_MENSAGENS_GUARDADAS = 60;

function lerConversaSalva(agentId: string): Mensagem[] {
  try {
    const bruto = localStorage.getItem(chaveConversa(agentId));
    const dados = bruto ? JSON.parse(bruto) : null;
    return Array.isArray(dados) ? (dados as Mensagem[]) : [];
  } catch {
    // Dado corrompido não pode derrubar a tela: começa vazio.
    return [];
  }
}

export function AgentTestChat({ agentId }: { agentId: string }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>(() => lerConversaSalva(agentId));
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  // Troca de agente troca a conversa: o histórico de um não faz sentido no
  // prompt do outro.
  useEffect(() => {
    setMensagens(lerConversaSalva(agentId));
    setErro(null);
  }, [agentId]);

  useEffect(() => {
    try {
      localStorage.setItem(chaveConversa(agentId), JSON.stringify(mensagens.slice(-MAX_MENSAGENS_GUARDADAS)));
    } catch { /* armazenamento cheio ou bloqueado: o teste segue só em memória */ }
  }, [mensagens, agentId]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, enviando]);

  async function enviar() {
    const texto = entrada.trim();
    if (!texto || enviando) return;
    const historico: Mensagem[] = [...mensagens, { de: "lead", texto }];
    setMensagens(historico);
    setEntrada("");
    setErro(null);
    setEnviando(true);

    try {
      const { data, error } = await supabase.functions.invoke("agent-sds-qualify", {
        body: {
          preview: true,
          agent_id: agentId,
          mensagens: historico.map((m) => ({ de: m.de, texto: m.texto })),
        },
      });

      // functions.invoke NÃO lança em erro HTTP: sem checar as duas coisas, a
      // tela ficaria em silêncio como se o agente não tivesse o que dizer.
      const falha = (data as { error?: string } | null)?.error;
      const detalhe = (data as { detalhe?: string | null } | null)?.detalhe;
      if (error || falha) {
        // O detalhe é a resposta crua do provedor de IA (chave sem acesso ao
        // modelo, crédito acabado, id inválido). Sem ele o usuário lia "tente
        // de novo" para um problema que nenhuma tentativa resolve.
        setErro(
          falha === "no_company_api_key"
            ? "Cadastre a chave de IA do provedor do modelo escolhido em Configurações para testar."
            : falha === "ai_request_failed"
            ? `O provedor de IA recusou a chamada.${detalhe ? ` ${detalhe}` : " Verifique a chave e o modelo escolhido em Modelos."}`
            : falha === "forbidden" || falha === "unauthorized"
            ? "Você não tem acesso a este agente."
            : falha === "agent_not_found"
            ? "Agente não encontrado. Recarregue a página."
            : "Não consegui falar com o agente agora. Tente de novo.",
        );
        return;
      }

      const respostas = ((data as { respostas?: string[] })?.respostas ?? []).filter(Boolean);
      const acoes = ((data as { acoes?: string[] })?.acoes ?? []).filter(Boolean);
      if (!respostas.length) {
        setErro("O agente não devolveu mensagem nenhuma nesta rodada.");
        return;
      }
      // As ações ficam na ÚLTIMA bolha: elas aconteceram ao longo da rodada
      // inteira, não de uma mensagem específica, e repeti-las em cada parte
      // daria a impressão de que o agente agendou três vezes.
      setMensagens([
        ...historico,
        ...respostas.map((t, i) => ({
          de: "agente" as const,
          texto: t,
          acoes: i === respostas.length - 1 && acoes.length ? acoes : undefined,
        })),
      ]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-[14px] font-semibold text-[#111111]">Testar agente</h3>
          <p className="text-[12px] text-[#767676]">
            Converse como se fosse o lead. É o mesmo agente e o mesmo prompt da conversa real, mas nada é enviado
            no WhatsApp e nada é gravado no negócio. A conversa fica guardada até você clicar em Recomeçar, então
            dá para sair, ajustar o agente e voltar de onde parou.
          </p>
        </div>
        {mensagens.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMensagens([]);
              setErro(null);
              try { localStorage.removeItem(chaveConversa(agentId)); } catch { /* ignora */ }
            }}
            className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#767676] hover:text-[#111111] transition-colors cursor-pointer"
          >
            <RotateCcw size={13} /> Recomeçar
          </button>
        )}
      </div>

      <div className="flex-1 min-h-[280px] overflow-y-auto rounded-xl border border-[#EEEEEE] bg-white p-4 space-y-3">
        {mensagens.length === 0 && !enviando && (
          <div className="h-full flex flex-col items-center justify-center text-center py-10">
            <p className="text-[13px] font-medium text-[#111111] mb-1">Comece como um lead começaria</p>
            <p className="text-[12px] text-[#767676] max-w-[360px]">
              Escreva algo que um cliente escreveria de verdade, tipo "oi, vi o anúncio de vocês" ou "quanto custa?".
            </p>
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.de === "lead" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[78%]">
              <div
                className={`px-3 py-2 rounded-2xl text-[13px] whitespace-pre-wrap break-words ${
                  m.de === "lead"
                    ? "bg-[#128A68] text-white rounded-br-sm"
                    : "bg-[#F5F5F5] text-[#111111] rounded-bl-sm"
                }`}
              >
                {m.texto}
              </div>
              {m.acoes && (
                <div className="mt-1.5 rounded-lg border border-dashed border-[#CCCCCC] bg-[#FAFAFA] px-2.5 py-2 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-[#767676] font-semibold">No CRM, o agente</p>
                  {m.acoes.map((a, j) => (
                    <p key={j} className="flex items-start gap-1.5 text-[11px] text-[#111111]">
                      <Settings2 size={11} className="mt-0.5 shrink-0 text-[#767676]" /> {a}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {enviando && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-[#F5F5F5] text-[#767676] text-[13px] flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" /> escrevendo...
            </div>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {erro && <p className="text-[12px] text-[#DC2626] mt-2 break-words">{erro}</p>}

      <div className="flex items-center gap-2 mt-3">
        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
          placeholder="Escreva como se fosse o lead..."
          disabled={enviando}
          className="flex-1 px-3 py-2 rounded-lg border border-[#EEEEEE] bg-white text-[13px] focus:outline-none focus:border-primary disabled:opacity-60"
        />
        <Button onClick={() => void enviar()} disabled={enviando || !entrada.trim()} className="shrink-0">
          <Send size={14} className="mr-1.5" /> Enviar
        </Button>
      </div>
    </div>
  );
}
