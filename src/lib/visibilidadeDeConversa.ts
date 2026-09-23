/**
 * Quem enxerga qual conversa no Multiatendimento.
 *
 * Esta função existe fora da tela porque DOIS lugares precisam da mesma
 * resposta: a lista de conversas e o contador de não lidas que aparece no ícone
 * da barra lateral. Um contador que somasse conversa que a pessoa não pode
 * abrir mandaria ela procurar uma mensagem que não existe para ela -- e duas
 * cópias da regra divergiriam no primeiro ajuste, que é o defeito que já
 * apareceu neste produto em outras contas (o valor do negócio, o produto no
 * atendimento).
 *
 * É pura de propósito: recebe tudo que precisa e não conhece Supabase, contexto
 * nem React. Isso é o que permite chamá-la de dentro de um `useMemo` na tela e
 * de dentro de um hook que roda em qualquer rota.
 */

export interface AlvoDaVisibilidade {
  /** Departamento da conversa, quando ela tem um. */
  departmentId?: string | null;
  /** Nome do atendente atribuído à conversa, quando há um. */
  assignedTo?: string | null;
}

export interface ContextoDaVisibilidade {
  /** Admin, supervisor e dono veem tudo, sem exceção. */
  isAdmin: boolean;
  /** Nome de quem está olhando, como gravado em `assigned_to`. */
  currentUserName: string;
  /** Ids dos departamentos que a pessoa alcança. */
  meusDepartamentos: string[];
  /** Quantos departamentos a empresa tem. Com um só, o filtro não aperta. */
  totalDeDepartamentos: number;
  /** Preferências do atendente, da aba "Atendentes". */
  allowSeeOthers?: boolean;
  hideUnassigned?: boolean;
}

/**
 * @param souResponsavelDoNegocio  Se a pessoa está entre os responsáveis do
 *   negócio vinculado à conversa. Vem de fora porque resolver o negócio exige a
 *   lista de leads, que a tela já tem em mãos e o contador busca do contexto.
 */
export function conversaVisivelPara(
  conversa: AlvoDaVisibilidade,
  ctx: ContextoDaVisibilidade,
  souResponsavelDoNegocio = false,
): boolean {
  if (ctx.isAdmin) return true;

  const assignedTo = conversa.assignedTo ?? undefined;
  const minha = souResponsavelDoNegocio || (!!assignedTo && assignedTo === ctx.currentUserName);
  // Conversa MINHA eu vejo sempre, mesmo que esteja num departamento que não é
  // meu: foi a mim que a atribuíram, e sumir com ela deixaria um trabalho meu
  // invisível para mim.
  if (minha) return true;

  /*
   * O departamento filtra ANTES do resto (decisão do dono, 22/09/2026).
   *
   * Só aperta quando a empresa tem mais de um departamento: com um só, este
   * filtro não separa nada e ainda arriscaria esconder tudo de alguém.
   */
  const dept = conversa.departmentId ?? undefined;
  if (ctx.totalDeDepartamentos > 1 && dept && !ctx.meusDepartamentos.includes(dept)) return false;

  if (assignedTo) return !!ctx.allowSeeOthers;
  return !ctx.hideUnassigned;
}

/**
 * Os departamentos que uma pessoa alcança.
 *
 * Departamento SEM ninguém definido é de todos: array vazio quer dizer "ninguém
 * montou o time ainda", e não "ninguém entra". Tratar vazio como proibição
 * deixaria quase todo atendente sem ver conversa nenhuma, porque a maioria dos
 * departamentos da base está assim.
 *
 * A comparação é por id de perfil, com o nome como reserva -- é o vínculo que
 * sobrevive a alguém se renomear em Meu Perfil.
 */
export function departamentosQueAlcanco(
  departamentos: { id: string; attendants?: string[] | null; attendant_ids?: string[] | null }[],
  meuId: string | undefined,
  meuNome: string,
): string[] {
  const nomeNormalizado = meuNome.trim().toLowerCase();
  return departamentos
    .filter(d => {
      const ids = d.attendant_ids ?? [];
      const nomes = d.attendants ?? [];
      if (!ids.length && !nomes.length) return true;
      if (meuId && ids.length) return ids.includes(meuId);
      return nomes.some(n => String(n).trim().toLowerCase() === nomeNormalizado);
    })
    .map(d => d.id);
}
