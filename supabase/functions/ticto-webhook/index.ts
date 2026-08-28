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
 * ── ESTADO ATUAL: só registra ──
 *
 * Esta versão valida o token, guarda o evento e responde 200. Ela NÃO mexe no
 * banco ainda, e isso é deliberado.
 *
 * O motivo é uma pergunta de negócio em aberto: quando o cliente termina de
 * pagar as parcelas de um semestral, a Ticto renova a assinatura sozinha ou a
 * encerra? A resposta muda o que fazer com `all_charges_paid` -- num caso o
 * acesso continua e uma venda nova chega depois, no outro o parcelado é compra
 * única e o acesso vence junto. Escrever no banco antes de saber disso arrisca
 * cortar cliente adimplente ou liberar acesso não pago, e os dois erros só
 * apareceriam meses depois.
 *
 * Enquanto isso, nada se perde: cada postback fica em `ticto_eventos`, e é a
 * partir deles que a lógica será escrita e testada contra dados reais.
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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

  const status  = String(evento?.status ?? "desconhecido");
  // O parâmetro que a gente pendura na URL do checkout e a Ticto devolve. É o
  // equivalente do `metadata` da Stripe, e o único jeito confiável de saber a
  // qual empresa a venda pertence -- casar por e-mail quebra quando a pessoa
  // paga com outro endereço.
  const params  = evento?.url_params?.query_params ?? {};
  const empresa = params?.company_id ?? null;

  console.log(
    `[ticto] status=${status} empresa=${empresa ?? "nao informada"}`,
    `pedido=${evento?.order?.hash ?? "-"} oferta=${evento?.item?.offer_name ?? "-"}`,
    `parcelas=${evento?.order?.installments ?? "-"} valor=${evento?.order?.paid_amount ?? "-"}`,
  );

  // Guarda o evento inteiro. Quando a lógica for escrita, ela nasce de payloads
  // de verdade em vez de exemplo de documentação -- e os eventos que chegarem
  // antes disso poderão ser reprocessados a partir daqui.
  try {
    const db = createClient(supabaseUrl, serviceKey);
    const { error } = await db.from("ticto_eventos").insert({
      status,
      company_id: empresa,
      order_hash: evento?.order?.hash ?? null,
      payload:    evento,
    });
    if (error) console.error("[ticto] falha ao gravar o evento:", error.message);
  } catch (err) {
    // Um erro ao ARQUIVAR não pode virar erro para a Ticto: ela reenviaria o
    // mesmo evento por dias por causa de um problema que não é dela.
    console.error("[ticto] erro inesperado ao gravar:", err);
  }

  return json({ received: true });
});
