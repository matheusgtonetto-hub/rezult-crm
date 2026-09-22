import type { ReactNode } from "react";
import {
  MOLDURA, TABELA, LINHA_CABECALHO, CORPO, LINHA_CORPO, useTabelaPainel, type ColunaTabela,
} from "./TabelaPainel";

/**
 * Tabela de ranking: uma marca à esquerda, nome com subtítulo, e colunas de
 * número à direita.
 *
 * Nasceu compartilhada entre "Produtos mais vendidos" e "Responsáveis com mais
 * vendas". Os dois painéis ficam lado a lado na mesma linha, e é aí que a cópia
 * cobraria: qualquer ajuste de altura de linha, de corpo do subtítulo ou de
 * alinhamento de coluna feito num só apareceria como desalinho entre vizinhos,
 * não como diferença intencional.
 *
 * O que cada painel ainda decide sozinho é a MARCA -- o quadrado com ícone do
 * produto, a foto do responsável -- porque é justamente ali que os dois têm que
 * ser diferentes: uma coisa é reconhecida pelo ícone do catálogo, a outra pelo
 * rosto.
 *
 * A moldura, o filtro e a ordenação vêm de `TabelaPainel`, a mesma peça de
 * todas as tabelas do dashboard.
 */

export interface LinhaRanking {
  /** Identidade da linha. Nome serve quando não há id. */
  chave: string;
  /** Ícone, foto ou inicial. Recebe 32px de lado. */
  marca: ReactNode;
  nome: string;
  /** Linha menor sob o nome (o SKU, o e-mail). Ausente = sem a linha. */
  sub?: string;
  /** Um por coluna, já formatado. A última sai em destaque. */
  valores: string[];
  /**
   * Os mesmos números de `valores`, crus, na mesma ordem. É por eles que a
   * tabela ordena: "R$ 1.000,00" e "R$ 999,00" ordenados como texto sairiam
   * trocados.
   */
  numeros: number[];
}

export function RankingPanel({
  titulo,
  subtitulo,
  colunaNome,
  colunas,
  linhas,
  vazio,
  className,
}: {
  titulo: string;
  subtitulo: string;
  /** Cabeçalho da primeira coluna ("Produto", "Responsável"). */
  colunaNome: string;
  /** Cabeçalhos das colunas de número, na ordem. */
  colunas: string[];
  /** Na ordem padrão de exibição, que é a da última coluna, decrescente. */
  linhas: LinhaRanking[];
  /** Frase quando não há nada a listar. */
  vazio: string;
  className?: string;
}) {
  const defs: ColunaTabela<LinhaRanking>[] = [
    { id: "nome", rotulo: colunaNome, alinhar: "esquerda", filtro: l => l.nome },
    ...colunas.map((c, i) => ({ id: `n${i}`, rotulo: c, valor: (l: LinhaRanking) => l.numeros[i] ?? 0 })),
  ];
  // Abre pela última coluna, decrescente: é a receita nos dois painéis, e a
  // ordem em que as linhas já chegam.
  const { visiveis, cabecalho } = useTabelaPainel(linhas, defs, { coluna: `n${colunas.length - 1}`, desc: true });

  return (
    <div className={`bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 ${className ?? ""}`}>
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">{subtitulo}</p>

      {/* A tabela é montada mesmo sem uma linha para listar, e o "não há nada"
          desce para dentro dela. Com os cabeçalhos de pé, o vazio ainda
          informa: dá para ver QUE colunas o painel traz assim que houver venda. */}
      <div className={MOLDURA}>
        <table className={TABELA}>
          <thead>
            <tr className={LINHA_CABECALHO}>
              {defs.map(c => <th key={c.id} style={c.largura ? { width: c.largura } : undefined}>{cabecalho(c)}</th>)}
            </tr>
          </thead>
          <tbody className={CORPO}>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={defs.length} className="py-6 text-xs text-muted-foreground text-center">
                  {vazio}
                </td>
              </tr>
            )}
            {visiveis.map(l => (
              <tr key={l.chave} className={LINHA_CORPO}>
                {/* `w-full max-w-0`: a coluna de nome fica com o que sobrar e
                    trunca. Sem isso, no layout automático da tabela, ela cresce
                    até caber o e-mail inteiro do responsável e empurra as
                    colunas de dinheiro para fora do painel. */}
                <td className="py-2.5 pr-3 font-medium text-foreground w-full max-w-0">
                  <span className="flex items-center gap-3">
                    {l.marca}
                    {/* min-w-0 para o truncate funcionar: sem ele o bloco de
                        texto não encolhe abaixo do conteúdo e empurra as
                        colunas de número. */}
                    <span className="min-w-0">
                      <span className="block truncate leading-tight">{l.nome}</span>
                      {l.sub && (
                        <span className="block text-xs font-normal text-muted-foreground truncate mt-0.5">
                          {l.sub}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                {l.valores.map((v, i) => {
                  // A última coluna em destaque: nos dois painéis ela é a
                  // receita, que é a resposta, e as anteriores são o caminho
                  // até ela. Mesmo verde de texto da receita no UTM.
                  const ultima = i === l.valores.length - 1;
                  return (
                    <td
                      key={colunas[i] ?? i}
                      className={`py-2.5 px-3 text-center tabular-nums whitespace-nowrap ${
                        ultima ? "font-semibold text-[color:var(--accent-700)]" : "text-muted-foreground"
                      }`}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
