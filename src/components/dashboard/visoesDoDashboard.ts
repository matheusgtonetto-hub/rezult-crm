import { ChartPie, Filter, Users, type LucideIcon } from "lucide-react";
import { CrmWhatsAppIcon } from "@/components/icons/CrmWhatsAppIcon";

/**
 * As quatro visões do Dashboard: id, rótulo e ícone.
 *
 * Moravam dentro da `DashboardSidebar`, que era quem as desenhava. A barra saiu
 * -- a escolha virou um seletor no cabeçalho --, e com ela esta tabela ficaria
 * dentro de um componente que não existe mais. Em módulo próprio ela deixa de
 * depender de QUEM desenha: se um dia o seletor virar outra coisa, os nomes e a
 * ordem continuam aqui.
 */

export type VisaoDoDashboard = "negocios" | "multiatendimento" | "funil" | "times";

/**
 * O rótulo de cada visão, como aparece na aba.
 *
 * "Performance Geral" abre a fileira e nomeia o assunto; as outras duas seguem
 * como complemento dela ("Por Pipeline", "Da Equipe"), o que deixa a linha ser
 * lida como uma frase só em vez de três rótulos soltos. Repetir "Performance"
 * nas três gastaria a largura sem distinguir nada -- o que separa uma da outra é
 * o RECORTE.
 *
 * Os ids não acompanham os rótulos, e é por isso que `negocios`, `funil` e
 * `times` já não se parecem com o que está escrito na tela. Eles são a chave da
 * aba e aparecem no `TabsContent`, e trocá-los seria renomear em cinco lugares
 * para mudar uma palavra que só a tela mostra. Esta tabela é justamente o ponto
 * onde os dois deixam de precisar coincidir.
 */
export const ROTULO_DA_VISAO: Record<VisaoDoDashboard, string> = {
  negocios: "Performance Geral",
  multiatendimento: "Multiatendimento",
  funil: "Por Pipeline",
  times: "Da Equipe",
};

/**
 * As visões OFERECIDAS na tela, na ordem em que aparecem -- do geral para o
 * específico: o resultado inteiro, depois repartido por pipeline, depois por
 * pessoa.
 *
 * `multiatendimento` está fora desta lista de propósito, e é por isso que ela
 * não cobre todos os valores de `VisaoDoDashboard`. O painel dele continua
 * inteiro no código, com rótulo e `TabsContent`; o que saiu foi a OFERTA. Ele
 * volta assim que for atualizado, e a volta é acrescentar a linha aqui de novo
 * -- nada mais precisa ser reescrito.
 *
 * O ícone de cada uma é o mesmo da aba correspondente na barra lateral do app --
 * quem já associou o funil a Pipelines reencontra o mesmo símbolo aqui. A
 * Performance Geral, que não tem aba própria lá, usa o do próprio Dashboard: ela
 * é a visão que abre por padrão, então o símbolo da tela serve como o dela.
 */
export const VISOES_DO_DASHBOARD: {
  id: VisaoDoDashboard;
  Icone: LucideIcon | typeof CrmWhatsAppIcon;
}[] = [
  { id: "negocios", Icone: ChartPie },
  { id: "funil",    Icone: Filter },
  { id: "times",    Icone: Users },
];
