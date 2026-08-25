import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIdioma } from "@/context/IdiomaContext";
import { IDIOMAS, NOME_DO_IDIOMA } from "@/i18n/dicionarios";
import { BANDEIRA } from "@/components/icons/Bandeiras";

/**
 * Troca o idioma da interface.
 *
 * Bandeira à esquerda e nome à direita, em cada linha. O nome vai escrito NO
 * próprio idioma -- quem caiu numa tela que não entende procura "English", não
 * "Inglês" --, e a bandeira é o que se acha antes de ler qualquer coisa.
 *
 * Fechado, mostra o nome por extenso, e não a sigla: "PT" e "EN" são código,
 * não palavra, e obrigam a decifrar antes de decidir. O botão muda de largura
 * conforme o idioma escolhido, e como ele fica preso ao canto direito da tela,
 * quem se ajusta é a borda esquerda dele.
 */
export function SeletorDeIdioma({ className }: { className?: string }) {
  const { idioma, setIdioma, t } = useIdioma();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("idioma.rotulo")}
          className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted ${className ?? ""}`}
        >
          {(() => { const Bandeira = BANDEIRA[idioma]; return <Bandeira />; })()}
          {NOME_DO_IDIOMA[idioma]}
          <ChevronDown size={13} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        {IDIOMAS.map(i => {
          const Bandeira = BANDEIRA[i];
          return (
            <DropdownMenuItem key={i} onClick={() => setIdioma(i)} className="text-sm gap-2">
              <Bandeira />
              {NOME_DO_IDIOMA[i]}
              {/* O visto ocupa espaço mesmo quando invisível: removê-lo do
                  fluxo deslocaria o nome do idioma a cada troca. */}
              <Check size={14} className={`ml-auto ${i === idioma ? "text-primary" : "invisible"}`} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
