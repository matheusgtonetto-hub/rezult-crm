import { useState } from "react";
import { PainelAnel, type FatiaAnel } from "./PainelAnel";
import { fmt } from "./useDashboardHelpers";

/**
 * Resultado do período repartido por responsável.
 *
 * O que este arquivo faz é traduzir uma pessoa em fatia: escolher qual das
 * grandezas dita o tamanho dela e montar as linhas do popup. O desenho, o hover
 * e o furo com o nome vêm do `PainelAnel`, que segue separado por ser a forma
 * "anel sem legenda" do dashboard, e não um detalhe deste painel.
 */

export interface ResultadoDeResponsavel {
  nome: string;
  cor: string;
  /** Negócios atrelados a ele que entraram no período. */
  negocios: number;
  ganhos: number;
  perdidos: number;
  /** Soma dos negócios ganhos. */
  receita: number;
}

type Metrica = "quantidade" | "receita";

export function ResultadoResponsavelPanel({
  dados,
  className,
}: {
  dados: ResultadoDeResponsavel[];
  className?: string;
}) {
  /**
   * Quantidade x Receita, o mesmo par do "Resultado no período".
   *
   * Mora aqui, e não na página, porque nenhum outro painel lê esta escolha.
   * Hospedado lá em cima, seria mais um estado no meio de trinta e a próxima
   * pessoa teria que descobrir quem o consome.
   */
  const [metrica, setMetrica] = useState<Metrica>("quantidade");

  // Em receita o anel reparte dinheiro que entrou; em quantidade, os negócios
  // que o geraram. São a mesma coisa contada de duas formas, e é isso que faz o
  // botão trocar a leitura sem trocar o assunto. Negócios e perdidos ficam de
  // fora do anel nas duas: um negócio em aberto não é resultado, e o perdido é
  // resultado de sinal contrário -- somá-los na mesma pizza faria as fatias
  // pararem de significar "quanto deste resultado é dele".
  //
  // Os quatro números aparecem no popup nas duas métricas de propósito. O botão
  // troca o que o ANEL reparte, não o que a pessoa é: esconder perdidos no modo
  // receita obrigaria a voltar o botão para responder "e quanto ele perdeu?",
  // com o mouse já em cima da fatia certa.
  const fatias: FatiaAnel[] = dados
    .map(d => ({
      nome: d.nome,
      cor: d.cor,
      valor: metrica === "receita" ? d.receita : d.ganhos,
      linhas: [
        { rotulo: "Negócios", valor: String(d.negocios) },
        { rotulo: "Ganhos", valor: String(d.ganhos), destaque: metrica === "quantidade" },
        { rotulo: "Perdidos", valor: String(d.perdidos) },
        { rotulo: "Receita", valor: fmt(d.receita), destaque: metrica === "receita" },
      ],
    }))
    .sort((a, b) => b.valor - a.valor);

  /**
   * O pódio, abaixo do anel.
   *
   * Serve a duas coisas ao mesmo tempo: preenche a sobra de altura do cartão e
   * devolve por escrito o que o anel sozinho não diz sem o mouse -- quem são as
   * maiores fatias. Três porque é o que cabe sem o painel virar a tabela que
   * ele deixou de ter de propósito; do quarto em diante a resposta já está no
   * ranking de responsáveis mais abaixo na página.
   *
   * A bolinha repete a cor da fatia, e é ela que amarra as duas metades: sem a
   * cor, a lista seria um texto solto embaixo de um desenho.
   */
  const podio = fatias.filter(f => f.valor > 0).slice(0, 3);

  return (
    <PainelAnel
      className={className}
      titulo="Resultado por responsável"
      subtitulo="Passe o mouse para ver os números"
      fatias={fatias}
      rotuloCentro={metrica === "receita" ? "em vendas" : "ganhos"}
      formatarCentro={metrica === "receita" ? fmt : undefined}
      rodape={
        podio.length > 0 && (
          <div className="mt-4 pt-3 border-t border-card-border space-y-2">
            {podio.map((f, i) => (
              <div key={f.nome} className="flex items-center gap-2 text-xs">
                {/* A posição em corpo menor e cor secundária: ela ordena a
                    lista, mas quem interessa é o nome e o número. */}
                <span className="text-[10px] text-muted-foreground tabular-nums w-3 shrink-0">{i + 1}</span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.cor }} />
                <span className="truncate text-foreground">{f.nome}</span>
                <span className="ml-auto tabular-nums font-semibold text-foreground shrink-0">
                  {metrica === "receita" ? fmt(f.valor) : f.valor}
                </span>
              </div>
            ))}
          </div>
        )
      }
      acao={
        /* Mesmo par de botões do "Resultado no período", um ponto menor: 11px e
           metade do respiro lateral, como no painel de horários. É o que faz os
           dois caberem ao lado do título nos ~356px deste painel. O de origem
           segue em 12px porque ocupa a linha inteira e tem largura de sobra. */
        <div className="inline-flex rounded-lg border border-card-border p-0.5 bg-muted/40">
          {([
            { id: "quantidade", rotulo: "Quantidade" },
            { id: "receita", rotulo: "Receita" },
          ] as const).map(op => (
            <button
              key={op.id}
              onClick={() => setMetrica(op.id)}
              aria-pressed={metrica === op.id}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                metrica === op.id
                  ? "bg-card text-foreground shadow-elev-1"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {op.rotulo}
            </button>
          ))}
        </div>
      }
    />
  );
}
