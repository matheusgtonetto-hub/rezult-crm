import { X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCRM } from "@/context/CRMContext";
import type { ItemDoNegocio } from "@/data/mockData";

/**
 * Os produtos de um negócio.
 *
 * Antes era um seletor de UM produto que, ao ser trocado, sobrescrevia o valor
 * do negócio com o preço de tabela. Desde 20/09/2026 dá para escolher vários
 * (pedido de clientes), e o valor do negócio passa a ser a soma dos preços
 * deles.
 *
 * ─── O desenho é o mesmo de antes ────────────────────────────────────────────
 *
 * Um dropdown, sempre visível, como o campo "Produto" sempre foi. O que muda é
 * que escolher não TROCA: acrescenta, e o escolhido sobe para a lista logo
 * acima, com o preço e um "×".
 *
 * Por isso não há "Nenhum produto neste negócio" nem um botão "Adicionar
 * produto": o dropdown já diz o que fazer, e as duas coisas eram degraus a mais
 * para chegar no mesmo lugar.
 *
 * Sem quantidade e sem preço por linha: o preço é cadastrado junto com o
 * produto, e quem precisa de um total diferente edita o campo "Orçamento /
 * Valor" ali em cima, como sempre fez.
 *
 * Quem soma é o BANCO, num gatilho sobre `lead_products`: a mesma conta feita
 * aqui e lá divergiria no dia em que uma automação adicionasse um produto sem
 * passar por esta tela.
 */

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export function ItensDoNegocio({ leadId, itens, somenteLeitura = false }: {
  leadId: string;
  itens: ItemDoNegocio[];
  somenteLeitura?: boolean;
}) {
  const { products, addLeadItem, removeLeadItem } = useCRM();

  const ordenados = [...itens].sort((a, b) => a.posicao - b.posicao);
  const escolhidos = new Set(ordenados.map(i => i.productId));
  const disponiveis = products.filter(p => !escolhidos.has(p.id));

  const nomeDoProduto = (id: string) => products.find(p => p.id === id)?.name ?? "Produto removido";

  return (
    <div>
      <label className="block mb-1.5" style={{ fontSize: 12, color: "var(--accent-700)", fontWeight: 600 }}>
        Produtos
      </label>

      {/* Os escolhidos, acima do dropdown. Um por linha, com o preço à direita:
          nome de produto é longo ("Site + Tráfego Trimestral") e em etiqueta
          lado a lado viraria reticências na coluna estreita do negócio. */}
      {ordenados.length > 0 && (
        <div className="rounded-[6px] border border-card-border overflow-hidden mb-2">
          {ordenados.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 ${i > 0 ? "border-t border-card-border" : ""}`}
            >
              <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={nomeDoProduto(item.productId)}>
                {nomeDoProduto(item.productId)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {brl(item.valorUnitario)}
              </span>
              {!somenteLeitura && (
                <button
                  type="button"
                  onClick={() => removeLeadItem(leadId, item.id)}
                  aria-label={`Remover ${nomeDoProduto(item.productId)}`}
                  className="shrink-0 p-0.5 rounded text-[color:var(--icon-default)] hover:text-destructive hover:bg-[color:var(--surface-hover)] transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!somenteLeitura && (
        /*
         * `value=""` mantém o dropdown sem seleção fixa: ele ACRESCENTA à lista
         * acima, e não guarda o escolhido. Um seletor que mostrasse o último
         * produto dentro de si diria que o negócio tem só aquele.
         *
         * Ele fica sempre montado. Uma versão anterior o montava já aberto ao
         * clicar num botão, e nunca adicionou nada: o Radix fecha o menu ANTES
         * de avisar a escolha, e o componente era desmontado no meio do
         * caminho.
         */
        <Select value="" onValueChange={id => { if (id) addLeadItem(leadId, id); }}>
          <SelectTrigger className="h-9 rounded-md text-sm focus:ring-0 focus:ring-offset-0 focus:border-primary">
            <SelectValue placeholder={ordenados.length > 0 ? "Adicionar outro produto" : "Selecione um produto"} />
          </SelectTrigger>
          <SelectContent>
            {disponiveis.length === 0 && (
              <SelectItem value="sem-produto" disabled>
                {products.length === 0 ? "Nenhum produto cadastrado" : "Todos já estão no negócio"}
              </SelectItem>
            )}
            {disponiveis.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {p.defaultValue > 0 && (
                  <span className="ml-2 text-muted-foreground text-xs">{brl(p.defaultValue)}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Em leitura (o diálogo de ganho), sem produto nenhum não há dropdown a
          mostrar -- aí a frase é o único jeito de dizer o que há. */}
      {somenteLeitura && ordenados.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum produto neste negócio.</p>
      )}
    </div>
  );
}
