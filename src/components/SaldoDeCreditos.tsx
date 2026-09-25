import { useCallback, useEffect, useState } from "react";
import { Plus, Receipt } from "lucide-react";
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
  saldo_creditos: number;
}

interface Lancamento {
  id: string;
  tipo: string;
  valor: number;
  descricao: string | null;
  criado_em: string;
}

/**
 * Créditos são inteiros, com separador de milhar.
 *
 * ─── Por que um formatador só, onde antes havia dois ────────────────────────
 *
 * Enquanto o saldo era em dólar, o extrato precisava de duas escalas: duas
 * casas para a compra (US$ 25,00) e QUATRO para o consumo (US$ 0,0232), senão
 * toda linha de uso aparecia como US$ 0,00. Eram duas unidades de leitura na
 * mesma coluna.
 *
 * Com a unidade em créditos (decisão do dono, 25/09/2026), compra e consumo
 * caem na mesma escala -- 25.000 e 35 -- e o segundo formatador deixou de ter
 * razão de existir. É o efeito colateral bom da mudança de unidade: o saldo é a
 * soma do extrato, e agora dá para conferir isso somando a coluna.
 */
const creditos = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Só no popup de compra, que é o único lugar onde ainda existe dinheiro. */
const dolar = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const ROTULO: Record<string, string> = {
  compra: "Compra de créditos",
  consumo: "Uso de agente",
  ajuste: "Ajuste",
  estorno: "Estorno",
  expiracao: "Expiração",
};

/**
 * Os degraus de compra, em dólar.
 *
 * O dólar aparece AQUI e em nenhum outro lugar da interface: é o ato do
 * pagamento, o único momento em que o valor é dinheiro de verdade. O saldo e o
 * consumo são em créditos (decisão do dono, 25/09/2026).
 */
const VALORES_SUGERIDOS = [10, 25, 50, 100];

/**
 * Quantos créditos cada dólar pago compra.
 *
 * Esta é a taxa de VENDA, e ela pode mudar: vender menos créditos por dólar é
 * como um reajuste de preço acontece, e o saldo de quem já comprou não é
 * tocado. Hoje 1.000, o que corresponde a 50% de markup.
 *
 * NÃO confundir com a outra taxa, a de consumo (1.500 créditos por dólar de
 * custo real), que vive em `debitar_credito` no banco e é FIXA. Aquela é a
 * definição da unidade -- mudá-la mudaria o significado de todo saldo já
 * vendido. Ver o cabeçalho da migration 20260925000002.
 */
const CREDITOS_POR_DOLAR_PAGO = 1000;

/**
 * Compra mínima, em dólar.
 *
 * Não é número escolhido a esmo: é o mesmo piso de recarga que a OpenAI impõe
 * na conta que abastece todo mundo (verificado em 24/09/2026). Aceitar menos
 * aqui criaria venda que o outro lado não consegue repor na mesma proporção, e
 * a taxa do Stripe comeria boa parte de um valor tão pequeno.
 */
const COMPRA_MINIMA = 5;

