import { useEffect, useState } from "react";
import {
  House, ChartColumnDecreasing, Filter, ContactRound, Zap, Workflow, BotMessageSquare,
  CalendarDays, GraduationCap, Bell, Cog,
  Search, ChevronDown, SlidersHorizontal, X, Plus, MoreHorizontal, GripVertical,
  CalendarClock, Tag,
} from "lucide-react";
import { CrmWhatsAppIcon } from "@/components/icons/CrmWhatsAppIcon";

/**
 * O CRM desfocado ao fundo da tela de cadastro da empresa.
 *
 * Existe para uma coisa só: quem acabou de confirmar o e-mail vê o produto
 * atrás do formulário e entende que falta pouco. Um fundo chapado não conta
 * nada; este conta que o lugar já está montado, com funil cheio, esperando os
 * dados.
 *
 * É uma RÉPLICA ESTÁTICA do board de pipeline, não a `PipelinePage` de verdade,
 * e a razão é o momento do fluxo: aqui a empresa ainda não existe. A página real
 * lê `useCRM()` para montar colunas e cards, a barra lateral consulta conexões e
 * notificações, e tudo isso rodaria contra uma empresa nula. O board também é
 * arrastável e clicável, o que atrás de um formulário só atrapalha.
 *
 * O board foi escolhido em vez da tela de Início por causa da forma: Início tem
 * `max-w-7xl mx-auto`, então os painéis param a 1280px no centro e sobra fundo
 * liso nas laterais, o que lê como tela cortada. O board é uma fileira de
 * colunas de 280px sem teto de largura -- ele preenche de ponta a ponta, e uma
 * coluna cortada na direita lê como "tem mais board ali", que é o certo.
 *
 * Nomes, valores e datas são FICTÍCIOS de propósito. A referência veio de um
 * print do funil real, mas isto aqui é fundo fixo da tela de cadastro: com os
 * nomes de verdade, cada pessoa que criasse uma conta veria os clientes de
 * outra. A estrutura é a mesma, as pessoas não.
 *
 * O preço da réplica é conhecido: quando o board mudar, esta não muda junto. É
 * aceitável porque o que aparece está desfocado e coberto por um véu -- o que
 * se lê são blocos, cor e ritmo, não o texto.
 *
 * Decorativo do começo ao fim: `aria-hidden` para o leitor de tela pular, e
 * `pointer-events-none` para nenhum clique parar aqui em vez de no formulário.
 */

interface CardFicticio {
  nome: string;
  numero: number;
  valor: number;
  data: string;
  tags?: { texto: string; cor: string }[];
}

interface ColunaFicticia {
  titulo: string;
  cor: string;
  cards: CardFicticio[];
}

const VERDE = "#128A68";
const AZUL = "#3B82F6";
const PRETO = "#111111";
const ROXO = "#6D28D9";

