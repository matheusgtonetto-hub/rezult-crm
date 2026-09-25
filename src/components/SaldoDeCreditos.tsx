import { useCallback, useEffect, useState } from "react";
import { Plus, Receipt, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * O saldo de crédito de IA da empresa, em cartão próprio ao lado da Base.
 *
 * ─── Por que aparece mesmo com saldo zero ───────────────────────────────────
 *
 * Na primeira versão ele se escondia para quem não tinha conta de crédito, e
 * fazia sentido: era um bloco informativo a mais numa tela cheia. Deixou de
 * fazer quando ganhou o botão de comprar (dono, 24/09/2026) -- agora ele é a
 * PORTA de entrada do crédito, e uma porta que só aparece depois de você
 * entrar não serve para nada.
 *
 * ─── Por que popup e não expansão ───────────────────────────────────────────
 *
 * O extrato abria empurrando o resto da página para baixo. Numa metade de
 * cartão isso reflui a tela inteira só para mostrar uma tabela. Em popup, a
 * tabela tem a largura que precisa e a página fica quieta (dono, 24/09/2026).
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

const dinheiro = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/**
 * Quatro casas FIXAS para consumo. Com "até quatro" a coluna alternava
 * 0,018 / 0,03 / 0,036 e comparar duas linhas exigia contar dígitos.
 */
const dinheiroFino = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4,
});

const ROTULO: Record<string, string> = {
  compra: "Compra de crédito",
  consumo: "Uso de agente",
  ajuste: "Ajuste",
  estorno: "Estorno",
  expiracao: "Expiração",
};

/** Os mesmos degraus do concorrente, em dólar, porque o saldo é em dólar. */
const VALORES_SUGERIDOS = [10, 25, 50, 100];

