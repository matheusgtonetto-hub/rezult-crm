import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Base da empresa: o que todos os agentes que conversam sabem sobre o negócio.
 *
 * A empresa preenche UMA vez e o Atendente, o SDR e o Closer leem. Antes, cada
 * agente tinha as próprias instruções e documentos, e com três agentes o mesmo
 * material teria de ser escrito três vezes. As instruções de cada agente
 * continuam existindo, como complemento do que é específico dele.
 *
 * Formato de entrevista, e não um campo livre: pergunta curta com exemplo diz o
 * que se espera, e dá para responder em dez minutos. Os campos entram inteiros
 * no prompt (agent-sds-qualify, carregarBaseDaEmpresa). Os arquivos são
 * opcionais e entram pela busca, gravados com agent_id nulo, que é o que marca
 * "vale para todos os agentes".
 */

type ChaveCampo =
  | "sobre_empresa" | "publico" | "oferta" | "condicoes"
  | "objecoes" | "perguntas_frequentes" | "horario_contato" | "links";

/** A mesma lista e a mesma ordem de CAMPOS_DA_BASE no agent-sds-qualify. */
export const CAMPOS_DA_BASE: { chave: ChaveCampo; pergunta: string; exemplo: string }[] = [
  { chave: "sobre_empresa", pergunta: "O que a sua empresa faz?", exemplo: "Ex: Atendemos clientes em todo o Brasil, presencial e online, com planos mensais e projetos avulsos." },
  { chave: "publico", pergunta: "Para quem você vende?", exemplo: "Ex: Donos de pequenas empresas de serviço que querem organizar o comercial." },
  { chave: "oferta", pergunta: "O que você vende e como funciona?", exemplo: "Ex: Plano mensal com acompanhamento semanal. Projeto avulso orçado conforme o escopo." },
  { chave: "condicoes", pergunta: "Preço, pagamento e condições", exemplo: "Ex: A partir de R$ 300 por mês. Pix, cartão em até 12x ou boleto. Sem fidelidade." },
  { chave: "objecoes", pergunta: "Objeções mais comuns e como responder", exemplo: "Ex: \"Está caro\": lembre que a primeira conversa é gratuita e sem compromisso." },
  { chave: "perguntas_frequentes", pergunta: "Perguntas que os clientes sempre fazem", exemplo: "Ex: Atende aos sábados? Sim, das 9h às 12h." },
  { chave: "horario_contato", pergunta: "Horário e canais de atendimento", exemplo: "Ex: Segunda a sexta, das 8h às 18h, pelo WhatsApp e presencialmente." },
  { chave: "links", pergunta: "Links que o agente pode enviar", exemplo: "Ex: Site, Instagram, página de agendamento." },
];

type Respostas = Record<ChaveCampo, string>;

const RESPOSTAS_VAZIAS: Respostas = {
  sobre_empresa: "", publico: "", oferta: "", condicoes: "",
  objecoes: "", perguntas_frequentes: "", horario_contato: "", links: "",
};

type Documento = { id: string; file_name: string; status: "pending" | "processing" | "ready" | "error"; error_detail: string | null };

const EXTENSOES = ["pdf", "txt", "csv", "html", "htm", "json"];
const ROTULO_STATUS: Record<Documento["status"], string> = {
  pending: "Pendente", processing: "Processando", ready: "Pronto", error: "Erro",
};

/** Quantas perguntas têm resposta. Usado aqui e pela trilha de Início. */
export function respostasPreenchidas(r: Partial<Respostas> | null | undefined): number {
  return CAMPOS_DA_BASE.filter((c) => String(r?.[c.chave] ?? "").trim()).length;
}

