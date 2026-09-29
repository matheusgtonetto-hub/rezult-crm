import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Base de Conhecimento: os materiais da empresa, num lugar só.
 *
 * ─── O que este componente deixou de fazer (dono, 28/09/2026) ──────────────
 *
 * Ele guardava DUAS coisas: as 8 perguntas sobre o negócio e os arquivos. As
 * perguntas foram para dentro de cada agente, na aba Instruções, porque uma
 * empresa pode ter um agente por PRODUTO -- e aí "o que vende", "preço" e
 * "objeções" mudam de agente para agente.
 *
 * Aqui ficou só o material, que é o que de fato vale para todos: sobe uma vez,
 * e cada agente escolhe na aba dele quais usar.
 *
 * ─── Por que os arquivos entram de um jeito diferente das perguntas ────────
 *
 * As perguntas entram INTEIRAS no prompt, em toda chamada. Os arquivos são
 * fatiados, viram vetor, e só os trechos parecidos com a pergunta do lead
 * entram. Por isso um manual de 40 páginas cabe aqui e não caberia lá.
 */

type Documento = {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "ready" | "error";
  error_detail: string | null;
  quando_usar: string | null;
  enabled: boolean;
  trechos: number;
};

const EXTENSOES = ["pdf", "txt", "csv", "html", "htm", "json"];
const ROTULO_STATUS: Record<Documento["status"], string> = {
  pending: "Na fila", processing: "Processando", ready: "Pronto", error: "Erro",
};

