import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * O saldo de crédito de IA da empresa, e o extrato dele.
 *
 * ─── Por que ele só aparece para quem tem conta ─────────────────────────────
 *
 * A conta de crédito nasce na primeira compra (`creditar_credito`). Quem usa
 * chave própria não tem conta, paga direto ao fornecedor e não deve ver um
 * saldo de zero que não lhe diz respeito -- seria um bloco a mais para
 * entender e ignorar, na tela onde ele já tem o que fazer.
 *
 * Enquanto o passo 4 (a venda) não existir, ninguém tem conta, e este
 * componente não desenha nada. É de propósito: ele entra antes da venda para
 * que o extrato esteja pronto ANTES de alguém ser cobrado. Cobrar sem ter onde
 * conferir é o caminho curto para o primeiro chamado de suporte.
 *
 * ─── Por que o extrato é uma tabela e não um gráfico ───────────────────────
 *
 * Porque a pergunta que ele responde é "para onde foi o meu dinheiro", e a
 * resposta é linha por linha, com data e valor. Gráfico responde tendência, que
 * é outra pergunta.
 */

interface Conta {
  saldo_usd: number;
  teto_diario_usd: number | null;
}

interface Lancamento {
  id: string;
  tipo: string;
  valor: number;
  descricao: string | null;
  criado_em: string;
}

/** USD, porque o saldo é em dólar (decisão do dono, 24/09/2026). */
const dinheiro = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Valores pequenos precisam de mais casas: uma resposta custa US$ 0,0232.
 *
 * As quatro casas são FIXAS, e não "até quatro". Com mínimo 2 e máximo 4 a
 * coluna alternava 0,018 / 0,03 / 0,036, e comparar duas linhas exigia contar
 * dígitos. Alinhado à direita com `tabular-nums` e casas fixas, a vírgula cai
 * sempre no mesmo lugar.
 */
const dinheiroFino = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const ROTULO: Record<string, string> = {
  compra: "Compra de crédito",
  consumo: "Uso de agente",
  ajuste: "Ajuste",
  estorno: "Estorno",
  expiracao: "Expiração",
};

export function SaldoDeCreditos({ companyId }: { companyId?: string }) {
  const [conta, setConta] = useState<Conta | null>(null);
  const [consumoHoje, setConsumoHoje] = useState(0);
  const [extrato, setExtrato] = useState<Lancamento[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!companyId) { setCarregando(false); return; }

    const { data } = await supabase
      .from("credit_accounts")
      .select("saldo_usd, teto_diario_usd")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!data) { setConta(null); setCarregando(false); return; }
    setConta({ saldo_usd: Number(data.saldo_usd), teto_diario_usd: data.teto_diario_usd === null ? null : Number(data.teto_diario_usd) });

    // O consumo do dia vem da função, e não de uma soma aqui, porque o "dia"
    // é o de São Paulo e não o do servidor -- a conta mora num lugar só.
    const { data: hoje } = await supabase.rpc("consumo_do_dia", { p_company_id: companyId });
    setConsumoHoje(Number(hoje ?? 0));

    const { data: linhas } = await supabase
      .from("credit_transactions")
      .select("id, tipo, valor, descricao, criado_em")
      .eq("company_id", companyId)
      .order("criado_em", { ascending: false })
      .limit(50);
    setExtrato((linhas ?? []).map(l => ({ ...l, valor: Number(l.valor) })) as Lancamento[]);
    setCarregando(false);
  }, [companyId]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Sem conta de crédito, nada a mostrar: a empresa usa chave própria.
  if (carregando || !conta) return null;

  const negativo = conta.saldo_usd < 0;

  return (
    <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-6 mb-6 shrink-0">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wallet size={14} className="text-muted-foreground shrink-0" />
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Crédito de IA</p>
          </div>
          {/* Métrica do sistema: 32/600, tabular-nums porque o número muda a
              cada uso e dígitos de larguras diferentes fazem o saldo "tremer". */}
          <p
            className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums mt-1"
            style={{ color: negativo ? "var(--danger-fg)" : "var(--text-heading)" }}
          >
            {dinheiro.format(conta.saldo_usd)}
          </p>
          <p className="text-[12px] text-muted-foreground mt-0.5 tabular-nums">
            {dinheiroFino.format(consumoHoje)} usados hoje
            {conta.teto_diario_usd !== null && ` · teto de ${dinheiro.format(conta.teto_diario_usd)} por dia`}
          </p>
        </div>

        {extrato.length > 0 && (
          <button
            type="button"
            onClick={() => setAberto(a => !a)}
            className="shrink-0 inline-flex h-[var(--control-h-sm)] items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            {aberto ? "Ocultar extrato" : "Ver extrato"}
            {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      {/* O aviso de saldo negativo é para o admin, não para o contato: uma
          chamada pode estourar o saldo, porque o débito registra o custo real
          depois da resposta. */}
      {negativo && (
        <p className="text-[12px] mt-3 leading-snug" style={{ color: "var(--danger-fg)" }}>
          O saldo ficou negativo. Os agentes param até uma nova compra de crédito.
        </p>
      )}

      {aberto && (
        <div className="mt-5 border-t border-card-border pt-4">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="font-medium pb-2">Quando</th>
                <th className="font-medium pb-2">O que</th>
                <th className="font-medium pb-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {extrato.map(l => {
                const credito = l.valor > 0;
                return (
                  <tr key={l.id} className="border-t border-card-border">
                    <td className="py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                      {new Date(l.criado_em).toLocaleString("pt-BR", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 text-foreground">{l.tipo === "consumo" ? ROTULO.consumo : (l.descricao || ROTULO[l.tipo] || l.tipo)}</td>
                    {/* O sinal carrega o significado, não a cor: o crédito
                        ganha o verde porque é o evento raro e bom; o consumo é
                        rotina e fica na tinta normal. */}
                    <td
                      className="py-2 text-right tabular-nums whitespace-nowrap font-medium"
                      style={{ color: credito ? "var(--text-link)" : "var(--text-body)" }}
                    >
                      {credito ? "+" : "−"}{(credito ? dinheiro : dinheiroFino).format(Math.abs(l.valor))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {extrato.length === 50 && (
            <p className="text-[12px] text-muted-foreground mt-3">
              Mostrando os 50 lançamentos mais recentes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
