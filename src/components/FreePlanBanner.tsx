import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/context/CompanyContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PLANS, chaveDoRecurso } from "@/data/plans";
import { TextoDoRecurso } from "@/components/TextoDoRecurso";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, Zap, TriangleAlert, ChevronLeft, ChevronRight } from "lucide-react";

type BillingTab = "mensal" | "semestral" | "anual";

/**
 * Altura da FAIXA de rodapé, a dos bloqueios. Exportada porque o `AppLayout` a
 * usa como respiro: sem isso ela cobriria a última linha de qualquer tela.
 *
 * Não vale para a oferta do teste, que é um cartão flutuante e não reserva
 * espaço nenhum.
 */
export const BANNER_HEIGHT = 50;

/**
 * As cores do cartão de planos, repetidas aqui.
 *
 * O cartão flutuante é a MESMA oferta que a pessoa viu no fim do cadastro, e
 * reconhecê-la de relance é metade do trabalho dele. Cor diferente faria parecer
 * outra promoção.
 *
 * Repetidas, e não importadas do `SetupPage`: aquilo é uma página, e um
 * componente global não deve depender de uma. Se um dia virarem três usos, aí
 * sim vale um módulo de tema só delas.
 */
const OFERTA = {
  fundo:         "#05080A",
  verde:         "#00E599",
  verdeFechado:  "#047857",
  sobreVerde:    "#04140D",
  brilho:        "rgba(0, 229, 153, 0.35)",
  borda:         "rgba(0, 229, 153, 0.45)",
  texto:         "#F4F6F4",
  textoSuave:    "#D1D1D1",
} as const;

