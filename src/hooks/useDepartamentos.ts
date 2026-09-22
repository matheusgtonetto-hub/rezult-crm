import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyContext";

export interface DepartamentoLite {
  id: string;
  name: string;
  color: string | null;
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
export function useDepartamentos(): DepartamentoLite[] {
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
      .select("id, name, color")
      .eq("company_id", id)
      .order("position", { ascending: true })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { console.error("useDepartamentos:", error.message); return; }
        setDepartamentos((data ?? []) as DepartamentoLite[]);
      });

    return () => { vivo = false; };
  }, [company?.id]);

  return departamentos;
}