export function SaldoDeCreditos({ companyId }: { companyId?: string }) {
  const [conta, setConta] = useState<Conta | null>(null);
  const [consumoHoje, setConsumoHoje] = useState(0);
  const [extrato, setExtrato] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [extratoAberto, setExtratoAberto] = useState(false);
  const [compraAberta, setCompraAberta] = useState(false);
  const [valor, setValor] = useState("");

  const carregar = useCallback(async () => {
    if (!companyId) { setCarregando(false); return; }

    const { data } = await supabase
      .from("credit_accounts")
      .select("saldo_usd, teto_diario_usd")
      .eq("company_id", companyId)
      .maybeSingle();

    setConta(data
      ? { saldo_usd: Number(data.saldo_usd), teto_diario_usd: data.teto_diario_usd === null ? null : Number(data.teto_diario_usd) }
      : null);

    if (data) {
      // O consumo do dia vem da função, e não de uma soma aqui, porque o "dia"
      // é o de São Paulo e não o do navegador: a conta mora num lugar só.
      const { data: hoje } = await supabase.rpc("consumo_do_dia", { p_company_id: companyId });
      setConsumoHoje(Number(hoje ?? 0));

      const { data: linhas } = await supabase
        .from("credit_transactions")
        .select("id, tipo, valor, descricao, criado_em")
        .eq("company_id", companyId)
        .order("criado_em", { ascending: false })
        .limit(100);
      setExtrato((linhas ?? []).map(l => ({ ...l, valor: Number(l.valor) })) as Lancamento[]);
    }
    setCarregando(false);
  }, [companyId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const saldo = conta?.saldo_usd ?? 0;
  const negativo = saldo < 0;
  const escolhido = Number(valor.replace(",", "."));

  return (
    <>
      {/* Cartão próprio, irmão do da Base (dono, 24/09/2026: "divida em cards
          diferentes"). Mesmos tokens do vizinho -- superfície, borda, raio de
          painel e elevação 1 -- para os dois lerem como um par, e não como duas
          peças de origens diferentes. */}
      <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 mb-4 flex flex-col h-full">
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-muted-foreground shrink-0" />
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Crédito de IA</p>
        </div>

        {/* Métrica do sistema: 32/600, `tabular-nums` porque o número muda a
            cada uso e dígitos de larguras diferentes fazem o saldo tremer. */}
        <p
          className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums mt-1"
          style={{ color: negativo ? "var(--danger-fg)" : "var(--text-heading)" }}
        >
          {carregando ? "—" : dinheiro.format(saldo)}
        </p>

        <p className="text-[12px] text-muted-foreground leading-relaxed">
          {!conta
            ? "Ligue os agentes sem precisar criar conta em outra plataforma."
            : <>
                {dinheiroFino.format(consumoHoje)} usados hoje
                {conta.teto_diario_usd !== null && ` · teto de ${dinheiro.format(conta.teto_diario_usd)} por dia`}
              </>}
        </p>

        {negativo && (
          <p className="text-[12px] mt-2 leading-snug" style={{ color: "var(--danger-fg)" }}>
            Saldo negativo: os agentes param até uma nova compra.
          </p>
        )}

        {/* `mt-auto` cola os botões no pé da metade, alinhados com o botão da
            Base do outro lado, em vez de flutuarem sob o texto. */}
        <div className="flex items-center gap-2 mt-auto pt-4">
          <Button onClick={() => { setValor(""); setCompraAberta(true); }} className="flex-1">
            <Plus size={16} /> Adicionar crédito
          </Button>
          {extrato.length > 0 && (
            <Button variant="outline" onClick={() => setExtratoAberto(true)} className="border-card-border shrink-0">
              <Receipt size={16} /> Extrato
            </Button>
          )}
        </div>
      </div>

      {/* ── Popup do extrato ─────────────────────────────────────────────── */}
      <Dialog open={extratoAberto} onOpenChange={setExtratoAberto}>
        <DialogContent className="max-w-xl bg-card">
          <DialogHeader>
            <DialogTitle>Extrato do crédito</DialogTitle>
            <DialogDescription>
              Saldo de {dinheiro.format(saldo)} · cada linha é uma compra ou um uso de agente.
            </DialogDescription>
          </DialogHeader>

          {/* Altura limitada com rolagem interna: o popup não pode crescer além
              da janela, senão o rodapé sai da tela em notebook. */}
          <div className="max-h-[52vh] overflow-y-auto -mx-1 px-1">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-card">
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
                      <td className="py-2 text-foreground">
                        {l.tipo === "consumo" ? ROTULO.consumo : (l.descricao || ROTULO[l.tipo] || l.tipo)}
                      </td>
                      {/* O sinal carrega o significado; a cor só destaca o
                          crédito, que é o evento raro. Consumo é rotina. */}
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
          </div>

          {extrato.length === 100 && (
            <p className="text-[12px] text-muted-foreground">Mostrando os 100 lançamentos mais recentes.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Popup da compra ──────────────────────────────────────────────── */}
      <Dialog open={compraAberta} onOpenChange={setCompraAberta}>
        <DialogContent className="max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Adicionar crédito</DialogTitle>
            <DialogDescription>
              O crédito é consumido conforme os agentes trabalham. Conversa de texto gasta pouco; imagem e áudio gastam mais rápido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              autoFocus
              inputMode="decimal"
              placeholder="US$"
              value={valor}
              onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
            />
            <div className="flex gap-2">
              {VALORES_SUGERIDOS.map(v => (
                <Button
                  key={v}
                  type="button"
                  variant="outline"
                  onClick={() => setValor(String(v))}
                  className={`flex-1 border-card-border ${escolhido === v ? "border-primary text-primary" : ""}`}
                >
                  US$ {v}
                </Button>
              ))}
            </div>
          </div>

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
            {/* Desabilitado de propósito, e dito em voz alta: a cobrança é o
                passo seguinte. Um botão que abre um checkout inexistente seria
                pior do que um botão que explica por que ainda não abre. */}
            <Button disabled className="w-full">Ir para o pagamento</Button>
            <p className="text-[12px] text-muted-foreground leading-snug text-center">
              O pagamento está sendo ligado ao Stripe. Enquanto isso, a chave própria em
              Configurações → Chaves de API continua funcionando.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