export function FreePlanBanner() {
  const { company, isFreePlan, planDaysLeft, billingBlocked, motivoDoBloqueio, isTrialing } = useCompany();
  const navigate = useNavigate();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [billingTab, setBillingTab]   = useState<BillingTab>("mensal");

  /**
   * Relógio próprio, batendo a cada 10 segundos.
   *
   * A contagem precisa andar sozinha: o cartão fica na tela o dia inteiro, e sem
   * isto ele mostraria o instante em que a aba foi aberta.
   *
   * O menor número exibido é o minuto, então bastaria bater a cada 60s. Bate a
   * cada 10 para a virada do minuto não atrasar até um minuto inteiro, que é o
   * bastante para alguém notar o contador parado e deixar de acreditar nele.
   */
  /**
   * O cartão está encolhido?
   *
   * Guardado no navegador porque a escolha precisa durar. Quem o encolheu no
   * meio de um atendimento não quer vê-lo inteiro de novo a cada tela que abre
   * -- e ele fica montado o tempo todo, em todas as rotas.
   *
   * Encolher esconde o contador e o botão, e deixa só a identidade da oferta. É
   * o suficiente para lembrar que ela existe sem ocupar o canto, e um clique
   * traz o resto de volta.
   */
  const [reduzida, setReduzida] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem("rz_oferta_reduzida") === "1",
  );
  const alternarTamanho = () => {
    setReduzida(atual => {
      const proxima = !atual;
      localStorage.setItem("rz_oferta_reduzida", proxima ? "1" : "0");
      return proxima;
    });
  };

  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!isFreePlan && !billingBlocked && !isTrialing) return null;

  /**
   * Quanto falta da oferta, em dias e horas.
   *
   * Sai de `trial_ends_at`, o mesmo campo que decide se a oferta ainda vale no
   * checkout. Dias soltos não bastam aqui: "faltam 0 dias" no último dia é pior
   * que não dizer nada, e é justamente quando a urgência importa.
   *
   * Nulo quando não há prazo, e aí a tarja volta ao formato de texto simples.
   */
  const restante = (() => {
    if (!company?.trial_ends_at) return null;
    const ms = new Date(company.trial_ends_at).getTime() - agora;
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return {
      dias:    Math.floor(ms / 86_400_000),
      horas:   Math.floor((ms % 86_400_000) / 3_600_000),
      minutos: Math.floor((ms % 3_600_000) / 60_000),
    };
  })();

  /** Dois dígitos, para o contador não mudar de largura a cada hora. */
  const dd = (n: number) => String(n).padStart(2, "0");

  // Três situações, três recados. Quem teve a cobrança recusada precisa saber
  // que a mensalidade não passou, não receber convite para crescer de plano. E
  // quem está em teste está conhecendo o produto: falar de prazo é honesto,
  // gritar "faça upgrade" em vermelho no primeiro minuto de uso não é.
  const diasRestantes = planDaysLeft ?? 0;
  const acabando = isTrialing && diasRestantes <= 1;

  const aviso = motivoDoBloqueio === "cobranca"
    ? "Pagamento não aprovado. Sua conta está em modo somente leitura até a regularização"
    : motivoDoBloqueio === "teste"
      ? "Seu teste grátis terminou. Assine um plano para voltar a usar o CRM"
      : isTrialing
        ? (diasRestantes <= 1
            ? "Seu teste grátis termina hoje. Assine para não perder o acesso ao plano"
            : `Teste grátis do plano Silver: faltam ${diasRestantes} dias`)
        : "Você precisa fazer um upgrade do plano para utilizar todas as funcionalidades";

  const rotuloBotao = motivoDoBloqueio === "cobranca"
    ? "Regularizar agora!"
    : motivoDoBloqueio === "teste" ? "Escolher um plano"
    : isTrialing ? "Assinar agora"
    : "Fazer upgrade agora!";

  // Vermelho é para problema. Um teste correndo não é problema, então ele só
  // fica vermelho quando está de fato acabando.
  const corDaTarja = (billingBlocked || !isTrialing || acabando) ? "#EF4444" : "#128A68";

  const getPrice = (plan: typeof PLANS[0]) => {
    if (billingTab === "semestral") return plan.pricing.semestral;
    if (billingTab === "anual")     return plan.pricing.anual;
    return plan.pricing.mensal;
  };

  const getSave = (plan: typeof PLANS[0]) => {
    if (billingTab === "semestral") return plan.pricing.semestralSave;
    if (billingTab === "anual")     return plan.pricing.anualSave;
    return null;
  };

  return (
    <>
      {/**
        * Durante o teste, um cartão FLUTUANTE no canto; nos demais casos, a
        * faixa de rodapé de sempre.
        *
        * A diferença não é estética, é de natureza. Cobrança recusada e teste
        * encerrado são bloqueios: eles precisam ocupar espaço, atravessar a tela
        * e atrapalhar, porque o produto está travado até alguém resolver. A
        * oferta é um convite -- ela não pode tomar a tela de quem está no meio
        * de um atendimento.
        *
        * Flutuante e no canto de baixo à direita, como as janelas de conversa.
        * O visual, porém, é o do cartão de planos -- preto, moldura verde,
        * brilho por dentro -- porque é a mesma oferta que a pessoa viu no fim do
        * cadastro. Reconhecê-la de relance é metade do trabalho deste cartão.
        *
        * ATENÇÃO: é o MESMO canto das conversas minimizadas, que ficam em
        * `right: 24, bottom: 24` com z-index bem mais alto. Com uma conversa
        * minimizada aberta, as duas se sobrepõem e a conversa fica por cima.
        * Se isso incomodar, o conserto é subir o `bottom` deste cartão.
        */}
      {restante ? (
        <div
          className="fixed rounded-[12px] overflow-hidden"
          style={{
            right: 24,
            bottom: 24,
            zIndex: 50,
            background: OFERTA.fundo,
            // Moldura no verde da marca, e não numa linha neutra: aqui ela não
            // serve para delimitar, serve para dizer de quem é o cartão. Com o
            // preto atrás, ela e o cupom são o que amarra esta peça à tela de
            // planos, onde a oferta foi apresentada.
            border: `1px solid ${OFERTA.verde}`,
            // Três camadas: a preta descola do fundo claro do CRM, o brilho de
            // fora acende a volta da moldura e o `inset` a projeta para dentro,
            // igual ao cartão de planos.
            boxShadow: `0 8px 28px rgba(0,0,0,0.35), 0 0 24px ${OFERTA.brilho}, inset 0 0 30px ${OFERTA.brilho}`,
          }}
        >
          <div className="flex items-center gap-3 pl-2 pr-3 py-3">
            {/* Fica à esquerda de tudo, e é a única coisa que não some ao
                encolher: precisa continuar sendo o caminho de volta.

                A seta aponta para onde o conteúdo vai: para a direita quando
                está sumindo, para a esquerda quando está voltando. */}
            <button
              type="button"
              onClick={alternarTamanho}
              aria-label={reduzida ? "Mostrar a oferta completa" : "Encolher a oferta"}
              className="shrink-0 rounded-[6px] p-1 transition-colors hover:bg-white/10"
              style={{ color: "rgba(244,246,244,0.6)" }}
            >
              {reduzida ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>

            {reduzida ? (
              /**
               * Encolhido: só a identidade da oferta.
               *
               * Somem o contador e o botão. Fica um lembrete de que a oferta
               * existe, e a seta traz o resto de volta.
               *
               * É deliberado abrir mão da urgência aqui: quem encolheu o cartão
               * pediu para ele sair da frente, e insistir com relógio correndo e
               * botão pulsando seria ignorar isso. O preço é que a peça
               * encolhida convence menos -- e é justamente por isso que ela
               * ainda mostra o cupom, para o clique de volta valer a pena.
               */
              <div className="min-w-0">
                <span
                  className="inline-block rounded-[6px] px-2 py-[3px] text-[11px] font-bold tracking-wide whitespace-nowrap"
                  style={{ background: OFERTA.verde, color: OFERTA.sobreVerde }}
                >
                  50% OFF - Oferta Exclusiva
                </span>
                <p
                  className="text-[12px] font-[500] mt-[6px] whitespace-nowrap"
                  style={{ color: OFERTA.textoSuave }}
                >
                  Válida durante o seu teste grátis
                </p>
              </div>
            ) : (
              <>
                <div className="min-w-0">
                  {/* Cupom no verde neon, e não no fechado do cartão de planos:
                      lá ele vive sobre preto, onde o neon queima; aqui ele é a
                      peça que precisa saltar. O texto acompanha e vira quase
                      preto -- branco sobre neon rende 1,66:1 de contraste, longe
                      do mínimo de leitura. */}
                  <span
                    className="inline-block rounded-[6px] px-2 py-[3px] text-[11px] font-bold tracking-wide whitespace-nowrap"
                    style={{ background: OFERTA.verde, color: OFERTA.sobreVerde }}
                  >
                    50% OFF - Oferta Exclusiva
                  </span>
                  <p
                    className="text-[12px] font-[500] mt-[6px] whitespace-nowrap"
                    style={{ color: OFERTA.textoSuave }}
                  >
                    Válida durante o seu teste grátis
                  </p>
                </div>

                {/* Filete no lugar de moldura: separa o recado do contador sem
                    desenhar mais uma caixa dentro de uma que já é. */}
                <span className="w-px h-9 shrink-0" style={{ background: "rgba(255,255,255,0.12)" }} />

                {/* Número grande com a unidade embaixo, e não "06 dias" corrido:
                    o olho pega o algarismo primeiro e confirma a unidade só se
                    precisar. `tabular-nums` trava a largura, senão o cartão
                    inteiro muda de tamanho a cada minuto que passa. */}
                <div className="flex items-center gap-2 shrink-0">
                  {[
                    { valor: restante.dias,    rotulo: "dias" },
                    { valor: restante.horas,   rotulo: "horas" },
                    { valor: restante.minutos, rotulo: "min" },
                  ].map((unidade, i) => (
                    <div key={unidade.rotulo} className="flex items-center gap-2">
                      {i > 0 && (
                        <span className="text-[16px] font-bold leading-none" style={{ color: "rgba(255,255,255,0.3)" }}>:</span>
                      )}
                      <div className="text-center" style={{ minWidth: 30 }}>
                        <p
                          className="text-[19px] font-bold leading-none tabular-nums"
                          style={{ color: OFERTA.texto }}
                        >
                          {dd(unidade.valor)}
                        </p>
                        <p
                          className="text-[8px] uppercase leading-none mt-[3px] tracking-[0.08em]"
                          style={{ color: "rgba(244,246,244,0.6)" }}
                        >
                          {unidade.rotulo}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Verde chapado com texto quase preto, igual ao "Começar 7 dias
                    grátis" da tela de planos: é o mesmo botão levando ao mesmo
                    lugar. */}
                <Button
                  size="sm"
                  className="h-8 text-xs font-semibold rounded-[7px] shrink-0"
                  style={{
                    background: OFERTA.verde,
                    color: OFERTA.sobreVerde,
                    animation: "banner-btn-attention 1.2s ease-in-out infinite",
                  }}
                  onClick={() => navigate("/setup")}
                >
                  {/* Texto próprio, e não o `rotuloBotao` das outras situações:
                      lá ele descreve uma obrigação ("Regularizar", "Escolher um
                      plano"), e aqui o clique é para aproveitar uma vantagem. */}
                  Garantir 50% OFF
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div
          className="fixed bottom-0 left-[67px] right-[15px] z-50 rounded-t-[7px] overflow-hidden flex items-center justify-center gap-6 px-6"
          style={{ height: BANNER_HEIGHT, background: corDaTarja }}
        >
          <p className="text-sm font-[500] text-white flex items-center gap-2">
            <TriangleAlert size={16} className="shrink-0" />
            {aviso}
          </p>
          <Button
            size="sm"
            className="h-8 text-xs font-semibold rounded-lg text-black shrink-0"
            style={{ background: "#ffffff", animation: "banner-btn-attention 1.2s ease-in-out infinite" }}
            onClick={() => navigate("/configuracoes/planos")}
          >
            {rotuloBotao}
          </Button>
        </div>
      )}

      {/* ── Upgrade dialog ──────────────────────────────────────────────── */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent
          className="rounded-2xl p-8"
          style={{ maxWidth: 920 }}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Encontre o plano que atende às suas necessidades!
            </DialogTitle>
          </DialogHeader>

          {/* Billing tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted w-fit mt-4 mb-6">
            {(["anual", "semestral", "mensal"] as BillingTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setBillingTab(tab)}
                className={cn(
                  "px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all",
                  billingTab === tab
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const save = getSave(plan);
              return (
                <div
                  key={plan.key}
                  className={cn(
                    "relative flex flex-col rounded-2xl border-2 p-6 transition-all",
                    plan.badge
                      ? "border-primary bg-primary/[0.03]"
                      : "border-border bg-background"
                  )}
                >
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
                      {plan.badge}
                    </span>
                  )}

                  <h3 className="text-base font-bold text-foreground">{plan.name}</h3>

                  <div className="mt-4 mb-1">
                    <span className="text-2xl font-bold text-foreground">
                      {getPrice(plan)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">/mês</span>
                  </div>

                  {save ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 w-fit mb-4">
                      <Zap size={10} className="text-emerald-600" />
                      economize {save}
                    </span>
                  ) : (
                    <div className="mb-4 h-5" />
                  )}

                  <ul className="space-y-2 flex-1 mb-6">
                    {plan.features.map((recurso) => (
                      <li key={chaveDoRecurso(recurso)} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check
                          size={13}
                          className={cn(
                            "mt-0.5 shrink-0",
                            plan.badge ? "text-primary" : "text-emerald-600"
                          )}
                        />
                        <TextoDoRecurso recurso={recurso} />
                      </li>
                    ))}
                  </ul>

                  <Button
                    type="button"
                    variant={plan.badge ? "default" : "outline"}
                    className="w-full h-10 rounded-lg text-sm font-semibold"
                    onClick={() => toast.info("Em breve: contratação de planos.")}
                  >
                    Atualizar plano
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Footer link */}
          <div className="flex justify-center pt-4">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
              onClick={() => setUpgradeOpen(false)}
            >
              Continuar usando apenas para consulta
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