const COLUNAS: ColunaFicticia[] = [
  {
    titulo: "Novos Leads", cor: "#128A68",
    cards: [
      { nome: "Beatriz Almeida", numero: 1412, valor: 0,    data: "18/08/2026", tags: [{ texto: "Meta ads", cor: AZUL }] },
      { nome: "Rafael Moura",    numero: 1409, valor: 0,    data: "18/08/2026" },
      { nome: "Camila Nunes",    numero: 1404, valor: 0,    data: "17/08/2026", tags: [{ texto: "Indicação", cor: ROXO }] },
      { nome: "Diego Prado",     numero: 1398, valor: 0,    data: "17/08/2026", tags: [{ texto: "Meta ads", cor: AZUL }] },
      { nome: "Letícia Barros",  numero: 1395, valor: 0,    data: "16/08/2026" },
    ],
  },
  {
    titulo: "Prospecção", cor: "#3B82F6",
    cards: [
      { nome: "Larissa Campos",  numero: 1391, valor: 1200, data: "16/08/2026", tags: [{ texto: "Demonstração", cor: VERDE }] },
      { nome: "Tiago Ferreira",  numero: 1387, valor: 890,  data: "15/08/2026", tags: [{ texto: "Meta ads", cor: AZUL }] },
      { nome: "Helena Braga",    numero: 1382, valor: 0,    data: "15/08/2026" },
      { nome: "Otávio Lima",     numero: 1379, valor: 640,  data: "14/08/2026", tags: [{ texto: "Meta ads", cor: AZUL }] },
      { nome: "Sabrina Rocha",   numero: 1375, valor: 0,    data: "14/08/2026" },
    ],
  },
  {
    titulo: "Conexão", cor: "#EAB308",
    cards: [
      { nome: "Bruno Tavares",   numero: 1371, valor: 2400, data: "13/08/2026", tags: [{ texto: "Cal.com", cor: PRETO }, { texto: "Demonstração", cor: VERDE }] },
      { nome: "Marcela Dias",    numero: 1366, valor: 1150, data: "13/08/2026", tags: [{ texto: "Meta ads", cor: AZUL }] },
      { nome: "Fernando Aguiar", numero: 1362, valor: 0,    data: "12/08/2026" },
      { nome: "Priscila Matos",  numero: 1358, valor: 780,  data: "12/08/2026", tags: [{ texto: "Indicação", cor: ROXO }] },
      { nome: "Anderson Reis",   numero: 1354, valor: 0,    data: "11/08/2026" },
    ],
  },
  {
    titulo: "Qualificado", cor: "#F97316",
    cards: [
      { nome: "Patrícia Rangel", numero: 1349, valor: 3200, data: "11/08/2026", tags: [{ texto: "Demonstração", cor: VERDE }] },
      { nome: "Vinícius Sá",     numero: 1344, valor: 1870, data: "10/08/2026", tags: [{ texto: "Meta ads", cor: AZUL }] },
      { nome: "Renata Coelho",   numero: 1340, valor: 2450, data: "10/08/2026", tags: [{ texto: "Cal.com", cor: PRETO }] },
      { nome: "Murilo Fontes",   numero: 1336, valor: 990,  data: "09/08/2026" },
      { nome: "Elaine Duarte",   numero: 1331, valor: 1420, data: "09/08/2026", tags: [{ texto: "Indicação", cor: ROXO }] },
    ],
  },
  {
    titulo: "Reunião Marcada", cor: "#E24B4A",
    cards: [
      { nome: "Gustavo Peixoto", numero: 1327, valor: 4800, data: "08/08/2026", tags: [{ texto: "Cal.com", cor: PRETO }, { texto: "Demonstração", cor: VERDE }] },
      { nome: "Sofia Andrade",   numero: 1322, valor: 2650, data: "08/08/2026", tags: [{ texto: "Demonstração", cor: VERDE }] },
      { nome: "Leandro Vidal",   numero: 1318, valor: 3400, data: "07/08/2026", tags: [{ texto: "Meta ads", cor: AZUL }] },
      { nome: "Juliana Pires",   numero: 1313, valor: 1980, data: "07/08/2026" },
      { nome: "Ricardo Serpa",   numero: 1309, valor: 5200, data: "06/08/2026", tags: [{ texto: "Indicação", cor: ROXO }] },
    ],
  },
  {
    titulo: "Proposta Enviada", cor: "#8B5CF6",
    cards: [
      { nome: "Adriana Bastos",  numero: 1304, valor: 7400, data: "06/08/2026", tags: [{ texto: "Demonstração", cor: VERDE }] },
      { nome: "Henrique Vasques", numero: 1299, valor: 3900, data: "05/08/2026", tags: [{ texto: "Cal.com", cor: PRETO }] },
      { nome: "Tatiane Moreno",  numero: 1294, valor: 6100, data: "05/08/2026" },
      { nome: "Everton Salles",  numero: 1290, valor: 2750, data: "04/08/2026", tags: [{ texto: "Meta ads", cor: AZUL }] },
      { nome: "Bianca Toledo",   numero: 1285, valor: 4350, data: "04/08/2026", tags: [{ texto: "Indicação", cor: ROXO }] },
    ],
  },
];

/** Quem aparece como responsável nos cards. Fictício, como o resto. */
const RESPONSAVEL = "Ana Ribeiro";

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const iniciais = (nome: string) =>
  nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();

/** Ícones da barra, na ordem da navegação real. Pipelines é o item aceso. */
const NAV = [House, ChartColumnDecreasing, Filter, ContactRound, CrmWhatsAppIcon, Zap, Workflow, BotMessageSquare];
const RODAPE = [CalendarDays, GraduationCap, Bell, Cog];

/** Índice de Pipelines na lista acima, que é a tela aberta no fundo. */
const ITEM_ACESO = 2;

/**
 * Tamanho lógico do desenho, em pixels.
 *
 * O board é montado SEMPRE nessas medidas e depois escalado para cobrir a
 * janela. Sem isso o layout dependeria da largura real: numa janela estreita
 * apareceriam duas colunas e meia e a tela leria como recorte ampliado, numa
 * larga apareceriam sete e sobraria vazio embaixo. Fixando o tamanho, a
 * composição é a mesma em qualquer monitor -- muda só o quanto ela é reduzida.
 *
 * 1680 × 1050 é uma tela de trabalho comum, e é o que faz caber cinco colunas e
 * meia. A sexta cortada na direita é intencional: board é coisa que continua.
 */
