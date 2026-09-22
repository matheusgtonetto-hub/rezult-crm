/**
 * Tinta legível sobre cor escolhida pelo usuário.
 *
 * O design system fixa a tinta de cada superfície DELE (seção 3.1 da matriz em
 * `docs/design-system/rezult-design-system.md`). Só que parte das superfícies do
 * CRM não é do sistema: a cor de uma tag e a cor de uma etapa de pipeline são
 * dado, escolhido pelo usuário e gravado no banco. Não existe token que cubra
 * isso, e cravar `text-white` em cima de cor arbitrária é como o app estava:
 * a tag "Demonstração" em verde claro ficava com 2,54:1.
 *
 * A saída aqui é a regra que o sistema já usa para o emerald, generalizada:
 * superfície clara pede tinta charcoal, superfície escura pede tinta branca.
 * Quem decide é a luminância relativa da cor, pela fórmula da WCAG, e não o
 * matiz -- é por isso que amarelo e verde-claro caem no charcoal enquanto azul
 * e vinho ficam no branco.
 *
 * Usado por: chip de tag (Leads, Pipeline, Multiatendimento) e qualquer lugar
 * que pinte texto sobre cor vinda do banco.
 */

const CHARCOAL = "#2D2F33"; // --neutral-900, a tinta do sistema
const BRANCO = "#FFFFFF";

/** Canal sRGB linearizado, como a WCAG define. */
function canal(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminância relativa (0 = preto, 1 = branco). */
export function luminancia(cor: string): number | null {
  const rgb = paraRgb(cor);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * Aceita `#RGB`, `#RRGGBB`, `rgb()/rgba()` e `hsl()`.
 *
 * O `hsl()` aparece porque a cor de avatar de membro é gerada por hash
 * (`colorFromString` no CRMContext) e sai nesse formato.
 *
 * `var(--token)` é resolvido contra o documento. Antes devolvia `null`, e o
 * `tintaSobre` caía no charcoal: em 18/09/2026 isso pintou 347 iniciais de
 * avatar em charcoal sobre `--neutral-700`, dando 1,7:1, porque o fallback de
 * cor de membro tinha acabado de virar token. A regra "token no CSS, hex no
 * dado" continua valendo, mas a função não pode depender de todo mundo
 * lembrar dela: quem mede tem que saber medir o que recebe.
 */
function paraRgb(cor: string): [number, number, number] | null {
  let c = cor.trim().toLowerCase();

  // var(--token) vira o valor declarado na raiz. Só funciona no navegador; em
  // teste ou SSR não há documento, e aí segue o caminho do `null`.
  const token = c.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,([^)]*))?\)$/);
  if (token) {
    const raiz = typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue(token[1]).trim()
      : "";
    const valor = raiz || (token[2] ?? "").trim();
    if (!valor || valor.startsWith("var(")) return null;
    c = valor.toLowerCase();
  }

  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1];
    const cheio = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
    return [parseInt(cheio.slice(0, 2), 16), parseInt(cheio.slice(2, 4), 16), parseInt(cheio.slice(4, 6), 16)];
  }

  const rgb = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  const hsl = c.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (hsl) return hslParaRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);

  return null;
}

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Razão de contraste entre duas cores, no formato da WCAG (1 a 21). */
export function contraste(a: string, b: string): number | null {
  const la = luminancia(a);
  const lb = luminancia(b);
  if (la === null || lb === null) return null;
  const [maior, menor] = la > lb ? [la, lb] : [lb, la];
  return (maior + 0.05) / (menor + 0.05);
}

/**
 * A tinta que se lê sobre `fundo`: charcoal ou branco, a que tiver mais
 * contraste. Cor irreconhecível cai no charcoal, que é o padrão do sistema e a
 * aposta segura sobre as superfícies claras do app.
 */
export function tintaSobre(fundo: string | null | undefined): string {
  if (!fundo) return CHARCOAL;
  const l = luminancia(fundo);
  if (l === null) return CHARCOAL;
  // Limiar derivado da própria fórmula, resolvendo "contraste com charcoal ==
  // contraste com branco": sqrt(1,05 × (0,0283 + 0,05)) - 0,05 = 0,237.
  //
  // O 0,179 que se vê por aí é o cruzamento contra PRETO puro, e o sistema não
  // usa preto. Com 0,179 as cores entre 0,179 e 0,237 recebiam charcoal quando
  // o branco tinha mais contraste.
  return l > 0.237 ? CHARCOAL : BRANCO;
}

/** Converte para HSL, para escurecer mantendo matiz e saturação. */
function rgbParaHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rr ? ((gg - bb) / d + (gg < bb ? 6 : 0)) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h * 60, s, l];
}

/**
 * Tinta para o "chip suave": fundo com uma fração da cor e a própria cor como
 * texto.
 *
 * O padrão só se sustenta com cor escura. Em ciano claro (`#06B6D4`) dava
 * 2,14:1, e era assim que a etiqueta "Meta ads" aparecia. Aqui a cor é
 * escurecida em passos de 4% de luminosidade, mantendo matiz e saturação, até
 * passar 4,5:1 contra o próprio fundo tingido. O chip continua "da cor da
 * tag", só que legível.
 *
 * `fracao` é a opacidade do fundo (0,13 para o `+ "22"` usado no app).
 */
export function tintaDeChip(cor: string | null | undefined, fracao = 0.13): string {
  if (!cor) return CHARCOAL;
  const rgb = paraRgb(cor);
  if (!rgb) return CHARCOAL;
  const fundo: [number, number, number] = [
    Math.round(rgb[0] * fracao + 255 * (1 - fracao)),
    Math.round(rgb[1] * fracao + 255 * (1 - fracao)),
    Math.round(rgb[2] * fracao + 255 * (1 - fracao)),
  ];
  const lumFundo = 0.2126 * canal(fundo[0]) + 0.7152 * canal(fundo[1]) + 0.0722 * canal(fundo[2]);
  const [h, sat, lIni] = rgbParaHsl(rgb[0], rgb[1], rgb[2]);
  for (let l = lIni; l > 0.04; l -= 0.04) {
    const [r, g, b] = hslParaRgb(h, sat, l);
    const lumTinta = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    const razao = (lumFundo + 0.05) / (lumTinta + 0.05);
    if (razao >= 4.5) return `rgb(${r}, ${g}, ${b})`;
  }
  return CHARCOAL;
}
