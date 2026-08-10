// Seletor da tag que ativa um agente num negócio.
//
// A tag é o vínculo explícito lead -> agente (agents.activation_tag). Antes o
// sistema usava a string fixa "Agente" para a empresa inteira e inferia QUAL
// agente atendia pela linha de WhatsApp, o que era ambíguo com mais de um
// agente. Aqui o usuário escolhe uma tag existente ou cria na hora.
//
// Usado em dois lugares: no diálogo "Novo agente" e no card em /agentes.

import { useState } from "react";
import { ChevronDown, Plus, Check } from "lucide-react";
import { useCRM } from "@/context/CRMContext";
import { toast } from "sonner";

// Mesma cor que o Multiatendimento usa no filtro do agente.
const COR_PADRAO = "#6D28D9";

type Props = {
  value: string | null;
  onChange: (tagName: string) => void;
  /** tag -> nome do agente que já a usa. Uma tag ativa no máximo um agente. */
  ocupadas?: Record<string, string>;
  placeholder?: string;
};

export function AgentActivationTagPicker({ value, onChange, ocupadas = {}, placeholder = "Escolher tag" }: Props) {
  const { crmTags, addTag } = useCRM();
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [nomeNova, setNomeNova] = useState("");
  const [salvando, setSalvando] = useState(false);

  const tagAtual = crmTags.find((t) => t.name === value);

  async function criarTag() {
    const nome = nomeNova.trim();
    if (!nome) return;
    if (crmTags.some((t) => t.name.toLowerCase() === nome.toLowerCase())) {
      toast.error("Já existe uma tag com esse nome. Selecione ela na lista.");
      return;
    }
    setSalvando(true);
    const ok = await addTag(nome, `Ativa o agente neste negócio. Remover a tag devolve a conversa para atendimento humano.`, COR_PADRAO);
    setSalvando(false);
    if (!ok) return;
    onChange(nome);
    setNomeNova("");
    setCriando(false);
    setAberto(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm bg-card transition-colors min-h-9 ${
          aberto ? "border-primary ring-1 ring-primary/20" : "border-gray-400 hover:border-foreground/30"
        }`}
      >
        {value ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: (tagAtual?.color ?? COR_PADRAO) + "22", color: tagAtual?.color ?? COR_PADRAO }}
          >
            {value}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown size={14} className="text-muted-foreground shrink-0 ml-2" />
      </button>

      {aberto && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-card-border bg-card shadow-md overflow-hidden">
          <div className="max-h-44 overflow-y-auto">
            {crmTags.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground italic">Nenhuma tag cadastrada.</p>
            ) : (
              crmTags.map((tag) => {
                // Tag já usada por OUTRO agente fica visível mas bloqueada:
                // esconder faria o usuário procurar uma tag que ele sabe que
                // existe sem entender por que sumiu.
                const donoOutro = ocupadas[tag.name];
                const bloqueada = !!donoOutro && donoOutro !== "__self__";
                return (
                  <button
                    key={tag.id}
                    type="button"
                    disabled={bloqueada}
                    onClick={() => { onChange(tag.name); setAberto(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                      bloqueada ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tag.color }} />
                      <span className="truncate">{tag.name}</span>
                      {bloqueada && <span className="text-[10px] text-muted-foreground shrink-0">em uso por {donoOutro}</span>}
                    </span>
                    {value === tag.name && <Check size={12} className="text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-card-border p-2">
            {criando ? (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={nomeNova}
                  onChange={(e) => setNomeNova(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void criarTag(); } }}
                  placeholder="Nome da tag"
                  className="flex-1 px-2 py-1.5 text-sm rounded border border-card-border bg-background focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => void criarTag()}
                  className="px-2.5 py-1.5 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50"
                >
                  {salvando ? "..." : "Criar"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCriando(true)}
                className="w-full flex items-center gap-1.5 px-1 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus size={13} /> Criar nova tag
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
