// Imports por `npm:`, e não pelo esm.sh. Ver o mesmo comentário em
// `create-checkout-session`: o esm.sh injeta polyfills vindos do `deno.land`,
// que são baixados na hora de empacotar e vivem dando timeout no deploy.
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Webhook da Ticto: o caminho do pagamento PARCELADO.
 *
 * A divisão é: mensal e à vista pela Stripe, parcelado pela Ticto. Os dois
 * terminam escrevendo nas mesmas colunas de `companies`, porque para o resto do
 * produto não importa por onde o dinheiro entrou.
 *
 * Todo postback é arquivado em `ticto_eventos` ANTES de qualquer interpretação,
 * e só depois refletido na empresa. Assim um evento que a gente ainda não sabe
 * tratar não se perde: fica lá, com `processado = false`, para ser reprocessado
 * quando a regra existir.
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Token que a Ticto manda no CORPO de todo postback, não em cabeçalho.
 *
 * É a única prova de que o post veio mesmo dela: o endpoint é público, então
 * sem esta conferência qualquer um que descubra a URL consegue forjar uma venda.
 */
const TICTO_TOKEN = Deno.env.get("TICTO_WEBHOOK_TOKEN") ?? "";

/**
 * De qual plano é cada oferta da Ticto.
 *
 * Mapeado por CÓDIGO, e não por nome: o nome é editado no painel e já divergiu
 * uma vez ("50% OFF" contra "50% Off"), enquanto o código nasce com a oferta e
 * não muda. Cada plano tem quatro entradas: semestral e anual, cada um em duas
 * versões, a com desconto na primeira cobrança e a de preço cheio.
 *
 * O PERÍODO não está aqui de propósito. Ele vem do próprio postback, em
 * `item.days_of_access`, que é a fonte de verdade da Ticto sobre até quando o
 * acesso vale. Deduzir do nome da oferta seria repetir uma informação que já
 * chega pronta, e errar quando alguém mudar o período no painel.
 *
 * Oferta nova no painel precisa entrar aqui, senão a venda chega e não vira
 * plano. É o preço de amarrar o catálogo deles ao nosso.
 */
const PLANO_POR_OFERTA: Record<string, string> = {
  // Silver
  OE7995DD8: "silver",   // Semestral, desconto na 1ª
  O518B34CF: "silver",   // Semestral, cheia
  O44365E05: "silver",   // Anual, desconto na 1ª
  OC1C656D7: "silver",   // Anual, cheia
  // Platinum
  OD167A6C3: "platinum", // Semestral, desconto na 1ª
  OAE2EDAC5: "platinum", // Semestral, cheia
  O9F1934ED: "platinum", // Anual, desconto na 1ª
  OE87608FC: "platinum", // Anual, cheia
  // Emerald
  O73835BFD: "emerald",  // Semestral, desconto na 1ª
  OE94B0716: "emerald",  // Semestral, cheia
  OF062BC73: "emerald",  // Anual, desconto na 1ª
  OC5E20E3F: "emerald",  // Anual, cheia
};

/**
 * Quanto tempo o cliente continua escrevendo depois de uma cobrança recusada.
 * Mesmo valor e mesma razão do `stripe-webhook`: a primeira recusa costuma ser
 * limite ou bloqueio do banco, não inadimplência, e cortar na hora derruba
 * cliente bom que voltaria a pagar sozinho.
 */
const DIAS_DE_CARENCIA = 15;

const emIso = (data: Date) => data.toISOString();

const fimDaCarencia = () =>
  emIso(new Date(Date.now() + DIAS_DE_CARENCIA * 24 * 60 * 60 * 1000));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Até quando o acesso vale, a partir de uma venda aprovada.
 *
 * `days_of_access` é o campo da própria Ticto (180 no semestral, 365 no anual),
 * então o prazo acompanha o que está configurado na oferta sem ninguém precisar
 * manter uma tabela de períodos aqui.
 *
 * Ancorado na data do PEDIDO, e não em "agora": um postback reprocessado dias
 * depois precisa produzir a mesma data que produziria no dia da venda.
 *
 * Devolve nulo quando falta algum dos dois. Sem saber até quando o plano vale, é
 * melhor não gravar nada do que gravar uma data inventada e liberar ou cortar
 * acesso por engano.
 */
