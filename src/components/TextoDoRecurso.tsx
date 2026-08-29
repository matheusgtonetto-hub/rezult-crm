import type { Recurso } from "@/data/plans";

/**
 * Um benefício de plano em texto: número em negrito, complemento em seguida.
 *
 * Existe para que as três telas que listam planos (a oferta do cadastro, o
 * /planos e o diálogo de upgrade das configurações) não repitam cada uma a sua
 * montagem do negrito. Elas continuam donas do resto -- tamanho, cor, ícone,
 * espaçamento -- porque cada uma vive num contexto visual diferente.
 *
 * O cartão da oferta em /setup é a exceção: ele tem o brilho verde animado e
 * cores próprias de fundo escuro, então monta o seu por conta. O que ele NÃO faz
 * mais é ter a própria lista de benefícios; essa saiu de `PLANS`, como aqui.
 *
 * O espaço entre as duas partes é literal, e não `gap`: negrito e complemento
 * formam uma frase só que precisa quebrar de linha como frase. Dois elementos
 * separados por gap quebrariam em bloco, deixando o complemento inteiro na
 * linha de baixo.
 */
export function TextoDoRecurso({
  recurso,
  /**
   * Destacar o número em negrito.
   *
   * Ligado onde a lista serve para COMPARAR planos lado a lado -- ali o negrito
   * é o que deixa varrer os números de cima a baixo. Desligado em Configurações
   * > Planos e pagamentos, onde a lista descreve o plano que a pessoa já tem:
   * não há com o que comparar, e destacar número por número só agita a leitura.
   *
   * Quando desligado some também a cor mais escura, não só o peso. Só a cor
   * diferente, sem o negrito, pareceria erro de estilo em vez de escolha.
   */
  negrito = true,
}: {
  recurso: Recurso;
  negrito?: boolean;
}) {
  return (
    <span>
      {recurso.forte && (
        negrito
          ? <b className="font-semibold text-foreground">{recurso.forte}</b>
          : recurso.forte
      )}
      {recurso.forte && recurso.resto ? " " : ""}
      {recurso.resto}
    </span>
  );
}
