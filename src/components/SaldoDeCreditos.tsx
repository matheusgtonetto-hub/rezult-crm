import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

/** Uma linha da aba Consumo, como `consumo_por_origem` devolve. */
interface LinhaDeConsumo {
  origem: string;
  rotulo: string;
  chamadas: number;
  creditos: number;
  custo_usd: number;
}

/**
 * As janelas da aba Consumo.
 *
 * Rótulo "24 horas", e não "Hoje", porque a função no banco usa janela CORRIDA
 * (`now() - N dias`), não dia de calendário. Chamar de "Hoje" seria prometer um
 * corte à meia-noite que a consulta não faz.
 */
const JANELAS = [
  { dias: 1,  rotulo: "24 horas" },
  { dias: 7,  rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
];

/**
 * Créditos e contagens são inteiros, com separador de milhar.
 *
 * ─── Por que um formatador só, onde antes havia dois ────────────────────────
 *
 * Enquanto o saldo era em dólar, o extrato precisava de duas escalas: duas
 * casas para a compra (US$ 25,00) e QUATRO para o consumo (US$ 0,0232), senão
 * toda linha de uso aparecia como US$ 0,00. Eram duas unidades de leitura na
 * mesma coluna.
 *
 * Em créditos, compra e consumo caem na mesma escala -- 25.000 e 35 -- e o
 * saldo volta a ser a soma do extrato, conferível somando a coluna.
 */
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/*
 * ─── Ida e volta do dólar na tela (25/09/2026) ──────────────────────────────
 *
 * O saldo chegou a aparecer em dólar do que foi pago, e voltou para crédito no
 * mesmo dia. A razão da volta vale ficar escrita, porque a ideia é tentadora:
 * em dólar, a tela fica 1:1 com o pagamento e some uma unidade para explicar.
 *
 * O que ela custa é a liberdade de reajustar. Com dólar pago na tela, vender
 * 833 créditos por dólar (markup de 80%) faria quem paga US$ 1 ver US$ 0,83
 * entrar -- impossível de anunciar. O reajuste passaria a ter de mexer em
 * quanto cada crédito COMPRA, o que desvaloriza saldo já vendido e é
 * exatamente o que a regra 4.4 do plano proíbe.
 *
 * Em crédito, as duas taxas voltam a ser independentes: reajustar é vender
 * menos créditos por dólar, e o saldo de quem já comprou não é tocado.
 */

/** No popup de compra, que é onde o valor é dinheiro de verdade. */
const dolar = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/**
 * Quatro casas FIXAS, só para quem usa chave própria (BYOK).
 *
 * Essa empresa não tem saldo no Rezult: ela paga o fornecedor direto, e o
 * número que importa para ela é o custo real. Com duas casas, um consumo de
 * US$ 0,0232 apareceria como US$ 0,02 e uma linha menor como US$ 0,00. Fixas, e
 * não "até quatro", porque a coluna alternando 0,018 / 0,03 / 0,036 obriga a
 * contar dígitos para comparar duas linhas.
 */
const dolarFino = new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4,
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
 * Quantos créditos cada dólar pago compra. Markup de 30% (dono, 25/09/2026).
 *
 * Esta é a taxa de VENDA, e ela pode mudar: vender menos créditos por dólar é
 * como um reajuste acontece, e o saldo de quem já comprou não é tocado.
 *
 * NÃO confundir com a taxa de consumo (1.500 créditos por dólar de custo real),
 * que vive em `debitar_credito` no banco e é FIXA. Aquela é a definição da
 * unidade: mudá-la mudaria o significado de todo saldo já vendido. Ver o
 * cabeçalho da migration 20260925000002.
 *
 * ─── Como 1.070 sai de "30%" ────────────────────────────────────────────────
 *
 * O markup é sobre o custo EFETIVO, não sobre o preço de tabela do fornecedor.
 * Comprar US$ 1 de custo custa US$ 1,0764, porque o IOF (3,5%) e o spread do
 * cartão (~4%) incidem na recarga.
 *
 *     1500 / (1,30 x 1,0764) = 1072,3  ->  1.070
 *
 * Arredondado para BAIXO de propósito: menos crédito por dólar empurra o markup
 * para cima (30,25%), e o erro de arredondamento deve cair do lado seguro.
 *
 * Esta era 1.000 e estava ERRADA. Aquele número foi derivado sobre o custo cru,
 * ignorando IOF e spread, enquanto a tabela de cenários que embasou a decisão
 * calculava sobre o efetivo. Os "50%" daquela constante eram 39,4% de verdade.
 *
 * Margem líquida em 30,25%, depois de Stripe (3,99%) e imposto (6%): ~13%.
 */
const CREDITOS_POR_DOLAR_PAGO = 1070;

/**
 * Teto de compra. Espelho de `COMPRA_MAXIMA_USD` em
 * `supabase/functions/create-checkout-session`, que é quem realmente recusa.
 *
 * Não é desconfiança do cliente, é proteção contra dedo errado: um zero a mais
 * em "500" vira uma cobrança de US$ 5.000, e desfazer isso custa estorno, taxa
 * e uma conversa ruim.
 */
const COMPRA_MAXIMA = 2000;

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
  const { user } = useAuth();
  const [conta, setConta] = useState<Conta | null>(null);
  const [extrato, setExtrato] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [extratoAberto, setExtratoAberto] = useState(false);
  const [compraAberta, setCompraAberta] = useState(false);
  const [valor, setValor] = useState("");

  const [temUso, setTemUso] = useState(false);
  const [indoPagar, setIndoPagar] = useState(false);
  const [consumo, setConsumo] = useState<LinhaDeConsumo[]>([]);
  const [dias, setDias] = useState(30);
  const [carregandoConsumo, setCarregandoConsumo] = useState(false);

  const carregar = useCallback(async () => {
    if (!companyId) { setCarregando(false); return; }

    const { data } = await supabase
      .from("credit_accounts")
      .select("saldo_creditos")
      .eq("company_id", companyId)
      .maybeSingle();

    setConta(data ? { saldo_creditos: Number(data.saldo_creditos) } : null);

    /*
     * Existe consumo a mostrar?
     *
     * Antes o botão do extrato dependia de haver LANÇAMENTOS, e quem usa chave
     * própria não tem nenhum -- não há débito porque ela paga o fornecedor
     * direto. Resultado: justamente quem só tem consumo para ver ficava sem o
     * botão que mostra consumo.
     *
     * `head: true` traz só a contagem, sem trazer linha nenhuma.
     */
    const { count } = await supabase
      .from("agent_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .limit(1);
    setTemUso((count ?? 0) > 0);

    if (data) {
      /*
       * Só o que NÃO é consumo.
       *
       * Antes esta lista trazia tudo, e o consumo dominava: uma conversa de
       * agente gera dezenas de linhas de poucos créditos cada, e a compra --
       * o único lançamento que o cliente procura aqui -- ficava enterrada.
       * Consumo tem aba própria, agregada, desde 25/09/2026.
       */
      const { data: linhas } = await supabase
        .from("credit_transactions")
        .select("id, tipo, valor, descricao, criado_em")
        .eq("company_id", companyId)
        .neq("tipo", "consumo")
        .order("criado_em", { ascending: false })
        .limit(100);
      setExtrato((linhas ?? []).map(l => ({ ...l, valor: Number(l.valor) })) as Lancamento[]);
    }
    setCarregando(false);
  }, [companyId]);

  useEffect(() => { void carregar(); }, [carregar]);

  /*
   * ─── Volta do checkout: espera o webhook ──────────────────────────────────
   *
   * O Stripe manda o cliente para `/agentes?credito=ok` assim que o pagamento
   * passa, mas quem credita é o webhook, que chega alguns instantes depois.
   * Sem esta espera, a pessoa paga e vê o saldo ANTIGO -- e a conclusão óbvia
   * dela é que o dinheiro se perdeu.
   *
   * Recarrega a cada 2s, no máximo 8 vezes (~16s), e para assim que o saldo
   * mudar. Limite existe porque webhook pode falhar: continuar tentando para
   * sempre trocaria uma tela errada por uma tela que nunca assenta.
   *
   * O parâmetro sai da URL na primeira passada, senão um F5 reinicia a espera.
   */
  useEffect(() => {
    if (!companyId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("credito") !== "ok") return;

    url.searchParams.delete("credito");
    window.history.replaceState({}, "", url);
    toast.success("Pagamento recebido. O saldo aparece em alguns segundos.");

    const saldoAntes = conta?.saldo_creditos ?? null;
    let tentativas = 0;
    const timer = setInterval(() => {
      tentativas += 1;
      void supabase
        .from("credit_accounts")
        .select("saldo_creditos")
        .eq("company_id", companyId)
        .maybeSingle()
        .then(({ data }) => {
          const agora = data ? Number(data.saldo_creditos) : null;
          if (agora !== null && agora !== saldoAntes) {
            setConta({ saldo_creditos: agora });
            void carregar();
            clearInterval(timer);
          } else if (tentativas >= 8) {
            clearInterval(timer);
          }
        });
    }, 2000);

    return () => clearInterval(timer);
    // `conta` de propósito fora das dependências: ele muda a cada recarga e
    // reiniciaria a espera, criando um laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, carregar]);

  /*
   * O consumo é buscado só quando o popup abre, e de novo a cada troca de
   * janela. Não entra no carregamento do cartão: a agregação junta três tabelas
   * e ninguém deveria pagar esse custo para ver um saldo.
   */
  useEffect(() => {
    if (!extratoAberto || !companyId) return;
    let cancelado = false;
    setCarregandoConsumo(true);
    void supabase
      .rpc("consumo_por_origem", { p_company_id: companyId, p_dias: dias })
      .then(({ data }) => {
        if (cancelado) return;
        setConsumo((data ?? []).map((l: Record<string, unknown>) => ({
          origem: String(l.origem),
          rotulo: String(l.rotulo),
          chamadas: Number(l.chamadas),
          creditos: Number(l.creditos),
          custo_usd: Number(l.custo_usd),
        })));
        setCarregandoConsumo(false);
      });
    return () => { cancelado = true; };
  }, [extratoAberto, companyId, dias]);

  const saldo = conta?.saldo_creditos ?? 0;
  /*
   * Quem PAGA define a unidade da coluna de consumo.
   *
   * Com conta de crédito, a empresa comprou créditos e é neles que o gasto
   * dela é contado. Sem conta, ela usa chave própria e paga o fornecedor
   * direto: mostrar créditos ali seria inventar uma moeda que ela não tem, e o
   * número que ela precisa conferir é a fatura em dólar.
   */
  const temConta = conta !== null;
  const negativo = saldo < 0;
  const escolhido = Number(valor.replace(",", "."));
  /*
   * Só reclama depois de a pessoa digitar algo. Campo vazio não é erro, é o
   * estado inicial -- avisar ali seria repreender quem ainda nem começou.
   * `Number.isFinite` cobre o que não é número ("," ou "." sozinhos), que
   * também não serve como valor.
   */
  const abaixoDoMinimo = valor.trim() !== "" && (!Number.isFinite(escolhido) || escolhido < COMPRA_MINIMA);
  const acimaDoMaximo  = Number.isFinite(escolhido) && escolhido > COMPRA_MAXIMA;
  const valorValido    = Number.isFinite(escolhido) && escolhido >= COMPRA_MINIMA && escolhido <= COMPRA_MAXIMA;

  /**
   * Abre o checkout do Stripe numa aba nova.
   *
   * Aba nova, e não navegação: quem desiste do pagamento volta para a tela dos
   * agentes como deixou, sem recarregar a página e perder o que estava vendo.
   *
   * O saldo NÃO é atualizado aqui. Quem credita é o webhook, depois que o
   * Stripe confirma o pagamento, e confiar no retorno do navegador significaria
   * dar saldo a quem fechou a aba no meio.
   */
  const irParaOPagamento = async () => {
    if (!companyId || !user || !valorValido) return;
    setIndoPagar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          tipo: "credito",
          valorUsd: escolhido,
          companyId,
          userId: user.id,
          userEmail: user.email ?? "",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Não foi possível abrir o pagamento.");
      window.open(data.url, "_blank");
      setCompraAberta(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível abrir o pagamento.");
    } finally {
      setIndoPagar(false);
    }
  };

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
          {carregando ? "—" : inteiro.format(saldo)}
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
          {(extrato.length > 0 || temUso) && (
            <Button variant="outline" onClick={() => setExtratoAberto(true)} className="border-card-border shrink-0">
              <Receipt size={16} /> Extrato
            </Button>
          )}
        </div>
      </div>

      {/* ── Popup do extrato: Compras e Consumo ──────────────────────────── */}
      {/* Duas abas, e não uma lista só.
          São duas perguntas diferentes -- "quanto eu pus" e "no que foi" -- e
          juntá-las numa coluna fazia a compra desaparecer no meio de dezenas de
          linhas de consumo. A separação é a mesma que o concorrente usa, com
          "Créditos" em cima e um explorador de custos embaixo. */}
      <Dialog open={extratoAberto} onOpenChange={setExtratoAberto}>
        <DialogContent className="max-w-xl bg-card">
          <DialogHeader>
            <DialogTitle>Extrato</DialogTitle>
            <DialogDescription>
              Saldo de {inteiro.format(saldo)} {saldo === 1 ? "crédito" : "créditos"}.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="consumo">
            <TabsList className="w-full">
              <TabsTrigger value="consumo" className="flex-1">Consumo</TabsTrigger>
              <TabsTrigger value="compras" className="flex-1">Compras</TabsTrigger>
            </TabsList>

            {/* ── Consumo: agregado, sem linha por chamada ──────────────────
                Uma linha por chamada seria uma parede de lançamentos de poucos
                créditos, ilegível e sem utilidade: a pergunta do cliente é
                "o que está gastando o meu saldo", não "quanto custou a resposta
                das 14h32". */}
            <TabsContent value="consumo" className="mt-3">
              <div className="flex gap-1.5 mb-3">
                {JANELAS.map(j => (
                  <Button
                    key={j.dias}
                    type="button"
                    variant="outline"
                    onClick={() => setDias(j.dias)}
                    className={`h-8 text-[13px] border-card-border ${dias === j.dias ? "border-primary text-primary" : ""}`}
                  >
                    {j.rotulo}
                  </Button>
                ))}
              </div>

              {carregandoConsumo ? (
                <p className="text-[13px] text-muted-foreground py-6 text-center">Carregando…</p>
              ) : consumo.length === 0 ? (
                /* Frase, e não uma grade de zeros: vazio é informação, não
                   tabela vazia com cabeçalho. */
                <p className="text-[13px] text-muted-foreground py-6 text-center">Nada gasto neste período.</p>
              ) : (
                <div className="max-h-[46vh] overflow-y-auto -mx-1 px-1">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-muted-foreground text-left">
                        <th className="font-medium pb-2">O que</th>
                        <th className="font-medium pb-2 text-right">Chamadas</th>
                        <th className="font-medium pb-2 text-right">
                          {temConta ? "Créditos" : "Custo"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumo.map(l => (
                        <tr key={`${l.origem}-${l.rotulo}`} className="border-t border-card-border">
                          <td className="py-2 text-foreground">{l.rotulo}</td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {inteiro.format(l.chamadas)}
                          </td>
                          {/* A unidade depende de quem paga: quem tem saldo no
                              Rezult vê créditos, quem usa a própria chave vê o
                              dólar que o fornecedor vai cobrar dele. */}
                          <td className="py-2 text-right tabular-nums font-medium text-foreground">
                            {temConta ? inteiro.format(l.creditos) : dolarFino.format(l.custo_usd)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-card-border">
                        <td className="py-2 font-medium text-foreground">Total</td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {inteiro.format(consumo.reduce((s, l) => s + l.chamadas, 0))}
                        </td>
                        <td className="py-2 text-right tabular-nums font-semibold text-foreground">
                          {temConta
                            ? inteiro.format(consumo.reduce((s, l) => s + l.creditos, 0))
                            : dolarFino.format(consumo.reduce((s, l) => s + l.custo_usd, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ── Compras: cronológico, poucas linhas, dinheiro de verdade ── */}
            <TabsContent value="compras" className="mt-3">
              {extrato.length === 0 ? (
                <p className="text-[13px] text-muted-foreground py-6 text-center">Nenhuma compra ainda.</p>
              ) : (
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
                              {l.descricao || ROTULO[l.tipo] || l.tipo}
                            </td>
                            {/* O sinal carrega o significado; a cor só destaca o
                                crédito, que é o evento que interessa. */}
                            <td
                              className="py-2 text-right tabular-nums whitespace-nowrap font-medium"
                              style={{ color: credito ? "var(--text-link)" : "var(--text-body)" }}
                            >
                              {credito ? "+" : "−"}{inteiro.format(Math.abs(l.valor))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {extrato.length === 100 && (
                <p className="text-[12px] text-muted-foreground mt-2">Mostrando os 100 lançamentos mais recentes.</p>
              )}
            </TabsContent>
          </Tabs>
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

            {acimaDoMaximo && (
              <p className="text-[12px] leading-snug" style={{ color: "var(--danger-fg)" }}>
                O maior valor por compra é US$ {inteiro.format(COMPRA_MAXIMA)}.
              </p>
            )}

            {/* Quantos créditos o valor digitado compra.
                É a única ponte entre as duas unidades da tela, e ela precisa
                existir: o campo está em dólar e o saldo, em créditos. Sem esta
                linha, a pessoa paga US$ 25 e vê o saldo subir 25.000 sem
                entender de onde saiu o número.

                Some quando o valor é inválido, porque aí o aviso do mínimo já
                ocupa este lugar e dois textos empilhados competiriam. */}
            {valorValido && (
              <p className="text-[13px] leading-snug text-muted-foreground">
                {dolar.format(escolhido)} compram{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {inteiro.format(Math.floor(escolhido * CREDITOS_POR_DOLAR_PAGO))} créditos
                </span>
                .
              </p>
            )}
          </div>

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
            <Button
              className="w-full"
              disabled={!valorValido || indoPagar}
              onClick={() => void irParaOPagamento()}
            >
              {indoPagar
                ? <><Loader2 size={16} className="animate-spin" /> Abrindo…</>
                : "Ir para o pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
