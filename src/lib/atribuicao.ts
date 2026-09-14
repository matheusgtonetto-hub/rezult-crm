import { supabase } from "@/lib/supabase";
import { pixelTrack } from "@/lib/metaPixel";

/**
 * Atribuição de aquisição do próprio Rezult.
 *
 * Não confundir com as UTMs dos leads dos clientes (CRMContext, painel de
 * atribuição): aquilo é funcionalidade do produto. Isto responde de qual
 * anúncio veio a EMPRESA que acabou de começar o teste.
 *
 * O caminho tem três telas: /register recebe o link do site com UTM e fbclid,
 * a confirmação de e-mail acontece em outra rota, e a empresa só nasce em
 * /company-register. Por isso a origem é guardada no primeiro passo e
 * consumida no último.
 *
 * localStorage, e não sessionStorage: a confirmação de e-mail pode abrir numa
 * aba nova, e o sessionStorage não atravessa abas.
 */

const CHAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "rz_secao"] as const;
const ARMAZEM = "rz_atribuicao";

type Atribuicao = Partial<Record<(typeof CHAVES)[number], string>>;

export function capturarAtribuicao(): void {
  try {
    const busca = new URLSearchParams(window.location.search);
    const novo: Atribuicao = {};
    let achou = false;
    for (const k of CHAVES) {
      const v = busca.get(k);
      if (v) {
        novo[k] = v;
        achou = true;
      }
    }
    // Chegada sem parâmetro não apaga a origem já guardada.
    if (achou) localStorage.setItem(ARMAZEM, JSON.stringify(novo));
  } catch {
    // Storage bloqueado (aba anônima em alguns navegadores): segue sem origem.
  }
}

function lerAtribuicao(): Atribuicao {
  try {
    return JSON.parse(localStorage.getItem(ARMAZEM) ?? "{}") as Atribuicao;
  } catch {
    return {};
  }
}

function lerCookie(nome: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nome}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * O evento que a campanha otimiza.
 *
 * Dispara quando a empresa é criada, que é o momento em que `trial_ends_at` é
 * gravado e o teste de fato começa. O `Lead` do /register continua existindo,
 * mas acontece antes da confirmação de e-mail e conta gente que nunca entra.
 *
 * Vai por dois caminhos com o mesmo `event_id`: pixel no navegador (rápido,
 * mas perde para bloqueador de anúncio) e Conversions API no servidor (não
 * perde, e leva _fbp, _fbc, IP e user agent, que é o que permite à Meta
 * atribuir o evento ao anúncio). A Meta deduplica pelo id.
 *
 * Nunca espera resposta: a Meta não pode atrasar a entrada no produto.
 */
export function registrarInicioDeTeste(dados: { companyId: string; nome?: string; telefone?: string }): void {
  const eventId = `trial_${dados.companyId}`;
  const atribuicao = lerAtribuicao();
  const fbc = lerCookie("_fbc") ?? (atribuicao.fbclid ? `fb.1.${Date.now()}.${atribuicao.fbclid}` : null);

  pixelTrack("StartTrial", { value: 0, currency: "BRL", content_name: "trial_silver" }, eventId);

  supabase.functions
    .invoke("meta-evento-trial", {
      body: {
        company_id: dados.companyId,
        event_id: eventId,
        event_source_url: window.location.href,
        nome: dados.nome,
        telefone: dados.telefone,
        fbp: lerCookie("_fbp"),
        fbc,
        atribuicao,
      },
    })
    .then(({ error }) => {
      if (error) console.warn("[atribuicao] StartTrial no servidor falhou:", error.message);
    })
    .catch((e) => console.warn("[atribuicao] StartTrial no servidor falhou:", e));

  try {
    localStorage.removeItem(ARMAZEM);
  } catch {
    // ignora
  }
}