export function SaldoDeCreditos({ companyId }: { companyId?: string }) {
  const [conta, setConta] = useState<Conta | null>(null);
  const [extrato, setExtrato] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [extratoAberto, setExtratoAberto] = useState(false);
  const [compraAberta, setCompraAberta] = useState(false);
  const [valor, setValor] = useState("");

  const carregar = useCallback(async () => {
    if (!companyId) { setCarregando(false); return; }

    const { data } = await supabase
      .from("credit_accounts")
      .select("saldo_creditos")
      .eq("company_id", companyId)
      .maybeSingle();

    setConta(data ? { saldo_creditos: Number(data.saldo_creditos) } : null);

    if (data) {
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

  const saldo = conta?.saldo_creditos ?? 0;
  const negativo = saldo < 0;
  const escolhido = Number(valor.replace(",", "."));
  /*
   * Só reclama depois de a pessoa digitar algo. Campo vazio não é erro, é o
   * estado inicial -- avisar ali seria repreender quem ainda nem começou.
   * `Number.isFinite` cobre o que não é número ("," ou "." sozinhos), que
   * também não serve como valor.
   */
  const abaixoDoMinimo = valor.trim() !== "" && (!Number.isFinite(escolhido) || escolhido < COMPRA_MINIMA);

  return (
    <>
      {/* Cartão próprio, irmão do da Base (dono, 24/09/2026: "divida em cards
          diferentes"). Mesmos tokens do vizinho -- superfície, borda, raio de
          painel e elevação 1 -- para os dois lerem como um par, e não como duas
          peças de origens diferentes. */}
      <div className="bg-card border border-card-border rounded-2xl shadow-elev-1 p-5 flex flex-col h-full">
        <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Saldo</p>

        {/* Métrica do sistema: 32/600, `tabular-nums` porque o número muda a
            cada uso e dígitos de larguras diferentes fazem o saldo tremer. */}
        <p
          className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums mt-1"
          style={{ color: negativo ? "var(--danger-fg)" : "var(--text-heading)" }}
        >
          {carregando ? "—" : creditos.format(saldo)}
          {/* A unidade fica ao lado do número, e não no rótulo acima, porque
              "37.206" sozinho não diz nada. Menor e mais clara que o valor
              para o olho pegar a grandeza primeiro e a unidade depois. */}
          {!carregando && (
            <span className="text-[15px] font-medium tracking-normal ml-1.5 text-muted-foreground">
              {saldo === 1 ? "crédito" : "créditos"}
            </span>
          )}
        </p>

        {/* O texto vale com ou sem saldo, porque responde a pergunta que vem
            antes de comprar e continua vindo depois: "quanto isso me custa?".
            Antes havia "US$ 0,1932 usados hoje · teto de US$ 5,00 por dia" --
            um número cru mais um teto que eu tinha INVENTADO para a
            demonstração. Texto do dono, 25/09/2026. */}
        {/* `mt-[5px]`: sem ele, o respiro entre o número e esta linha vinha
            só do line-height, e o subtítulo ficava colado (dono, 25/09/2026). */}
        <p className="text-[12px] text-muted-foreground leading-relaxed mt-[5px]">
          Pague só pelo que usar.
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
              Saldo de {creditos.format(saldo)} créditos · cada linha é uma compra ou um uso de agente.
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
                  <th className="font-medium pb-2 text-right">Créditos</th>
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
                        {credito ? "+" : "−"}{creditos.format(Math.abs(l.valor))}
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
              O crédito é consumido conforme os agentes trabalham.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* A cifra é PARTE do campo, não placeholder: ela fica visível
                enquanto se digita, que é quando a pessoa precisa saber em que
                moeda está o número. Como placeholder, sumia no primeiro
                caractere (dono, 25/09/2026).

                `pointer-events-none` para o clique atravessar até o input, e
                `pl-11` para o texto digitado começar depois dela. */}
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium text-[color:var(--text-subtle)]">
                US$
              </span>
              <Input
                autoFocus
                inputMode="decimal"
                /* Maior e mais pesado que o padrão do sistema (14/400): este é o
                   campo que a pessoa veio preencher, e o valor digitado é a
                   única informação da tela que ela precisa conferir antes de
                   pagar (dono, 25/09/2026).

                   A cifra usa o MESMO tamanho e peso, e se diferencia só pela
                   cor (dono, 25/09): os dois formam um valor só, "US$ 25", em
                   vez de um rótulo pequeno grudado num número grande. O recuo
                   subiu de 44 para 56px porque a cifra maior ocupa mais. */
                className="pl-14 text-lg font-medium"
                value={valor}
                onChange={e => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
              />
            </div>
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

            {abaixoDoMinimo && (
              <p className="text-[12px] leading-snug" style={{ color: "var(--danger-fg)" }}>
                O menor valor é US$ {COMPRA_MINIMA}.
              </p>
            )}

            {/* Quantos créditos o valor digitado compra.
                É a única ponte entre as duas unidades da tela, e ela precisa
                existir: o campo está em dólar e o saldo, em créditos. Sem esta
                linha, a pessoa paga US$ 25 e vê o saldo subir 25.000 sem
                entender de onde saiu o número.

                Some quando o valor é inválido, porque aí o aviso do mínimo já
                ocupa este lugar e dois textos empilhados competiriam. */}
            {!abaixoDoMinimo && escolhido >= COMPRA_MINIMA && (
              <p className="text-[13px] leading-snug text-muted-foreground">
                {dolar.format(escolhido)} compram{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {creditos.format(Math.floor(escolhido * CREDITOS_POR_DOLAR_PAGO))} créditos
                </span>
                .
              </p>
            )}
          </div>

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
            {/* Desabilitado de propósito: a cobrança é o passo seguinte, e um
                botão que abre um checkout inexistente é pior do que um botão
                que não abre. A nota que explicava isso saiu a pedido do dono
                (25/09/2026), então o estado desabilitado é a única pista.

                Quando o passo 4 ligar o Stripe, este `disabled` fixo vira
                `disabled={abaixoDoMinimo || !escolhido}` -- a regra do mínimo
                já está escrita acima, só não tem o que travar ainda. */}
            <Button disabled className="w-full">Ir para o pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
