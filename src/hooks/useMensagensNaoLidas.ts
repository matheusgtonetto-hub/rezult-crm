import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/context/CompanyContext";
import { useCRM } from "@/context/CRMContext";
import { usePermissions } from "@/hooks/usePermissions";
import { conversaVisivelPara, departamentosQueAlcanco } from "@/lib/visibilidadeDeConversa";

/** Linha enxuta de conversa: só o que a contagem precisa. */
interface ConversaNaoLida {
  id: string;
  department_id: string | null;
  assigned_to: string | null;
  instance_id: string | null;
  phone: string | null;
}

/**
 * Quantas conversas não lidas existem PARA QUEM ESTÁ OLHANDO.
 *
 * Alimenta o contador no ícone do Multiatendimento, na barra lateral, para
 * quem está em outra tela descobrir que chegou mensagem sem precisar abrir a
 * tela e conferir.
 *
 * ─── Por que não é um `select count(*)` ─────────────────────────────────────
 *
 * Porque "não lida" sozinha não basta: a conversa também precisa ser VISÍVEL
 * para a pessoa. Quem só atende o Suporte não pode ser avisado de uma mensagem
 * que caiu no Comercial e que ela nem consegue abrir. A regra de visibilidade
 * mora em `visibilidadeDeConversa.ts` e é a mesma que a lista usa -- por isso
 * a consulta traz as linhas e o filtro acontece aqui.
 *
 * O volume justifica: são as conversas NÃO LIDAS e NÃO FINALIZADAS da empresa,
 * dezenas na pior das hipóteses, não as milhares do histórico.
 *
 * ─── Atualização ────────────────────────────────────────────────────────────
 *
 * Realtime em `whatsapp_conversations`. Qualquer INSERT ou UPDATE refaz a
 * conta: mensagem nova chega com `read = false` e some do contador quando
 * alguém abre a conversa, sem precisar recarregar a página.
 */
export function useMensagensNaoLidas(): number {
  const { user } = useAuth();
  const { company } = useCompany();
  const { leads, currentUserName } = useCRM();
  const { can, isOwner } = usePermissions();
  const isAdmin = isOwner || can("multiatendimento:admin") || can("multiatendimento:supervisor");

  const [conversas, setConversas] = useState<ConversaNaoLida[]>([]);
  const [departamentos, setDepartamentos] = useState<
    { id: string; attendants: string[] | null; attendant_ids: string[] | null }[]
  >([]);
  const [minhaVisibilidade, setMinhaVisibilidade] = useState<{ allowSeeOthers: boolean; hideUnassigned: boolean }>();

  const companyId = company?.id;
  const userId = user?.id;

  const recarregar = useCallback(async () => {
    if (!companyId) { setConversas([]); return; }
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("id, department_id, assigned_to, instance_id, phone")
      .eq("company_id", companyId)
      .eq("read", false)
      .eq("finished", false);
    if (error) { console.error("useMensagensNaoLidas:", error.message); return; }
    setConversas((data ?? []) as ConversaNaoLida[]);
  }, [companyId]);

  useEffect(() => { recarregar(); }, [recarregar]);

  // Os insumos da visibilidade mudam pouco, então são buscados uma vez por
  // empresa: quem está em cada departamento e as preferências do atendente.
  useEffect(() => {
    if (!companyId) { setDepartamentos([]); return; }
    supabase
      .from("departments")
      .select("id, attendants, attendant_ids")
      .eq("company_id", companyId)
      .then(({ data }) => setDepartamentos((data ?? []) as typeof departamentos));
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !userId) { setMinhaVisibilidade(undefined); return; }
    supabase
      .from("multiatendimento_attendant_settings")
      .select("allow_see_others_convs, hide_unassigned_convs")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setMinhaVisibilidade(data
        ? { allowSeeOthers: !!data.allow_see_others_convs, hideUnassigned: !!data.hide_unassigned_convs }
        : { allowSeeOthers: false, hideUnassigned: false }));
  }, [companyId, userId]);

  useEffect(() => {
    if (!companyId) return;
    const canal = supabase
      .channel(`nao-lidas-${companyId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations", filter: `company_id=eq.${companyId}` },
        () => { recarregar(); })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [companyId, recarregar]);

  if (!conversas.length) return 0;

  const meusDepartamentos = departamentosQueAlcanco(departamentos, userId, currentUserName);
  const ctx = {
    isAdmin,
    currentUserName,
    meusDepartamentos,
    totalDeDepartamentos: departamentos.length,
    allowSeeOthers: minhaVisibilidade?.allowSeeOthers,
    hideUnassigned: minhaVisibilidade?.hideUnassigned,
  };

  /*
   * O negócio da conversa entra pelo telefone, como no resto do app.
   *
   * Sem isto, uma conversa cujo NEGÓCIO é meu (mas que não tem atendente
   * atribuído) ficaria de fora do contador para quem não é admin -- e é
   * justamente o caso do vendedor que só cuida dos próprios negócios.
   */
  const soDigitos = (t?: string | null) => (t ?? "").replace(/\D/g, "");
  const meusTelefones = new Set(
    Object.values(leads)
      .filter(l => !!l.pipelineId && (l.responsibles ?? []).includes(currentUserName))
      .map(l => soDigitos(l.whatsapp))
      .filter(Boolean),
  );

  return conversas.filter(c =>
    conversaVisivelPara(
      { departmentId: c.department_id, assignedTo: c.assigned_to },
      ctx,
      meusTelefones.has(soDigitos(c.phone)),
    ),
  ).length;
}
