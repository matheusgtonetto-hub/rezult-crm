import type { ReactNode } from "react";

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
  /** Já na ordem de exibição: o painel não reordena. */
  linhas: LinhaRanking[];
  /** Frase quando não há nada a listar. */
  vazio: string;
  className?: string;
}) {
  return (
    <div className={`bg-card border border-gray-200 rounded-xl shadow-elev-1 p-5 ${className ?? ""}`}>
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">{subtitulo}</p>

      {linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vazio}</p>
      ) : (
        // `overflow-x-auto` no próprio container da tabela: com dinheiro em três
        // colunas, uma tela estreita faria a tabela empurrar a página inteira
        // para o lado. Aqui a rolagem fica presa ao painel.
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-muted-foreground">
                <th className="text-left pb-2 font-medium">{colunaNome}</th>
                {colunas.map(c => (
                  <th key={c} className="text-center pb-2 font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {linhas.map(l => (
                <tr key={l.chave} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 font-medium text-foreground">
                    <span className="flex items-center gap-3">
                      {l.marca}
                      {/* min-w-0 para o truncate funcionar: sem ele o bloco de
                          texto não encolhe abaixo do conteúdo e empurra as
                          colunas de número. */}
                      <span className="min-w-0">
                        <span className="block truncate leading-tight">{l.nome}</span>
                        {/* Subtítulo só quando existe. Um travessão solto
                            embaixo do nome pareceria dado faltando em vez de
                            campo vazio; sem ele, a altura da linha volta a ser
                            a da marca. */}
                        {l.sub && (
                          <span className="block text-xs font-normal text-muted-foreground truncate mt-0.5">
                            {l.sub}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  {l.valores.map((v, i) => {
                    // A última coluna em destaque por convenção: nos dois
                    // painéis ela é a receita, que é a resposta, e as anteriores
                    // são o caminho até ela.
                    const ultima = i === l.valores.length - 1;
                    return (
                      <td
                        key={colunas[i] ?? i}
                        className={`py-2.5 text-center tabular-nums ${
                          ultima ? "font-semibold text-primary" : "text-muted-foreground"
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
      )}
    </div>
  );
}