export function BaseDeConhecimento({ companyId, userId }: { companyId?: string; userId?: string }) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunhoQuando, setRascunhoQuando] = useState("");
  const entradaArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!companyId) return;
    // `documentos_da_empresa` e não um select direto: ela traz a CONTAGEM DE
    // TRECHOS junto, que é o que revela o documento marcado "pronto" e com zero
    // indexado. Existe um assim nos dados reais (CNPJ.pdf, de 05/08/2026), de
    // antes de o ingestor passar a checar o erro do insert -- ele aparecia como
    // funcionando e não entregava nada ao agente.
    const { data } = await supabase.rpc("documentos_da_empresa", { p_company_id: companyId });
    setDocumentos(((data ?? []) as Documento[]).map(d => ({ ...d, trechos: Number(d.trechos) })));
    setCarregando(false);
  }, [companyId]);

  useEffect(() => { void carregar(); }, [carregar]);

  /**
   * O agrupamento interno. Continua existindo no banco porque os documentos
   * antigos apontam para ele, mas deixou de ser conceito de usuário: uma base
   * só, e a dica de "quando usar" vive no documento.
   */
  async function agrupamento(): Promise<string> {
    const { data: existente } = await supabase.from("agent_knowledge_bases")
      .select("id").eq("company_id", companyId!).is("agent_id", null).limit(1);
    if (existente?.[0]?.id) return existente[0].id as string;
    const { data: criada, error } = await supabase.from("agent_knowledge_bases")
      .insert({ agent_id: null, company_id: companyId, owner_id: userId, name: "Base de Conhecimento", description: null })
      .select("id").single();
    if (error || !criada) throw error ?? new Error("não foi possível criar a base");
    return criada.id as string;
  }

  async function enviarArquivo(file: File) {
    if (!companyId || !userId) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !EXTENSOES.includes(ext)) { toast.error("Formato não suportado. Use PDF, TXT, CSV, HTML ou JSON."); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Arquivo muito grande, máx. 50MB."); return; }

    setEnviando(true);
    try {
      const kbId = await agrupamento();
      // Chave do Storage só em ASCII: acento e espaço fazem o upload falhar. O
      // nome original fica em file_name, que é o que aparece na tela.
      const nomeSeguro = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
      const caminho = `${companyId}/${crypto.randomUUID()}-${nomeSeguro}`;
      const { error: erroUpload } = await supabase.storage.from("agent-knowledge").upload(caminho, file);
      if (erroUpload) throw erroUpload;

      // `agent_id: null` é o que marca "vale para todos os agentes". Cada agente
      // desliga o que não quiser, na aba dele.
      const { data: doc, error: erroDoc } = await supabase.from("agent_knowledge_documents")
        .insert({ agent_id: null, company_id: companyId, owner_id: userId, knowledge_base_id: kbId, file_name: file.name, storage_path: caminho, status: "pending" })
        .select("id").single();
      if (erroDoc || !doc) throw erroDoc;

      const { data: sessao } = await supabase.auth.getSession();
      const jwt = sessao.session?.access_token;
      const { error: erroIngestao } = await supabase.functions.invoke("agent-kb-ingest", {
        body: { documentId: doc.id },
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      });
      if (erroIngestao) throw erroIngestao;
      toast.success("Arquivo enviado, processando");
      void carregar();
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

  async function salvarQuandoUsar(doc: Documento) {
    if (!companyId) return;
    const texto = rascunhoQuando.trim() || null;
    const { error } = await supabase.from("agent_knowledge_documents")
      .update({ quando_usar: texto }).eq("id", doc.id).eq("company_id", companyId);
    if (error) { toast.error("Erro ao salvar"); return; }
    setDocumentos((atual) => atual.map((d) => (d.id === doc.id ? { ...d, quando_usar: texto } : d)));
    setEditando(null);
  }

  const prontos = documentos.filter((d) => d.status === "ready");
  // Documento "pronto" sem trecho nenhum: a tela diz que funciona e o agente
  // não recebe nada dali. É o único estado que merece alerta no cartão.
  const mudos = prontos.filter((d) => d.trechos === 0).length;

  return (
    <>
      <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 h-full flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[color:var(--accent-100)] flex items-center justify-center text-[color:var(--text-link)] shrink-0">
          <BookOpen size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-[color:var(--text-heading)]">Base de Conhecimento</p>
          <p className="text-[12px] text-[color:var(--text-muted)] leading-relaxed">
            Os materiais da empresa. Suba uma vez: cada agente escolhe quais usar.
          </p>
          {!carregando && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[12px] font-semibold text-[color:var(--text-body)] tabular-nums">
                {documentos.length} arquivo{documentos.length === 1 ? "" : "s"}
              </span>
              {mudos > 0 && (
                <span
                  title="Documento processado que não gerou nenhum trecho. O agente não recebe nada dele."
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-none bg-[color:var(--warning-bg)] text-[color:var(--warning-fg)]"
                >
                  <AlertTriangle size={11} /> {mudos} sem conteúdo
                </span>
              )}
            </div>
          )}
        </div>
        <Button onClick={() => setAberto(true)} disabled={carregando} className="shrink-0">
          {documentos.length === 0 ? <><Upload size={16} /> Subir material</> : "Gerenciar materiais"}
        </Button>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-[640px] max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Base de Conhecimento</DialogTitle>
            <DialogDescription>
              Materiais que os agentes consultam quando o assunto aparece na conversa. Vale para toda a empresa; em cada agente você escolhe quais ele usa.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 py-1">
            {documentos.length === 0 && !carregando && (
              <p className="text-[13px] text-[color:var(--text-muted)] text-center py-8">
                Nenhum material ainda. PDF, TXT, CSV, HTML ou JSON, até 50MB.
              </p>
            )}

            {documentos.map((doc) => {
              const mudo = doc.status === "ready" && doc.trechos === 0;
              return (
                <div key={doc.id} className="rounded-[10px] border border-card-border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <FileText size={16} className="mt-0.5 shrink-0 text-[color:var(--text-muted)]" />
                    <div className="flex-1 min-w-0">
                      <p title={doc.file_name} className="text-[13px] font-medium text-[color:var(--text-heading)] truncate">{doc.file_name}</p>
                      <p className="text-[12px] text-[color:var(--text-muted)]">
                        {ROTULO_STATUS[doc.status]}
                        {doc.status === "ready" && ` · ${doc.trechos} trecho${doc.trechos === 1 ? "" : "s"}`}
                        {doc.error_detail && ` · ${doc.error_detail}`}
                      </p>
                      {mudo && (
                        <p className="text-[12px] mt-1 leading-snug" style={{ color: "var(--warning-fg)" }}>
                          Processado, mas não gerou nenhum trecho. Os agentes não recebem nada deste arquivo — costuma ser PDF só de imagem. Suba de novo em texto.
                        </p>
                      )}

                      {editando === doc.id ? (
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            autoFocus
                            value={rascunhoQuando}
                            onChange={(e) => setRascunhoQuando(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void salvarQuandoUsar(doc); if (e.key === "Escape") setEditando(null); }}
                            placeholder="Ex: consulte quando perguntarem sobre preços"
                            className="h-8 text-[13px]"
                          />
                          <Button size="sm" className="h-8 shrink-0" onClick={() => void salvarQuandoUsar(doc)}>Salvar</Button>
                        </div>
                      ) : (
                        /* "Quando usar" é opcional e entra no prompt junto do
                           trecho recuperado. Substituiu a descrição do
                           agrupamento, que dizia a mesma coisa para um conjunto
                           inteiro de arquivos. */
                        <button
                          type="button"
                          onClick={() => { setEditando(doc.id); setRascunhoQuando(doc.quando_usar ?? ""); }}
                          className="text-[12px] mt-1 text-left text-[color:var(--text-link)] hover:underline cursor-pointer"
                        >
                          {doc.quando_usar ? `Quando usar: ${doc.quando_usar}` : "+ Dizer quando usar este material"}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => void excluirArquivo(doc)}
                      aria-label={`Excluir ${doc.file_name}`}
                      className="shrink-0 text-[color:var(--text-muted)] hover:text-[color:var(--danger-fg)] transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-card-border">
            <input
              ref={entradaArquivo}
              type="file"
              className="hidden"
              accept={EXTENSOES.map((e) => `.${e}`).join(",")}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarArquivo(f); e.target.value = ""; }}
            />
            <Button variant="outline" className="w-full border-card-border" disabled={enviando} onClick={() => entradaArquivo.current?.click()}>
              {enviando ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : <><Upload size={16} /> Subir material</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
