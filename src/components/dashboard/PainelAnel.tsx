import { useState, type ReactNode } from "react";
import { Anel } from "./DonutDistribuicao";
import { CaixaTooltip, type LinhaTooltip } from "./CaixaTooltip";

/**
 * Painel de anel sem legenda: os números vivem no popup do mouse.
 *
 * É o formato para painéis estreitos. Numa coluna de 2/6 da linha sobram ~356px
 * por dentro, e as três colunas de número da legenda comem 244 deles -- o nome
 * ficaria com uns 112px, onde "Samantha Oliveira" não cabe. Sem legenda, o anel
 * ocupa a largura inteira e cada fatia entrega o retrato completo ao ser
 * apontada.
 *
 * A troca tem um custo, e ele é coberto de propósito: sem legenda as fatias
 * ficariam anônimas, então o furo do anel mostra o nome da fatia sob o mouse.
 * É o que responde "de quem é esta cor" sem gastar uma linha de tabela.
 *
 * Não é o `DonutDistribuicao`: aquele é anel MAIS tabela, e a tabela é o que sai
 * daqui. O desenho em si vem do mesmo `Anel` que ele usa, então espessura,
 * furo, respiro entre fatias e estado vazio continuam idênticos aos dos painéis
 * vizinhos -- é o que impede que um anel do dashboard pareça de outra família.
 */

export interface FatiaAnel {
  nome: string;
  /** Sem cor, entra a da paleta na posição do item (regra do `Anel`). */
  cor?: string;
  /** O que dita o tamanho da fatia. */
  valor: number;
  /**
   * Linhas do popup, na ordem em que aparecem.
   *
   * Chegam formatadas como texto porque misturam naturezas: contagem de
   * negócios e dinheiro na mesma lista. Deixar a formatação aqui abriria a
   * porta para o painel tentar somá-las.
   *
   * `destaque` marca a linha que dita o tamanho da fatia, para o número que
   * explica o desenho se distinguir dos que só o acompanham.
   */
  linhas: LinhaTooltip[];
}

function TooltipDoAnel({ active, payload }: { active?: boolean; payload?: { payload: FatiaAnel }[] }) {
  const fatia = payload?.[0]?.payload;
  if (!active || !fatia) return null;
  // A cor vai no título, e não nas linhas: a caixa inteira é de uma fatia só, e
  // repetir a bolinha em cada linha diria quatro vezes a mesma coisa.
  return <CaixaTooltip titulo={fatia.nome} cor={fatia.cor} linhas={fatia.linhas} />;
}

export function PainelAnel({
  titulo,
  subtitulo,
  acao,
  fatias,
  rotuloCentro,
  formatarCentro,
  altura = 190,
  rodape,
  className,
}: {
  titulo: string;
  subtitulo: string;
  /** Controles no canto do cabeçalho (o par Quantidade/Receita, por exemplo). */
  acao?: ReactNode;
  /** Já na ordem de exibição: o painel não reordena. */
  fatias: FatiaAnel[];
  /** Palavra sob o número do furo quando nenhuma fatia está apontada. */
  rotuloCentro: string;
  /** Sem isto, o número do furo sai cru. Existe para dinheiro. */
  formatarCentro?: (v: number) => string;
  altura?: number;
  /**
   * Bloco fixado no pé do cartão, abaixo do anel.
   *
   * O cartão estica até a altura da linha da grade, ditada pelo painel vizinho,
   * e o anel tem tamanho fixo -- então sobra um vazio embaixo dele. Este slot é
   * para ocupá-lo com algo que valha a leitura, tipo o topo do ranking, em vez
   * de esticar o desenho até um tamanho que ele não precisa ter.
   */
  rodape?: ReactNode;
  className?: string;
}) {
  /** Fatia sob o mouse. É a legenda deste painel. */
  const [apontado, setApontado] = useState<string | null>(null);

  const soma = fatias.reduce((s, f) => s + f.valor, 0);
  const emFoco = fatias.find(f => f.nome === apontado) ?? null;
  const valorCentro = emFoco ? emFoco.valor : soma;

  return (
    <div className={`bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5 flex flex-col ${className ?? ""}`}>
      {/* Sem `flex-wrap`: o painel tem ~356px por dentro, e com quebra quem
          descia para a segunda linha eram os controles. Como o subtítulo muda
          de tamanho conforme a escolha, o cabeçalho ganhava uma altura em cada
          modo e o desenho inteiro pulava a cada clique.

          Agora o bloco de texto é quem cede (`min-w-0`, e o subtítulo quebra em
          duas linhas se precisar) e os controles ficam fixos no canto. O que se
          move é a frase, não o botão que a pessoa acabou de clicar. */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitulo}</p>
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>

      {/* Anel centrado nos dois eixos, e a área dele com `flex-1`: é ela que
          absorve a sobra de altura do cartão. Sem isso o vazio ia todo para o
          pé do painel, e o desenho ficava encostado no cabeçalho. */}
      <div className="flex-1 flex items-center justify-center">
        <Anel
          fatias={fatias}
          vazio={fatias.length === 0 || soma === 0}
          altura={altura}
          textoCentro={formatarCentro ? formatarCentro(valorCentro) : String(valorCentro)}
          // Com fatia apontada o furo vira o nome dela: é o que substitui a
          // legenda que este painel não tem.
          rotuloCentro={emFoco ? emFoco.nome : rotuloCentro}
          tituloDoRotulo={emFoco?.nome}
          conteudoTooltip={<TooltipDoAnel />}
          onPassarMouse={setApontado}
        />
      </div>

      {rodape}
    </div>
  );
}
