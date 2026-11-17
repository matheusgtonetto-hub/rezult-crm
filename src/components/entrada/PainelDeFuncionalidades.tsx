import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, BotMessageSquare, Filter, Network, Pause, Play } from "lucide-react";
import { useIdioma } from "@/context/IdiomaContext";
import type { Chave } from "@/i18n/dicionarios";
import { VENDA } from "@/lib/superficie-de-venda";
import { CrmWhatsAppIcon } from "@/components/icons/CrmWhatsAppIcon";
import {
  CenaAgentes, CenaAtendimento, CenaAutomacoes, CenaFunil,
} from "@/components/entrada/CenasDoPainel";
import "./painel-de-funcionalidades.css";

/**
 * O painel da direita do login e do cadastro: quatro destaques do produto, um
 * de cada vez, cada um com uma cena em movimento, uma tag, um título e uma
 * descrição.
 *
 * Só aparece a partir de 1024px (quem decide é o `LayoutDeEntrada`). No
 * celular a tela de entrada é só o formulário.
 *
 * ─── Quem faz o carrossel andar ─────────────────────────────────────────────
 *
 * Não há `setInterval`. A barra de progresso do destaque ativo é uma animação
 * CSS de `DURACAO_MS`, e é o FIM dela (`onAnimationEnd`) que passa para o
 * próximo. Dois relógios (um que desenha a barra e outro que troca o slide)
 * saem de fase na primeira aba em segundo plano ou na primeira pausa; um só,
 * que é também o que se vê, não tem como discordar de si mesmo.
 *
 * Disso saem, sem código a mais: pausar é pausar a barra, aba escondida não
 * avança, e movimento reduzido (onde a animação não roda) nunca avança sozinho.
 *
 * ─── Quando pausa ───────────────────────────────────────────────────────────
 *
 * Mouse em cima, foco de TECLADO dentro, ou o botão de pausa. O foco por clique
 * não conta: quem clica numa seta fica com ela focada, e contar isso deixaria o
 * painel parado para sempre depois que o mouse saísse. O mouse também só conta
 * quando é mouse: no iPad, um toque deixaria o "em cima" preso.
 *
 * O botão de pausa existe porque o carrossel anda sozinho por mais de 5
 * segundos ao lado de um formulário (WCAG 2.2.2). Em movimento reduzido ele
 * some, porque não há o que pausar.
 */

const DURACAO_MS = 7500;

/** Quanto o slide que sai continua montado. Bate com `--dur-normal` do CSS. */
const SAIDA_MS = 200;

interface Destaque {
  id: string;
  Icone: ComponentType<{ size?: string | number; strokeWidth?: string | number; className?: string }>;
  Cena: ComponentType;
  tag: Chave;
  titulo: Chave;
  descricao: Chave;
}

/* A ordem é a da navegação do produto: funil, atendimento, automações, agentes.
   Os ícones são os da barra lateral de verdade. */
const DESTAQUES: Destaque[] = [
  { id: "funil", Icone: Filter, Cena: CenaFunil, tag: "painel.funil.tag", titulo: "painel.funil.titulo", descricao: "painel.funil.descricao" },
  { id: "atendimento", Icone: CrmWhatsAppIcon, Cena: CenaAtendimento, tag: "painel.atendimento.tag", titulo: "painel.atendimento.titulo", descricao: "painel.atendimento.descricao" },
  { id: "automacoes", Icone: Network, Cena: CenaAutomacoes, tag: "painel.automacoes.tag", titulo: "painel.automacoes.titulo", descricao: "painel.automacoes.descricao" },
  { id: "agentes", Icone: BotMessageSquare, Cena: CenaAgentes, tag: "painel.agentes.tag", titulo: "painel.agentes.titulo", descricao: "painel.agentes.descricao" },
];

/* As cores da moldura saem de `VENDA`, a cópia única da paleta escura. O CSS as
   lê como `--pf-*` e não guarda hex da moldura. */
const VARIAVEIS = {
  "--pf-superficie": VENDA.superficie,
  "--pf-texto": VENDA.texto,
  "--pf-texto-suave": VENDA.textoSuave,
  "--pf-texto-fraco": VENDA.textoFraco,
  "--pf-verde": VENDA.verde,
  "--pf-anel": VENDA.bordaAtiva,
  "--pf-duracao": `${DURACAO_MS}ms`,
} as CSSProperties;