export function BaseDaEmpresa({ companyId, userId }: { companyId?: string; userId?: string }) {
  const [salvas, setSalvas] = useState<Respostas>(RESPOSTAS_VAZIAS);
  const [rascunho, setRascunho] = useState<Respostas>(RESPOSTAS_VAZIAS);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const entradaArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!companyId) return;
    const [{ data: base }, { data: docs }] = await Promise.all([
      supabase.from("company_knowledge_base").select("*").eq("company_id", companyId).maybeSingle(),
      supabase.from("agent_knowledge_documents")
        .select("id, file_name, status, error_detail")
        .eq("company_id", companyId).is("agent_id", null)
        .order("created_at", { ascending: false }),
    ]);
    const lidas = { ...RESPOSTAS_VAZIAS };
    for (const c of CAMPOS_DA_BASE) lidas[c.chave] = String((base as Record<string, unknown> | null)?.[c.chave] ?? "");
    setSalvas(lidas);
    setDocumentos((docs ?? []) as Documento[]);
    setCarregando(false);
  }, [companyId]);

  useEffect(() => { void carregar(); }, [carregar]);

  function abrir() {
    setRascunho(salvas);
    setAberto(true);
  }

  async function salvar() {
    if (!companyId || !userId) return;
    setSalvando(true);
    const linha: Record<string, unknown> = { company_id: companyId, owner_id: userId, updated_at: new Date().toISOString(), updated_by: userId };
    for (const c of CAMPOS_DA_BASE) linha[c.chave] = rascunho[c.chave].trim();
    const { error } = await supabase.from("company_knowledge_base").upsert(linha, { onConflict: "company_id" });
    setSalvando(false);
    if (error) { toast.error(`Erro ao salvar a base: ${error.message}`); return; }
    setSalvas(Object.fromEntries(CAMPOS_DA_BASE.map((c) => [c.chave, rascunho[c.chave].trim()])) as Respostas);
    toast.success("Base da empresa salva");
    setAberto(false);
  }

  /**
   * A base de arquivos da empresa é uma linha de agent_knowledge_bases com
   * agent_id nulo. É criada no primeiro envio: quem nunca sobe arquivo não fica
   * com uma base vazia pendurada.
   */
  async function baseDeArquivos(): Promise<string> {
    const { data: existente } = await supabase.from("agent_knowledge_bases")
      .select("id").eq("company_id", companyId!).is("agent_id", null).limit(1);
    if (existente?.[0]?.id) return existente[0].id as string;
    const { data: criada, error } = await supabase.from("agent_knowledge_bases")
      .insert({ agent_id: null, company_id: companyId, owner_id: userId, name: "Arquivos da empresa", description: "Material da empresa, válido para todos os agentes" })
      .select("id").single();
    if (error || !criada) throw error ?? new Error("não foi possível criar a base de arquivos");
    return criada.id as string;
  }

  async function enviarArquivo(file: File) {
    if (!companyId || !userId) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !EXTENSOES.includes(ext)) { toast.error("Formato não suportado. Use PDF, TXT, CSV, HTML ou JSON."); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Arquivo muito grande, máx. 50MB."); return; }

    setEnviando(true);
    try {
      const kbId = await baseDeArquivos();
      // Chave do Storage só em ASCII: acento e espaço fazem o upload falhar. O
      // nome original fica em file_name, que é o que aparece na tela.
      const nomeSeguro = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
      const caminho = `${companyId}/${crypto.randomUUID()}-${nomeSeguro}`;
      const { error: erroUpload } = await supabase.storage.from("agent-knowledge").upload(caminho, file);
      if (erroUpload) throw erroUpload;

      const { data: doc, error: erroDoc } = await supabase.from("agent_knowledge_documents")
        .insert({ agent_id: null, company_id: companyId, owner_id: userId, knowledge_base_id: kbId, file_name: file.name, storage_path: caminho, status: "pending" })
        .select("id, file_name, status, error_detail").single();
      if (erroDoc || !doc) throw erroDoc;
      setDocumentos((atual) => [doc as Documento, ...atual]);

      const { data: sessao } = await supabase.auth.getSession();
      const jwt = sessao.session?.access_token;
      const { error: erroIngestao } = await supabase.functions.invoke("agent-kb-ingest", {
        body: { documentId: doc.id },
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      });
      if (erroIngestao) throw erroIngestao;
      toast.success("Arquivo enviado, processando");
      setTimeout(() => { void carregar(); }, 4000);
    } catch (err) {
      const motivo = err instanceof Error ? err.message
        : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "";
      toast.error(motivo ? `Erro ao enviar arquivo: ${motivo}` : "Erro ao enviar arquivo");
      void carregar();
    } finally {
      setEnviando(false);
    }
  }

  async function excluirArquivo(doc: Documento) {
    if (!companyId) return;
    const { error } = await supabase.from("agent_knowledge_documents").delete().eq("id", doc.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao excluir o arquivo"); return; }
    setDocumentos((atual) => atual.filter((d) => d.id !== doc.id));
  }

  const preenchidas = respostasPreenchidas(salvas);
  const total = CAMPOS_DA_BASE.length;
  const completa = preenchidas === total;

  return (
    <>
      <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 h-full flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[color:var(--accent-100)] flex items-center justify-center text-[color:var(--text-link)] shrink-0">
          <BookOpen size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-[color:var(--text-heading)]">Base da empresa</p>
          <p className="text-[12px] text-[color:var(--text-muted)] leading-relaxed">
            O que os agentes que conversam sabem sobre o seu negócio. Preencha uma vez: todos eles usam.
          </p>
          {!carregando && (
            <div className="flex items-center gap-3 mt-2">
              <div className="h-1.5 w-40 rounded-full bg-[color:var(--neutral-100)] overflow-hidden" aria-hidden>
                <div className="h-full bg-[color:var(--surface-accent-strong)] transition-[width] duration-300" style={{ width: `${(preenchidas / total) * 100}%` }} />
              </div>
              <span className="text-[12px] font-semibold text-[color:var(--text-body)] tabular-nums">
                {preenchidas} de {total} respostas · {documentos.length} arquivo{documentos.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>
        <Button onClick={abrir} disabled={carregando} className="shrink-0">
          {completa ? <><Check size={16} /> Revisar base</> : preenchidas > 0 ? "Continuar preenchendo" : "Preencher base"}
        </Button>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-[640px] max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Base da empresa</DialogTitle>
            <DialogDescription>
              Responda como explicaria para alguém novo no time. Os agentes só afirmam o que estiver aqui, então o que ficar em branco eles não inventam.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-1">
            {CAMPOS_DA_BASE.map((campo) => (
              <div key={campo.chave}>
                <Label htmlFor={`base-${campo.chave}`} className="text-[13px] font-semibold text-[color:var(--text-heading)]">{campo.pergunta}</Label>
                <Textarea
                  id={`base-${campo.chave}`}
                  value={rascunho[campo.chave]}
                  onChange={(e) => setRascunho((r) => ({ ...r, [campo.chave]: e.target.value }))}
                  placeholder={campo.exemplo}
                  rows={3}
                  className="mt-1 text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                />
              </div>
            ))}

            <p className="text-[12px] text-[color:var(--text-muted)]">
              Os produtos cadastrados em Configurações → Produtos também entram, com a descrição e o preço de cada um.
            </p>

            <div className="border-t border-[color:var(--border-default)] pt-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <p className="text-[13px] font-semibold text-[color:var(--text-heading)]">Arquivos (opcional)</p>
                  <p className="text-[12px] text-[color:var(--text-muted)]">Catálogo, tabela de preços, políticas. PDF, TXT, CSV, HTML ou JSON.</p>
                </div>
                <input
                  ref={entradaArquivo}
                  type="file"
                  accept=".pdf,.txt,.csv,.html,.htm,.json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarArquivo(f); e.target.value = ""; }}
                />
                <Button variant="outline" onClick={() => entradaArquivo.current?.click()} disabled={enviando} className="shrink-0">
                  {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Enviar arquivo
                </Button>
              </div>
              {documentos.length === 0 ? (
                <p className="text-[12px] text-[color:var(--text-muted)]">Nenhum arquivo enviado.</p>
              ) : (
                <ul className="space-y-1.5">
                  {documentos.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 p-2 bg-[color:var(--neutral-50)] rounded-md">
                      <FileText size={14} className="text-[color:var(--text-muted)] shrink-0" />
                      <span className="text-[12px] text-[color:var(--text-heading)] truncate flex-1" title={d.error_detail ?? d.file_name}>{d.file_name}</span>
                      <span className={`text-[12px] font-semibold ${d.status === "ready" ? "text-[color:var(--text-link)]" : d.status === "error" ? "text-[color:var(--danger-fg)]" : "text-[color:var(--text-muted)]"}`}>
                        {ROTULO_STATUS[d.status]}
                      </span>
                      <button type="button" onClick={() => void excluirArquivo(d)} aria-label={`Excluir ${d.file_name}`} className="text-[color:var(--text-muted)] hover:text-[color:var(--danger-fg)] p-0.5">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={salvando} >
              {salvando && <Loader2 size={14} className="animate-spin" />} Salvar base
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