const LARGURA = 1680;
const ALTURA = 1050;

/**
 * 2% a mais do que o necessário para cobrir.
 *
 * O `blur` desbota os últimos pixels de cada borda, porque ali ele mistura o
 * conteúdo com o nada que existe fora da caixa. A sobra joga essa faixa
 * desbotada para fora da janela. É o mesmo problema que o `scale(1.04)` de
 * antes resolvia -- a diferença é que agora a âncora é o canto superior
 * esquerdo, então o que sai da tela é só a direita e o rodapé do board, e não
 * uma fatia de cada lado.
 */
const SOBRA = 1.02;

function escalaParaCobrir() {
  return Math.max(window.innerWidth / LARGURA, window.innerHeight / ALTURA) * SOBRA;
}

function Cartao({ card, cor }: { card: CardFicticio; cor: string }) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-3 shadow-elev-1">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
          style={{ width: 32, height: 32, background: cor, fontSize: 12 }}
        >
          {iniciais(card.nome)}
        </span>
        <p className="text-sm font-medium text-foreground leading-tight truncate min-w-0 flex-1">
          {card.nome}
        </p>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">#{card.numero}</span>
      </div>

      <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
        <span
          className="rounded-full flex items-center justify-center text-white shrink-0"
          style={{ width: 16, height: 16, background: "#7C8B99", fontSize: 7, fontWeight: 700 }}
        >
          {iniciais(RESPONSAVEL)[0]}
        </span>
        <span className="truncate">{RESPONSAVEL}</span>
      </div>

      <p className="font-semibold mt-1.5" style={{ fontSize: 15, color: VERDE }}>
        {dinheiro(card.valor)}
      </p>

      <div className="flex items-center justify-between mt-1">
        <span className="flex items-center gap-1" style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          <CalendarClock size={11} />
          {card.data}
        </span>
        <span
          className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: 22, height: 22, background: "#29A71A" }}
        >
          <CrmWhatsAppIcon size={13} className="text-white" />
        </span>
      </div>

      <div className="flex items-center mt-3 pt-2 border-t border-card-border gap-1">
        {(card.tags ?? []).map(t => (
          <span
            key={t.texto}
            className="text-[10px] px-1.5 rounded-full text-white font-medium whitespace-nowrap"
            style={{ background: t.cor }}
          >
            {t.texto}
          </span>
        ))}
        <Tag size={13} className="text-muted-foreground ml-auto shrink-0" />
      </div>
    </div>
  );
}

