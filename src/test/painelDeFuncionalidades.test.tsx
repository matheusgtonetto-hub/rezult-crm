import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IdiomaProvider } from "@/context/IdiomaContext";
import { DICIONARIOS, IDIOMAS } from "@/i18n/dicionarios";
import { PainelDeFuncionalidades } from "@/components/entrada/PainelDeFuncionalidades";
import { LayoutDeEntrada } from "@/components/entrada/LayoutDeEntrada";

/*
 * O painel anda sozinho, pausa, faz fade na saída e respeita movimento
 * reduzido. Nada disso aparece num teste de tipos, e o jsdom não desenha, então
 * o que se confere aqui é o COMPORTAMENTO: qual destaque está de pé, quem
 * pausa, o que fica montado e por quanto tempo.
 *
 * O que NÃO se confere aqui, e só o navegador mostra: se a cena cabe no palco e
 * se a coreografia parece boa.
 */

// O jsdom 20 não tem PointerEvent, e o painel lê `pointerType` para separar
// mouse de toque. Sem isto o evento sairia sem o campo e o teste mentiria.
class PointerEventDeTeste extends MouseEvent {
  pointerType: string;
  constructor(tipo: string, init: PointerEventInit = {}) {
    super(tipo, init);
    this.pointerType = init.pointerType ?? "";
  }
}

beforeAll(() => {
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventDeTeste;
});

