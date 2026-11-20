/**
 * Qual conexão de WhatsApp usar quando a conversa não decide sozinha.
 *
 * Com uma conexão só, tanto faz. Com duas, cada tela escolhia do seu jeito, e
 * quase todas pegavam "a primeira ativa", que é a mais ANTIGA. Numa empresa com
 * uma linha da API oficial da Meta criada antes de uma D-API (o caso do dono em
 * 20/11/2026: "Rezult 0449", de agosto, e "9897", de novembro), isso dava:
 *
 *   - Pipeline e página do lead sem nenhuma foto de perfil: a API oficial não
 *     fornece foto de contato, e era por ela que as fotos eram pedidas;
 *   - chat flutuante abrindo contato novo pela linha oficial, que exige modelo
 *     aprovado, enquanto o Multiatendimento mandava o mesmo contato pela outra.
 *
 * A linha da CONVERSA continua mandando sempre que existe (quem chama passa a
 * preferida). Estas regras cobrem só o que sobra: contato sem conversa e foto.
 */

/** O que as regras olham. Serve para a conexão do contexto e para as instâncias do Multiatendimento. */
export interface ConexaoParaEscolha {
  instanceId: string;
  provider?: string | null;
  connected?: boolean;
  active?: boolean;
}

// Sem os campos (instâncias já filtradas por quem montou a lista) conta como ativa.
const estaAtiva = (c: ConexaoParaEscolha) => c.connected !== false && c.active !== false;

// A API oficial não fornece foto de contato e exige modelo aprovado para abrir
// conversa. Nas duas regras ela é a última opção.
const ehApiOficial = (c: ConexaoParaEscolha) => c.provider === "cloud_api";

/**
 * Linha para contato SEM conversa: a primeira ativa que aceita texto livre; sem
 * nenhuma assim, a primeira ativa.
 */
export function linhaPadrao<T extends ConexaoParaEscolha>(conexoes: T[]): T | undefined {
  const ativas = conexoes.filter(estaAtiva);
  return ativas.find(c => !ehApiOficial(c)) ?? ativas[0];
}

/**
 * Conexão para buscar foto de perfil: a preferida (a linha da conversa) se ela
 * fornece foto; senão a primeira ativa que forneça. `undefined` quando nenhuma
 * fornece, e aí a tela fica nas iniciais.
 */
export function conexaoParaFoto<T extends ConexaoParaEscolha>(conexoes: T[], preferida?: string | null): T | undefined {
  const capazes = conexoes.filter(c => estaAtiva(c) && !ehApiOficial(c));
  return (preferida ? capazes.find(c => c.instanceId === preferida) : undefined) ?? capazes[0];
}
