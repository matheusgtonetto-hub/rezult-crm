-- Passo 5: a trava. Decide se uma empresa pode gastar ANTES da chamada de IA.
--
-- Urgente desde 25/09/2026: o checkout entrou no ar no passo 4, entao ja da
-- para comprar credito -- e sem trava da para queimar muito abaixo de zero.
--
-- ═══ Diverge do plano: bloqueia em ZERO, nao numa margem ════════════════════
--
-- A secao 3 do plano previa uma `margem_minima` igual ao custo da chamada mais
-- cara conhecida. O motivo dela era evitar que uma ultima chamada furasse o
-- `check (saldo >= 0)` e a transacao falhasse no meio de uma conversa.
--
-- Esse check NAO EXISTE (ver a migration 20260924000003): ele foi retirado
-- porque fazia o debito falhar e o resultado era consumo sem debito. Sem ele,
-- saldo negativo nao quebra nada, so fica registrado.
--
-- Entao a margem perdeu a razao e ganhou um custo: uma margem de 1.000 creditos
-- deixa o cliente olhando 900 creditos de saldo com os agentes parados, sem
-- entender por que. Bloqueando em zero, o descoberto maximo e UMA chamada (a
-- mais cara conhecida custa ~645 creditos), e limitado, visivel e registrado.

create or replace function public.pode_gastar(p_company_id uuid)
returns text
language plpgsql
stable
-- SECURITY INVOKER (o padrao, sem declarar). Ver a nota no fim do arquivo.
set search_path = 'public'
as $$
declare
  v_conta credit_accounts;
  v_hoje  numeric;
begin
  select * into v_conta from credit_accounts where company_id = p_company_id;

  -- Sem conta de credito = chave propria (BYOK). Ela paga o fornecedor direto
  -- e nao passa pelo nosso saldo, entao nao ha o que travar. E o caso de TODAS
  -- as empresas de hoje: ligar esta trava nao muda nada para elas.
  if v_conta.company_id is null then
    return 'ok';
  end if;

  if v_conta.saldo_creditos <= 0 then
    return 'sem_saldo';
  end if;

  -- Teto diario: a trava contra laco em automacao queimando saldo antes de
  -- alguem perceber. Null = sem teto, que e o padrao.
  if v_conta.teto_diario_creditos is not null then
    v_hoje := consumo_do_dia(p_company_id);
    if v_hoje >= v_conta.teto_diario_creditos then
      return 'teto_diario';
    end if;
  end if;

  return 'ok';
end $$;

comment on function public.pode_gastar(uuid) is
  'Veredito antes de chamar IA: ok | sem_saldo | teto_diario. Devolve ok para empresa sem conta de credito (BYOK).';

-- ═══ Por que INVOKER, e nao DEFINER ════════════════════════════════════════
--
-- Escrevi DEFINER primeiro, com a justificativa de que a funcao "so devolve o
-- veredito, nao o saldo". Isso esta errado: o veredito E a informacao. Com
-- DEFINER, qualquer usuario autenticado poderia passar o company_id de outra
-- empresa e descobrir se ela esta sem saldo.
--
-- Como INVOKER, o RLS de `credit_accounts` aplica sozinho:
--
--   service_role (Edge Functions) → ignora RLS, ve a linha, veredito correto
--   membro da empresa (frontend)  → RLS permite, veredito correto
--   quem nao e membro             → nao ve linha, cai no caminho BYOK e recebe
--                                   'ok'. Resposta inutil para ele, e sem
--                                   vazamento: ele nao consegue gastar dessa
--                                   empresa de qualquer forma.
--
-- E o mesmo raciocinio de `consumo_por_origem` (migration 20260925000003): nao
-- ha guarda `is_member_of` para esquecer, porque nao existe guarda.
revoke execute on function public.pode_gastar(uuid) from public, anon;
grant  execute on function public.pode_gastar(uuid) to authenticated, service_role;