function fimDoAcesso(dataDoPedido: unknown, diasDeAcesso: unknown): string | null {
  if (typeof diasDeAcesso !== "number" || !Number.isFinite(diasDeAcesso)) return null;
  if (typeof dataDoPedido !== "string") return null;
  // A Ticto manda "2026-08-28 16:11:03", sem fuso. O `T` e o `Z` transformam
  // isso em UTC explícito, senão o JavaScript interpreta como hora local e a
  // data de vencimento varia conforme o servidor que processar.
  const base = new Date(dataDoPedido.replace(" ", "T") + "Z");
  if (Number.isNaN(base.getTime())) return null;
  return emIso(new Date(base.getTime() + diasDeAcesso * 24 * 60 * 60 * 1000));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // deno-lint-ignore no-explicit-any
  let evento: any;
  try {
    evento = await req.json();
  } catch {
    console.error("[ticto] corpo não é JSON");
    return json({ error: "invalid json" }, 400);
  }

  // Sem token configurado a função recusa tudo, em vez de aceitar tudo. Falha
  // fechada: um segredo faltando não pode virar porta aberta.
  if (!TICTO_TOKEN) {
    console.error("[ticto] TICTO_WEBHOOK_TOKEN não configurado — recusando");
    return json({ error: "not configured" }, 500);
  }

  if (evento?.token !== TICTO_TOKEN) {
    console.error("[ticto] token inválido — post ignorado");
    return json({ error: "invalid token" }, 401);
  }

  const status = String(evento?.status ?? "desconhecido");

  /**
   * De qual empresa é esta venda.
   *
   * Vem de `tracking.src`, que a gente pendura na URL do checkout. Foi a única
   * forma que sobreviveu ao teste: a Ticto DESCARTA parâmetros que não conhece,
   * então um `?company_id=` inventado não volta -- o `url_params` chega nulo.
   * O `src` está na lista fixa que ela reconhece, junto de `sck` e dos `utm_*`.
   *
   * O custo é que o `src` deixa de servir para rastrear origem de tráfego. Como
   * este link nasce dentro do produto, e não de anúncio, a origem já é sabida.
   *
   * "Não Informado" é o que ela manda quando o campo veio vazio, e precisa ser
   * tratado como ausente -- senão viraria um id literal que não existe.
   */
  const srcBruto = evento?.tracking?.src;
  const empresa =
    typeof srcBruto === "string" && srcBruto !== "Não Informado" && srcBruto.trim()
      ? srcBruto.trim()
      : null;

  const codigoDaOferta = evento?.item?.offer_code ?? null;
  const plano = codigoDaOferta ? PLANO_POR_OFERTA[codigoDaOferta] ?? null : null;

  console.log(
    `[ticto] status=${status} empresa=${empresa ?? "nao informada"}`,
    `pedido=${evento?.order?.hash ?? "-"} oferta=${codigoDaOferta ?? "-"} plano=${plano ?? "desconhecido"}`,
    `valor=${evento?.order?.paid_amount ?? "-"}`,
  );

  const db = createClient(supabaseUrl, serviceKey);

  // Arquiva ANTES de interpretar. Se a interpretação falhar, o evento continua
  // registrado e pode ser reprocessado; o contrário perderia a venda.
  let eventoId: string | null = null;
  try {
    const { data, error } = await db.from("ticto_eventos").insert({
      status,
      company_id: empresa,
      order_hash: evento?.order?.hash ?? null,
      payload:    evento,
    }).select("id").single();
    if (error) console.error("[ticto] falha ao arquivar:", error.message);
    else eventoId = data.id;
  } catch (err) {
    // Um erro ao ARQUIVAR não pode virar erro para a Ticto: ela reenviaria o
    // mesmo evento por dias por causa de um problema que não é dela.
    console.error("[ticto] erro inesperado ao arquivar:", err);
  }

  /**
   * O que cada status faz na empresa.
   *
   * Só os que mudam acesso ou cobrança entram aqui. Os demais (`pix_created`,
   * `waiting_payment`, `bank_slip_created`...) descrevem uma compra em
   * andamento: importam para auditoria, e ficam só no arquivo.
   */
  const mudancas: Record<string, string | null> = {};

  switch (status) {
    // Venda aprovada. É o único que LIBERA acesso.
    case "authorized": {
      if (!plano) {
        console.error(`[ticto] oferta ${codigoDaOferta} não está em PLANO_POR_OFERTA — acesso NÃO liberado`);
        break;
      }
      const vence = fimDoAcesso(evento?.order?.order_date, evento?.item?.days_of_access);
      if (!vence) {
        console.error("[ticto] não deu para calcular o vencimento — acesso NÃO liberado");
        break;
      }
      mudancas.plan                = plano;
      mudancas.plan_expires_at     = vence;
      mudancas.billing_status      = "ok";
      mudancas.billing_grace_until = null;
      // Encerra o teste grátis do cadastro: a partir daqui quem manda na
      // validade é a assinatura. Mesmo efeito que o stripe-webhook produz.
      mudancas.trial_ends_at       = null;
      break;
    }

    // Cobrança recusada. Não corta na hora: entra em carência.
    case "subscription_delayed":
      mudancas.billing_status      = "pendente";
      mudancas.billing_grace_until = fimDaCarencia();
      break;

    // Voltou a pagar depois de um cancelamento.
    case "uncanceled":
      mudancas.billing_status      = "ok";
      mudancas.billing_grace_until = null;
      break;

    // Cancelou por vontade própria: continua no free, sem bloqueio.
    case "subscription_canceled":
      mudancas.plan                = "free";
      mudancas.billing_status      = "ok";
      mudancas.billing_grace_until = null;
      break;

    // Estorno e chargeback tiram o acesso, mas por motivos diferentes: quem
    // pediu reembolso desistiu e volta ao free; quem abriu chargeback contestou
    // uma cobrança e fica em somente leitura até resolver.
    case "refunded":
      mudancas.plan                = "free";
      mudancas.billing_status      = "ok";
      mudancas.billing_grace_until = null;
      break;

    case "chargeback":
      mudancas.billing_status      = "bloqueado";
      mudancas.billing_grace_until = null;
      break;

    /**
     * Terminou de pagar as parcelas. NÃO é fim de acesso.
     *
     * No parcelado a Ticto cobra em N vezes um período que continua valendo: o
     * cliente do semestral em 6x acabou de quitar o semestre, e o acesso vai até
     * o `plan_expires_at` que a venda gravou. Tratar isto como fim cortaria um
     * cliente adimplente.
     *
     * A renovação vem como uma venda nova, com o valor cheio, e é ela que
     * empurra a data para frente.
     */
    case "all_charges_paid":
      console.log("[ticto] parcelas quitadas — acesso mantido até o vencimento já gravado");
      break;

    default:
      console.log(`[ticto] status ${status} não altera a empresa — apenas arquivado`);
  }

  if (Object.keys(mudancas).length > 0) {
    if (!empresa) {
      // A venda existe na Ticto e não tem dono aqui. Fica no arquivo com
      // `processado = false` para conciliação manual, em vez de sumir.
      console.error(`[ticto] ${status} sem empresa no tracking.src — nada aplicado, evento ${eventoId} pendente`);
    } else {
      const { error } = await db.from("companies").update(mudancas).eq("id", empresa);
      if (error) {
        console.error("[ticto] erro ao atualizar companies:", error.message);
      } else {
        console.log(`[ticto] empresa ${empresa} atualizada:`, JSON.stringify(mudancas));
        if (eventoId) await db.from("ticto_eventos").update({ processado: true }).eq("id", eventoId);
      }
    }
  } else if (eventoId) {
    // Nada a aplicar é um desfecho legítimo, não uma pendência.
    await db.from("ticto_eventos").update({ processado: true }).eq("id", eventoId);
  }

  return json({ received: true });
});