beforeEach(() => {
  localStorage.setItem("rz_idioma", "pt");
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const TITULOS_PT = [
  "Todos os negócios num só funil",
  "Seu time inteiro no mesmo WhatsApp",
  "O follow-up acontece sozinho",
  "Você briefa, o agente trabalha",
];

// Montada pelos códigos numéricos, e não escrita com o caractere, para este
// arquivo não conter justamente o que a regra proíbe: uma busca por travessões
// no repositório acusaria o teste que garante que eles não existem.
const TRAVESSOES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

function renderizarPainel() {
  return render(
    <IdiomaProvider>
      <PainelDeFuncionalidades />
    </IdiomaProvider>,
  );
}

const painel = (c: HTMLElement) => c.querySelector<HTMLElement>("section.pf")!;
const fillAtivo = (c: HTMLElement) => c.querySelector<HTMLElement>('.pf-seg-enchimento[data-estado="ativo"]')!;
const estados = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLElement>(".pf-seg-enchimento")).map(e => e.dataset.estado);
const titulosVisiveis = () =>
  screen.queryAllByRole("heading", { level: 2 }).map(h => h.textContent);

describe("PainelDeFuncionalidades: navegação", () => {
  it("abre no primeiro destaque, com quatro segmentos e só o primeiro ativo", () => {
    const { container } = renderizarPainel();

    expect(titulosVisiveis()).toEqual([TITULOS_PT[0]]);
    expect(screen.getAllByRole("button", { name: /Ir para o destaque/ })).toHaveLength(4);
    expect(estados(container)).toEqual(["ativo", "vazio", "vazio", "vazio"]);
  });

  it("o fim da animação da barra passa para o próximo destaque", () => {
    const { container } = renderizarPainel();

    fireEvent.animationEnd(fillAtivo(container));

    expect(titulosVisiveis()).toEqual([TITULOS_PT[1]]);
    // o anterior fica cheio, o novo começa a encher
    expect(estados(container)).toEqual(["cheio", "ativo", "vazio", "vazio"]);
  });

  it("depois do último volta ao primeiro, com a barra zerada", () => {
    const { container } = renderizarPainel();

    // Passo a passo, e não só o ponto de chegada: terminar no primeiro título
    // também é o que acontece quando o painel nunca sai dele.
    for (let passo = 1; passo <= 3; passo++) {
      fireEvent.animationEnd(fillAtivo(container));
      expect(titulosVisiveis()).toEqual([TITULOS_PT[passo]]);
    }
    expect(estados(container)).toEqual(["cheio", "cheio", "cheio", "ativo"]);

    fireEvent.animationEnd(fillAtivo(container));

    expect(titulosVisiveis()).toEqual([TITULOS_PT[0]]);
    expect(estados(container)).toEqual(["ativo", "vazio", "vazio", "vazio"]);
  });

  it("a seta anterior do primeiro destaque vai para o último", () => {
    renderizarPainel();

    fireEvent.click(screen.getByRole("button", { name: "Destaque anterior" }));

    expect(titulosVisiveis()).toEqual([TITULOS_PT[3]]);
  });

  it("clicar num segmento pula direto para aquele destaque", () => {
    const { container } = renderizarPainel();

    fireEvent.click(screen.getByRole("button", { name: "Ir para o destaque 3" }));

    expect(titulosVisiveis()).toEqual([TITULOS_PT[2]]);
    // os dois antes dele ficam cheios, e o de depois vazio
    expect(estados(container)).toEqual(["cheio", "cheio", "ativo", "vazio"]);
  });

  it("clicar no destaque que já está aberto não reinicia nada", () => {
    const { container } = renderizarPainel();
    const antes = fillAtivo(container);

    fireEvent.click(screen.getByRole("button", { name: "Ir para o destaque 1" }));

    expect(fillAtivo(container)).toBe(antes);
    expect(titulosVisiveis()).toEqual([TITULOS_PT[0]]);
  });

  it("só o fim da barra ATIVA avança: o evento de outro segmento é ignorado", () => {
    const { container } = renderizarPainel();
    const vazio = container.querySelectorAll<HTMLElement>(".pf-seg-enchimento")[2];

    fireEvent.animationEnd(vazio);

    expect(titulosVisiveis()).toEqual([TITULOS_PT[0]]);
  });
});

describe("PainelDeFuncionalidades: saída com fade", () => {
  it("o slide que sai fica montado e escondido só pelo tempo do fade", () => {
    vi.useFakeTimers();
    renderizarPainel();

    fireEvent.click(screen.getByRole("button", { name: "Próximo destaque" }));

    // Durante o fade existem os dois, e o que sai é invisível para leitor de
    // tela: senão a pessoa ouviria dois títulos de uma vez.
    const grupos = document.querySelectorAll(".pf-slide");
    expect(grupos).toHaveLength(2);
    expect(Array.from(grupos).map(g => g.getAttribute("data-estado"))).toEqual(["saindo", "entrando"]);
    expect(grupos[0].getAttribute("aria-hidden")).toBe("true");
    expect(titulosVisiveis()).toEqual([TITULOS_PT[1]]);

    act(() => { vi.advanceTimersByTime(200); });

    expect(document.querySelectorAll(".pf-slide")).toHaveLength(1);
    expect(titulosVisiveis()).toEqual([TITULOS_PT[1]]);
  });
});

describe("PainelDeFuncionalidades: pausa", () => {
  it("o botão de pausa pausa e retoma, e o rótulo acompanha", () => {
    const { container } = renderizarPainel();
    expect(painel(container).dataset.pausado).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Pausar a apresentação" }));
    expect(painel(container).dataset.pausado).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Retomar a apresentação" }));
    expect(painel(container).dataset.pausado).toBe("false");
  });

  it("mouse em cima pausa, e sair retoma", () => {
    const { container } = renderizarPainel();

    fireEvent.pointerEnter(painel(container), { pointerType: "mouse" });
    expect(painel(container).dataset.pausado).toBe("true");

    fireEvent.pointerLeave(painel(container), { pointerType: "mouse" });
    expect(painel(container).dataset.pausado).toBe("false");
  });

  it("toque NÃO pausa: no iPad o 'em cima' ficaria preso depois do toque", () => {
    const { container } = renderizarPainel();

    fireEvent.pointerEnter(painel(container), { pointerType: "touch" });

    expect(painel(container).dataset.pausado).toBe("false");
  });

  describe("por foco", () => {
    // O painel pergunta ao navegador `:focus-visible` para separar o foco do
    // TECLADO do foco deixado por um CLIQUE. Cada navegador responde de um
    // jeito (e o jsdom responde `false` para um elemento que não foi focado de
    // verdade), então as três respostas possíveis são fixadas aqui, e cada uma
    // exercita um ramo do componente.
    const matchesOriginal = Element.prototype.matches;

    afterEach(() => {
      Element.prototype.matches = matchesOriginal;
    });

    function navegadorResponde(resposta: "teclado" | "clique" | "sem-suporte") {
      Element.prototype.matches = function (this: Element, seletor: string) {
        if (seletor === ":focus-visible") {
          if (resposta === "sem-suporte") throw new SyntaxError("seletor desconhecido");
          return resposta === "teclado";
        }
        return matchesOriginal.call(this, seletor);
      };
    }

    it("foco de TECLADO dentro pausa, e o foco sair do painel retoma", () => {
      navegadorResponde("teclado");
      const { container } = renderizarPainel();
      const proximo = screen.getByRole("button", { name: "Próximo destaque" });

      fireEvent.focus(proximo);
      expect(painel(container).dataset.pausado).toBe("true");

      fireEvent.blur(proximo, { relatedTarget: document.body });
      expect(painel(container).dataset.pausado).toBe("false");
    });

    it("foco deixado por um CLIQUE não pausa: senão, depois de clicar numa seta, o painel ficaria parado para sempre", () => {
      navegadorResponde("clique");
      const { container } = renderizarPainel();

      fireEvent.focus(screen.getByRole("button", { name: "Próximo destaque" }));

      expect(painel(container).dataset.pausado).toBe("false");
    });

    it("navegador que não conhece `:focus-visible` cai no lado seguro e pausa", () => {
      navegadorResponde("sem-suporte");
      const { container } = renderizarPainel();

      fireEvent.focus(screen.getByRole("button", { name: "Próximo destaque" }));

      expect(painel(container).dataset.pausado).toBe("true");
    });

    it("o foco passar de um botão para outro DENTRO do painel não retoma", () => {
      navegadorResponde("teclado");
      const { container } = renderizarPainel();
      const anterior = screen.getByRole("button", { name: "Destaque anterior" });
      const proximo = screen.getByRole("button", { name: "Próximo destaque" });

      fireEvent.focus(anterior);
      fireEvent.blur(anterior, { relatedTarget: proximo });

      expect(painel(container).dataset.pausado).toBe("true");
    });
  });

  it("parado, a troca de destaque é anunciada; andando sozinho, não", () => {
    const { container } = renderizarPainel();
    const corpo = container.querySelector(".pf-corpo")!;
    expect(corpo.getAttribute("aria-live")).toBe("off");

    fireEvent.click(screen.getByRole("button", { name: "Pausar a apresentação" }));
    expect(corpo.getAttribute("aria-live")).toBe("polite");
  });

  it("pausar não impede de navegar pelas setas", () => {
    renderizarPainel();
    fireEvent.click(screen.getByRole("button", { name: "Pausar a apresentação" }));

    fireEvent.click(screen.getByRole("button", { name: "Próximo destaque" }));

    expect(titulosVisiveis()).toEqual([TITULOS_PT[1]]);
  });
});

describe("PainelDeFuncionalidades: movimento reduzido", () => {
  const original = window.matchMedia;

  beforeEach(() => {
    window.matchMedia = ((consulta: string) => ({
      matches: consulta.includes("prefers-reduced-motion"),
      media: consulta,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = original;
  });

  it("some o botão de pausa, porque não há o que pausar", () => {
    renderizarPainel();

    expect(screen.queryByRole("button", { name: /Pausar|Retomar/ })).toBeNull();
    // as setas continuam: é como se navega quando nada anda sozinho
    expect(screen.getByRole("button", { name: "Próximo destaque" })).toBeInTheDocument();
  });

  it("a troca é seca: o slide velho não fica montado por cima do novo", () => {
    vi.useFakeTimers();
    renderizarPainel();

    fireEvent.click(screen.getByRole("button", { name: "Próximo destaque" }));

    // Sem animação de saída, manter os dois montados mostraria o velho POR
    // CIMA do novo. Aqui sobra um só, sem esperar tempo nenhum.
    expect(document.querySelectorAll(".pf-slide")).toHaveLength(1);
    expect(titulosVisiveis()).toEqual([TITULOS_PT[1]]);
  });
});

describe("PainelDeFuncionalidades: idiomas", () => {
  it.each([
    ["en", "Every deal in one pipeline"],
    ["es", "Todos los negocios en un solo embudo"],
  ])("em %s mostra o título do primeiro destaque traduzido", (idioma, titulo) => {
    localStorage.setItem("rz_idioma", idioma);

    renderizarPainel();

    expect(titulosVisiveis()).toEqual([titulo]);
  });

  it("os quatro destaques existem, com texto, nos três idiomas", () => {
    for (const idioma of IDIOMAS) {
      for (const destaque of ["funil", "atendimento", "automacoes", "agentes"]) {
        for (const campo of ["tag", "titulo", "descricao"]) {
          const texto = DICIONARIOS[idioma][`painel.${destaque}.${campo}` as keyof (typeof DICIONARIOS)["pt"]];
          expect(texto, `${idioma} painel.${destaque}.${campo}`).toBeTruthy();
        }
      }
    }
  });

  it("nenhum texto do painel nem do login usa travessão (regra do dono: entrega que foi escrito por IA)", () => {
    for (const idioma of IDIOMAS) {
      const chaves = Object.keys(DICIONARIOS[idioma]).filter(c => c.startsWith("painel.") || c.startsWith("login."));
      expect(chaves.length).toBeGreaterThan(0);
      for (const chave of chaves) {
        const texto = DICIONARIOS[idioma][chave as keyof (typeof DICIONARIOS)["pt"]];
        expect(texto, `${idioma} ${chave}`).not.toMatch(TRAVESSOES);
      }
    }
  });
});

describe("LayoutDeEntrada", () => {
  function renderizarCasca() {
    return render(
      <IdiomaProvider>
        <LayoutDeEntrada voltar={<button type="button">voltar-de-teste</button>}>
          <h1>conteudo-de-teste</h1>
        </LayoutDeEntrada>
      </IdiomaProvider>,
    );
  }

  it("mantém o que a tela passa (conteúdo e seta de voltar) e o rodapé, sem seletores de idioma e tema", () => {
    renderizarCasca();

    expect(screen.getByRole("heading", { level: 1, name: "conteudo-de-teste" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "voltar-de-teste" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Idioma" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Tema" })).toBeNull();
    expect(screen.getByText(/Todos os direitos reservados/)).toBeInTheDocument();
  });

  it("o painel mora num aside escondido no celular e visível a partir de lg", () => {
    // O jsdom não avalia media query, então o que se garante aqui é o
    // CONTRATO: as duas classes que fazem o painel sumir abaixo de 1024px.
    const { container } = renderizarCasca();
    const aside = container.querySelector("aside")!;

    expect(aside.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(aside.className).toContain("lg:block");
    expect(within(aside).getByRole("region", { name: "Destaques do Rezult" })).toBeInTheDocument();
  });

  it("o formulário vem ANTES do painel no DOM, para a ordem do teclado ser formulário e depois destaques", () => {
    const { container } = renderizarCasca();
    const principal = container.querySelector("main")!;
    const aside = container.querySelector("aside")!;

    expect(principal.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
