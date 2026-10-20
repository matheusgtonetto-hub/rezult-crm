import { useEffect, useState } from "react";

/**
 * O valor, mas só depois que ele parar de mudar por `espera` milissegundos.
 *
 * Serve para separar duas coisas que a digitação junta: o que a pessoa vê no
 * campo (precisa ser instantâneo) e o que vira consulta ao banco (não pode ser
 * instantâneo).
 *
 * O caso que motivou: a busca do funil ia direto da tecla para
 * `buscar_leads_do_funil`, e o kanban dispara UMA consulta POR COLUNA. Um funil
 * de cinco etapas fazia cinco consultas por caractere, então digitar "samantha"
 * disparava quarenta consultas, das quais só as cinco últimas interessavam. As
 * outras trinta e cinco competiam pela mesma conexão e atrasavam justamente as
 * que importavam, que era o que o usuário sentia como lentidão.
 *
 * Não cancela a consulta em voo, porque disso quem cuida é o react-query: ele
 * descarta o resultado de uma chave que não é mais a atual. O que este hook faz
 * é não criar a consulta.
 */
export function useValorAtrasado<T>(valor: T, espera = 350): T {
  const [atrasado, setAtrasado] = useState(valor);

  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), espera);
    return () => clearTimeout(id);
  }, [valor, espera]);

  return atrasado;
}
