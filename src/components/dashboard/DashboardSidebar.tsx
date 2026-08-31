import { Briefcase, Filter, Users, type LucideIcon } from "lucide-react";
import { CrmWhatsAppIcon } from "@/components/icons/CrmWhatsAppIcon";

/**
 * Barra lateral do Dashboard, no molde da de Pipelines.
 *
 * As quatro visões eram abas em cima, à direita do título. Cabiam, mas eram
 * quatro rótulos apertados numa fileira -- "Multiatendimento" sozinho ocupa mais
 * que os outros três juntos -- e a fileira disputava a linha do topo com o
 * seletor de período. Na lateral cada uma tem a sua linha, ganha ícone e a
 * seleção fica visível o tempo todo, do mesmo jeito que a pessoa já escolhe
 * pipeline em `/pipeline`.
 *
 * Mesmas medidas e mesmo visual da `PipelineSidebar`: 240px de largura, título
 * centralizado sobre um filete, e o item ativo com fundo tingido, tarja verde à
 * esquerda e 95% da largura. Duas barras parecidas em telas diferentes só
 * ajudam se forem realmente a mesma barra.
 */

export type VisaoDoDashboard = "negocios" | "multiatendimento" | "funil" | "times";

/**
 * O rótulo de cada visão, para quem precisa dele fora da barra.
 *
 * O título do painel É o rótulo daqui, sem acréscimo nenhum, então renomear uma
 * visão renomeia o título junto. Com o texto escrito duas vezes, bastaria
 * trocar num lugar para a barra dizer uma coisa e o painel outra.
 *
 * Os ids não acompanham os rótulos, e é por isso que `negocios` e `funil` já
 * não se parecem com o que está escrito na tela. Eles são a chave da aba,
 * aparecem no `TabsContent` e no valor guardado, e trocá-los seria renomear em
 * cinco lugares para mudar uma palavra que só a tela mostra. Esta tabela é
 * justamente o ponto onde os dois deixam de precisar coincidir.
 */
export const ROTULO_DA_VISAO: Record<VisaoDoDashboard, string> = {
  negocios: "Performance geral",
  multiatendimento: "Multiatendimento",
  funil: "Performance por pipeline",
  times: "Resultado da equipe",
};

/**
 * A ordem aqui é a ordem na tela, e ela vai do geral para o específico: o
 * resultado inteiro (Performance geral), depois repartido por pipeline, depois
 * por pessoa, e por fim o atendimento, que é o único recorte que não fala de
 * negócio fechado e sim de conversa.
 *
 * Antes seguia o caminho do negócio -- entra, alguém atende, anda pelas etapas,
 * e no fim se olha quem fez. Aquilo descrevia a operação, mas deixava o
 * Multiatendimento em segundo lugar, e é justamente a visão que a maioria abre
 * por último: quem entra no dashboard vem atrás de número fechado, não de fila
 * de conversa.
 *
 * O ícone de cada uma é o mesmo da aba correspondente na barra lateral do app --
 * quem já associou o raio a Disparos ou o funil a Pipelines reencontra o mesmo
 * símbolo aqui.
 */
const VISOES: { id: VisaoDoDashboard; Icone: LucideIcon | typeof CrmWhatsAppIcon }[] = [
  { id: "negocios",         Icone: Briefcase },
  { id: "funil",            Icone: Filter },
  { id: "times",            Icone: Users },
  { id: "multiatendimento", Icone: CrmWhatsAppIcon },
];

export function DashboardSidebar({
  ativa,
  aoEscolher,
}: {
  ativa: VisaoDoDashboard;
  aoEscolher: (v: VisaoDoDashboard) => void;
}) {
  return (
        // `h-full` é o que faz o fundo branco e o filete da direita irem até o pé da
    // tela. Sem ele o `<aside>` para na altura do último item, e a barra vira um
    // retângulo curto no canto superior -- o contêiner de fora pode ter a altura
    // toda que a caixa de dentro não acompanha sozinha.
    <aside className="w-60 h-full shrink-0 bg-card flex flex-col shadow-rail relative z-10 border-r border-gray-200">
      <div className="px-4 pt-4 pb-3 border-b border-card-border">
        <p className="text-base font-semibold text-foreground tracking-tight text-center">Dashboard</p>
      </div>

      {/*
        `role="tablist"` com `aria-selected` nos itens: para quem ouve a tela,
        isto continua sendo um seletor de abas, mesmo tendo virado lista na
        lateral. Sem isso seriam quatro botões soltos, sem indicação de qual está
        no ar.
      */}
      <nav className="flex-1 overflow-y-auto py-2 px-[2px] space-y-[3px]" role="tablist" aria-label="Visões do dashboard">
        {VISOES.map(({ id, Icone }) => {
          const ativo = id === ativa;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => aoEscolher(id)}
              className={`flex items-center gap-2 px-3 h-[32px] font-normal leading-[16px] border-l-[3px] transition-colors ${
                ativo
                  ? "w-[95%] mx-auto bg-primary/10 border-primary pl-[13px] rounded-[4px]"
                  : "w-full border-transparent hover:bg-muted/50"
              }`}
              style={{ fontFamily: "Inter, sans-serif", fontSize: "13px", fontWeight: 500, color: "#09090b" }}
            >
              <Icone size={14} className={ativo ? "text-primary" : ""} />
              <span className="truncate text-left flex-1">{ROTULO_DA_VISAO[id]}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