/** A preferência do sistema, e acompanha se ela mudar com a tela aberta. */
function usePrefereMenosMovimento(): boolean {
  const consulta = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  const [reduzir, setReduzir] = useState(() => consulta()?.matches ?? false);

  useEffect(() => {
    const mq = consulta();
    if (!mq) return;
    const aoMudar = () => setReduzir(mq.matches);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);

  return reduzir;
}

export function PainelDeFuncionalidades() {
  const { t } = useIdioma();
  const reduzirMovimento = usePrefereMenosMovimento();

  const [atual, setAtual] = useState(0);
  /** O slide que acabou de sair, só pelo tempo do fade. */
  const [saindo, setSaindo] = useState<number | null>(null);
  const [pausadoPeloUsuario, setPausadoPeloUsuario] = useState(false);
  const [mouseEmCima, setMouseEmCima] = useState(false);
  const [focoDeTeclado, setFocoDeTeclado] = useState(false);
  const temporizadorDaSaida = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(temporizadorDaSaida.current), []);

  const irPara = (destino: number) => {
    const total = DESTAQUES.length;
    const alvo = ((destino % total) + total) % total;
    if (alvo === atual) return;

    window.clearTimeout(temporizadorDaSaida.current);
    if (reduzirMovimento) {
      // Sem animação de saída, manter o slide velho montado o deixaria
      // visível POR CIMA do novo durante esse tempo.
      setSaindo(null);
    } else {
      setSaindo(atual);
      temporizadorDaSaida.current = window.setTimeout(() => setSaindo(null), SAIDA_MS);
    }
    setAtual(alvo);
  };

  const pausado = pausadoPeloUsuario || mouseEmCima || focoDeTeclado;

  return (
    <section
      className="pf"
      style={VARIAVEIS}
      aria-label={t("painel.rotulo")}
      data-pausado={pausado}
      onPointerEnter={e => { if (e.pointerType === "mouse") setMouseEmCima(true); }}
      onPointerLeave={() => setMouseEmCima(false)}
      onFocus={e => {
        // `:focus-visible` separa o foco do teclado do foco deixado por um
        // clique. Navegador antigo que não conhece o seletor levanta exceção;
        // nele, pausar por qualquer foco é o lado seguro.
        let doTeclado = true;
        try { doTeclado = e.target.matches(":focus-visible"); } catch { /* mantém true */ }
        if (doTeclado) setFocoDeTeclado(true);
      }}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocoDeTeclado(false);
      }}
    >
      <div className="pf-progresso">
        {DESTAQUES.map((d, i) => (
          <button
            key={d.id}
            type="button"
            className="pf-seg"
            aria-label={`${t("painel.irPara")} ${i + 1}`}
            aria-current={i === atual ? "true" : undefined}
            onClick={() => irPara(i)}
          >
            <span className="pf-seg-trilho">
              <span
                className="pf-seg-enchimento"
                data-estado={i < atual ? "cheio" : i === atual ? "ativo" : "vazio"}
                onAnimationEnd={i === atual ? () => irPara(atual + 1) : undefined}
              />
            </span>
          </button>
        ))}
      </div>

      {/* "off" enquanto anda sozinho: anunciar a cada 7 segundos atropelaria a
          leitura do formulário. Parado, a troca é uma escolha de quem usa e
          passa a ser anunciada. */}
      <div className="pf-corpo" aria-live={pausado ? "polite" : "off"}>
        {DESTAQUES.map((d, i) => {
          const ativo = i === atual;
          if (!ativo && i !== saindo) return null;
          const { Icone, Cena } = d;
          return (
            <div
              key={d.id}
              className="pf-slide"
              data-estado={ativo ? "entrando" : "saindo"}
              role="group"
              aria-label={`${i + 1} / ${DESTAQUES.length}`}
              aria-hidden={ativo ? undefined : true}
            >
              {/* A cena ocupa o slide inteiro, de borda a borda; o texto fica por
                  cima, na parte de baixo, sobre o escurecimento. */}
              <div className="pf-cena" aria-hidden="true"><Cena /></div>

              <div className="pf-texto">
                <p className="pf-tag">
                  <Icone size={14} strokeWidth={1.75} />
                  {t(d.tag)}
                </p>
                <h2 className="pf-titulo">{t(d.titulo)}</h2>
                <p className="pf-descricao">{t(d.descricao)}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pf-controles">
        {!reduzirMovimento && (
          <button
            type="button"
            className="pf-botao"
            onClick={() => setPausadoPeloUsuario(p => !p)}
            aria-label={pausadoPeloUsuario ? t("painel.retomar") : t("painel.pausar")}
          >
            {pausadoPeloUsuario ? <Play size={18} strokeWidth={1.75} /> : <Pause size={18} strokeWidth={1.75} />}
          </button>
        )}
        <button type="button" className="pf-botao" onClick={() => irPara(atual - 1)} aria-label={t("painel.anterior")}>
          <ArrowLeft size={20} strokeWidth={1.75} />
        </button>
        <button type="button" className="pf-botao" onClick={() => irPara(atual + 1)} aria-label={t("painel.proximo")}>
          <ArrowRight size={20} strokeWidth={1.75} />
        </button>
      </div>
    </section>
  );
}
