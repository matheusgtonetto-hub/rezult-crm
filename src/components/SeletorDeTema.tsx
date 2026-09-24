import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useIdioma } from "@/context/IdiomaContext";
import { lerTemaLocal, aplicarTema, type Tema } from "@/lib/tema";

/**
 * Claro ou escuro, nas telas de antes do login.
 *
 * ─── Por que não é o mesmo botão da barra lateral ───────────────────────────
 *
 * O da barra lateral é um botão só, que alterna, e grava a escolha no perfil
 * do Supabase. Aqui não há perfil: as telas públicas ficam fora do
 * `ProfileProvider` (ver App.tsx), então a escolha vive no navegador, pelo
 * `src/lib/tema.ts`. Quando a pessoa entrar, o perfil assume e sobrescreve --
 * ele é a verdade entre dispositivos.
 *
 * ─── Por que dois botões, e não um que alterna ──────────────────────────────
 *
 * Porque aqui ele fica ao lado do seletor de idioma, e os dois respondem à
 * mesma pergunta: "como esta tela se apresenta". O de idioma MOSTRA o estado
 * atual ("Português"), então o de tema também mostra: os dois lados visíveis,
 * o atual aceso. Um botão que alterna esconde metade da informação e obriga a
 * descobrir clicando.
 */
export function SeletorDeTema({ className }: { className?: string }) {
  const { t } = useIdioma();
  const [tema, setTema] = useState<Tema>(lerTemaLocal);

  // O `main.tsx` já aplicou o tema antes do primeiro quadro; isto cobre o caso
  // de a escolha ter mudado em outra aba e o React remontar com o valor velho.
  useEffect(() => { aplicarTema(tema); }, [tema]);

  const opcoes: { valor: Tema; Icone: typeof Sun; rotulo: string }[] = [
    { valor: "light", Icone: Sun,  rotulo: t("tema.claro") },
    { valor: "dark",  Icone: Moon, rotulo: t("tema.escuro") },
  ];

  return (
    <div
      role="group"
      aria-label={t("tema.rotulo")}
      className={`inline-flex h-[var(--control-h-sm)] items-center gap-0.5 rounded-full border border-input bg-card px-1 ${className ?? ""}`}
    >
      {opcoes.map(({ valor, Icone, rotulo }) => {
        const ativo = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            aria-label={rotulo}
            aria-pressed={ativo}
            title={rotulo}
            onClick={() => setTema(valor)}
            className={`flex h-[28px] w-[28px] items-center justify-center rounded-full transition-colors ${
              ativo
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icone size={14} strokeWidth={ativo ? 2.25 : 1.75} />
          </button>
        );
      })}
    </div>
  );
}
