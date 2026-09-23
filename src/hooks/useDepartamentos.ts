import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyContext";

export interface DepartamentoLite {
  id: string;
  name: string;
  color: string | null;
  /**
   * Quem pertence ao departamento, por id de perfil.
   *
   * Vem junto porque a tabela de membros mostra os departamentos de cada
   * pessoa, e o vínculo mora deste lado: não há coluna no membro apontando
   * para o departamento. Sem isto, montar aquela coluna exigiria uma segunda
   * consulta com o mesmo dado.
   */
  attendant_ids: string[];
}

/**
 * Os departamentos da empresa aberta.
 *
 * Existe para quem precisa da lista lá no fundo da árvore -- os painéis de
 * configuração de ação e de condição das automações estão a três componentes de
 * distância de quem já carregava isso, e passar a lista de prop em prop
 * significaria alterar quatro assinaturas para exibir um seletor.
 *
 * A consulta é por `company_id`, nunca por `owner_id`: um dono com duas
 * empresas veria as duas listas somadas e poderia mandar uma conversa para o
 * departamento da outra empresa. Já houve um caso desses na base.
 */
/**
 * @param gatilhoDeRecarga  Muda de valor para forçar uma releitura. A tela de
 *   equipe precisa disso: adicionar um membro altera `attendant_ids` pelo
 *   BANCO, dentro de `add_member_to_company`, e sem um empurrão a coluna de
 *   departamentos da tabela mostraria o estado anterior até alguém recarregar
 *   a página.
 */
export function useDepartamentos(gatilhoDeRecarga?: unknown): DepartamentoLite[] {
  const { company } = useCompany();
  const [departamentos, setDepartamentos] = useState<DepartamentoLite[]>([]);

  useEffect(() => {
    const id = company?.id;
    if (!id) { setDepartamentos([]); return; }

    // `vivo` porque trocar de empresa dispara a busca de novo: sem ele, a
    // resposta da empresa anterior pode chegar depois e sobrescrever a lista
    // certa com a antiga.
    let vivo = true;
    supabase
      .from("departments")
      .select("id, name, color, attendant_ids")
      .eq("company_id", id)
      .order("position", { ascending: true })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { console.error("useDepartamentos:", error.message); return; }
        // `attendant_ids` nunca é nulo no banco (default '{}'), mas linhas
        // antigas lidas de cache podem vir sem ele.
        setDepartamentos(((data ?? []) as DepartamentoLite[]).map(d => ({ ...d, attendant_ids: d.attendant_ids ?? [] })));
      });

    return () => { vivo = false; };
  }, [company?.id, gatilhoDeRecarga]);

  return departamentos;
}