function BoardDesenhado() {
  const totalDeNegocios = COLUNAS.reduce((s, c) => s + c.cards.length, 0);

  // Calculada já na primeira renderização, e não num efeito depois: começar em
  // 1 e corrigir no efeito faria o board piscar grande antes de assentar.
  const [escala, setEscala] = useState(escalaParaCobrir);

  useEffect(() => {
    const medir = () => setEscala(escalaParaCobrir());
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  return (
    // Caixa de tamanho fixo, escalada para cobrir a janela.
    // `transformOrigin` no canto superior esquerdo prende a barra lateral e o
    // cabeçalho: o que sobra da escala transborda pela direita e por baixo,
    // onde o board continuar é o esperado. Centralizar cortaria uma fatia de
    // cada lado, que foi o problema da versão anterior.
      <div
        className="absolute flex"
        style={{
          // -8px nos dois: joga para fora da janela a faixa desbotada que o
          // `blur` deixa na borda de cima e na da esquerda, que é onde o verde
          // da barra lateral encontra o nada e mostra uma linha clara. Custa
          // oito pixels de barra, que ninguém enxerga.
          top: -8,
          left: -8,
          width: LARGURA,
          height: ALTURA,
          transform: `scale(${escala})`,
          transformOrigin: "top left",
          filter: "blur(3px)",
        }}
      >
        {/* ── Barra lateral ───────────────────────────────────────────── */}
        <div
          className="flex flex-col items-center shrink-0"
          style={{ width: 52, background: "hsl(var(--primary))", paddingTop: 12, paddingBottom: 12 }}
        >
          <img
            src="/favicon.png?v=3"
            alt=""
            style={{ width: 35, height: 35, borderRadius: 8, marginBottom: 8, objectFit: "cover" }}
          />
          <div
            className="flex items-center justify-center text-white text-[11px] font-bold"
            style={{
              width: 32, height: 32, borderRadius: 8, marginBottom: 16,
              background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.3)",
            }}
          >
            R
          </div>
          <div style={{ width: 28, height: 1, background: "rgba(255,255,255,0.15)", marginBottom: 8 }} />

          <nav className="flex flex-col items-center" style={{ gap: 4, flex: 1 }}>
            {NAV.map((Icone, i) => (
              <span
                key={i}
                className="flex items-center justify-center"
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: i === ITEM_ACESO ? "rgba(255,255,255,0.15)" : "transparent",
                  color: i === ITEM_ACESO ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                }}
              >
                <Icone size={18} strokeWidth={1.75} />
              </span>
            ))}
          </nav>

          <div style={{ width: 32, height: 1, background: "rgba(255,255,255,0.15)", margin: "8px 0" }} />
          <div className="flex flex-col items-center" style={{ gap: 4 }}>
            {RODAPE.map((Icone, i) => (
              <span
                key={i}
                className="flex items-center justify-center"
                style={{ width: 36, height: 36, color: "rgba(255,255,255,0.5)" }}
              >
                <Icone size={18} strokeWidth={1.75} />
              </span>
            ))}
            <span
              className="flex items-center justify-center text-[10px] font-bold"
              style={{
                width: 28, height: 28, borderRadius: 999, marginTop: 4,
                background: "#FFFFFF", color: "hsl(var(--primary))",
              }}
            >
              R
            </span>
          </div>
        </div>

        {/* ── Board de pipeline ───────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ background: "hsl(var(--background))" }}>

          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 shrink-0">
            <div className="min-w-0">
              <h1 className="text-[24px] font-semibold text-foreground leading-tight">Pipeline Comercial</h1>
              <p className="text-[13px] text-muted-foreground mt-0.5">Venda · {totalDeNegocios} negócios</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[13px] text-muted-foreground">Visualizando como:</span>
              <span className="flex items-center gap-2 rounded-md border border-card-border bg-card px-3 py-1.5 text-[13px] text-foreground">
                Todos os leads <ChevronDown size={14} className="text-muted-foreground" />
              </span>
              <span className="flex items-center gap-2 rounded-md border border-primary bg-card px-3 py-1.5 text-[13px] font-medium text-primary">
                <Workflow size={15} /> Automação
              </span>
              <span className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-white">
                <Plus size={15} /> Novo Lead
              </span>
              <span className="flex items-center justify-center rounded-md border border-card-border bg-card text-muted-foreground" style={{ width: 32, height: 32 }}>
                <MoreHorizontal size={16} />
              </span>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-3 px-6 pb-3 shrink-0">
            <span className="flex items-center gap-2 rounded-md border border-card-border bg-card px-3 py-1.5 text-[13px] text-muted-foreground" style={{ width: 340 }}>
              <Search size={14} /> Pesquisar por nome, empresa, telefone
            </span>
            <span className="text-[13px] text-muted-foreground">Ordenação</span>
            <span className="flex items-center gap-2 rounded-md border border-card-border bg-card px-3 py-1.5 text-[13px] text-foreground">
              Mais recentes <ChevronDown size={14} className="text-muted-foreground" />
            </span>
            <span className="text-[13px] text-muted-foreground">Status</span>
            <span className="flex items-center gap-2 rounded-md border border-card-border bg-card px-3 py-1.5 text-[13px] text-foreground">
              Em aberto <ChevronDown size={14} className="text-muted-foreground" />
            </span>
            <span className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground/50">
              <X size={14} /> Limpar
            </span>
            <span className="flex items-center gap-2 rounded-md border border-card-border bg-card px-3 py-1.5 text-[13px] text-foreground">
              <SlidersHorizontal size={14} /> Filtros
            </span>
          </div>

          {/* Colunas.
              `flex-1 min-h-0` com cada coluna em `h-full`: é isso que faz o
              board encostar na borda de baixo da janela. Sem o `min-h-0` o
              flex não deixa a fileira encolher, e sobraria uma faixa de fundo
              liso embaixo -- justamente o que fazia a tela parecer cortada. */}
          <div className="flex gap-3 flex-1 min-h-0 px-4 pb-4 pt-[7px]">
            {COLUNAS.map(col => {
              const total = col.cards.reduce((s, c) => s + c.valor, 0);
              return (
                <div
                  key={col.titulo}
                  className="min-w-[280px] w-[280px] h-full flex flex-col rounded-xl border border-card-border bg-card shadow-elev-1 overflow-hidden"
                >
                  <div className="h-1 w-full shrink-0" style={{ background: col.cor }} />

                  <div className="flex items-start justify-between px-3 py-3 shrink-0">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="mt-[3px] shrink-0 rounded-full" style={{ width: 13, height: 13, background: col.cor }} />
                      <div className="min-w-0">
                        <h3 className="truncate" style={{ fontSize: 14, fontWeight: 600, color: "#111111" }}>
                          {col.titulo}
                        </h3>
                        <p className="mt-0.5 whitespace-nowrap" style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                          {dinheiro(total)} · {col.cards.length} negócios
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 text-muted-foreground">
                      <MoreHorizontal size={16} />
                      <GripVertical size={15} />
                    </div>
                  </div>

                  <div className="flex-1 px-2 pb-2 space-y-2 min-h-0">
                    {col.cards.map(card => (
                      <Cartao key={card.numero} card={card} cor={col.cor} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
  );
}

/**
 * O print da tela real, em `public/fundo-crm.png`.
 *
 * A alternativa ao desenho: em vez de reconstruir o board em JSX, usar uma foto
 * do produto rodando. Ganha em fidelidade, porque é literalmente o Rezult, e
 * perde em duas coisas -- a imagem envelhece sozinha quando a interface mudar, e
 * são 135 kB que toda pessoa baixa para ver uma tela de cadastro.
 *
 * Duas coisas foram feitas no arquivo antes de ele entrar aqui. Os 67px de baixo
 * saíram, porque traziam a etiqueta "Captura de Tela" da barra de captura do
 * macOS, que desfocada viraria uma mancha escura no rodapé sem explicação. E a
 * largura caiu de 2934px para 1600px: com 3px de desfoque por cima, resolução
 * acima disso não chega a aparecer e só pesaria mais (814 kB contra 135 kB).
 *
 * `-8px` nas bordas com 16px a mais de tamanho: mesma razão do desenho, tirar da
 * janela a faixa que o desfoque desbota na beirada.
 */
function PrintDaTela() {
  return (
    <img
      src="/fundo-crm.png"
      alt=""
      style={{
        position: "absolute",
        top: -8,
        left: -8,
        width: "calc(100% + 16px)",
        height: "calc(100% + 16px)",
        objectFit: "cover",
        // Canto superior esquerdo, e não o centro: é onde estão a barra lateral
        // e o cabeçalho, as duas partes que identificam a tela. Cortar por ali
        // seria cortar justamente o que faz o fundo ser reconhecível.
        objectPosition: "left top",
        filter: "blur(3px)",
      }}
    />
  );
}

/**
 * Qual dos dois fundos está no ar.
 *
 * Está aqui, numa constante, porque os dois estão em avaliação: trocar uma
 * palavra troca a tela inteira, sem mexer em mais nada. Quando a escolha estiver
 * feita, o caminho é apagar o perdedor junto com a constante -- deixar os dois
 * para sempre é manter metade do arquivo como código morto.
 */
const FUNDO: "print" | "desenho" = "print";

/**
 * O véu entre o fundo e o formulário.
 *
 * O desfoque sozinho não basta: o formulário é branco sobre um fundo claro, e
 * sem o véu as bordas das colunas de trás encostam nas do cartão e a leitura
 * fica suja. O véu afasta os dois planos.
 *
 * São duas constantes, e é nelas que se mexe para calibrar:
 *
 *   VEU_COR    "var(--background)" clareia, e acompanha o tema
 *              "0 0% 0%" escurece
 *   VEU_FORCA  0 deixa o fundo cru, 1 cobre por completo
 *
 * Com o claro, subir a força desbota mais; com o preto, subir escurece. É por
 * isso que a cor mora aqui em cima junto com a força: quem for ajustar precisa
 * ver as duas na mesma linha, senão gira o número para o lado errado.
 *
 * O claro sai do token do fundo, e não de um branco fixo, porque no tema escuro
 * um branco literal clarearia a tela justamente onde ela deveria escurecer.
 */
const VEU_COR = "var(--background)";
const VEU_FORCA = 0.62;

export function FundoDoCrm() {
  return (
    // `fixed`, e não `absolute`: a tela de cadastro rola quando a janela é
    // baixa, e um fundo absoluto rolaria junto, descolando do topo. Preso ao
    // viewport ele fica parado atrás do formulário, que é o que se espera de um
    // fundo. `pointer-events-none` porque isto cobre a tela inteira -- sem ele,
    // todo clique pararia aqui em vez de chegar ao formulário.
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {FUNDO === "print" ? <PrintDaTela /> : <BoardDesenhado />}

      <div className="absolute inset-0" style={{ background: `hsl(${VEU_COR} / ${VEU_FORCA})` }} />
    </div>
  );
}
