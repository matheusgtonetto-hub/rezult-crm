/**
 * Os gatilhos de uma automação, nos dois formatos que existem no banco.
 *
 * Uma automação podia ter UM gatilho, guardado em `flow.trigger`. Desde
 * 23/09/2026 ela pode ter VÁRIOS, e a tela passou a gravar a lista em
 * `flow.triggers`, mantendo o `flow.trigger` com o PRIMEIRO da lista para os
 * fluxos antigos continuarem rodando.
 *
 * Esse "primeiro da lista" é a armadilha. Quem lê `flow.trigger.triggerId`
 * enxerga só o gatilho inicial e fica cego para os demais. Foi o que o
 * Consultório Samantha encontrou em 13/10/2026: a "Mensagem de boas-vindas"
 * tem dois gatilhos, `outra_automacao` e `lead_manual`, nessa ordem, e por isso
 * sumia de toda lista de "automações com execução manual" -- no pipeline, no
 * Multiatendimento, nos Disparos e nos agentes. A automação funcionava; ela
 * apenas não aparecia para ser escolhida.
 *
 * O `automation-runner` já faz exatamente isto, na função de mesmo nome (ver
 * supabase/functions/automation-runner/index.ts). O front tinha ficado para
 * trás. Os dois precisam concordar: a tela que esconde uma automação que o
 * motor aceitaria é tão defeito quanto a que oferece uma que ele recusaria.
 */

export interface GatilhoDoFluxo {
  id?: string;
  triggerId?: string;
  label?: string;
  categoryId?: string;
  configData?: Record<string, unknown>;
  description?: string;
}

interface FluxoComGatilhos {
  trigger?: GatilhoDoFluxo | null;
  triggers?: GatilhoDoFluxo[] | null;
}

export function gatilhosDoFluxo(flow: unknown): GatilhoDoFluxo[] {
  const f = flow as FluxoComGatilhos | null | undefined;
  if (f?.triggers?.length) return f.triggers;
  return f?.trigger ? [f.trigger] : [];
}

/** Atalho para a pergunta que todos os chamadores fazem. */
export function temGatilho(flow: unknown, triggerId: string): boolean {
  return gatilhosDoFluxo(flow).some(g => g?.triggerId === triggerId);
}
