import type { Idioma } from "@/i18n/dicionarios";

/**
 * Bandeiras do seletor de idioma, desenhadas em SVG.
 *
 * Não são emoji (🇧🇷) de propósito: o Windows não tem a fonte de bandeiras, e
 * Chrome e Edge lá mostram as duas letras do país no lugar do desenho. Numa
 * base com muito cliente em Windows, metade das pessoas veria "BR" onde deveria
 * haver uma bandeira, e isso lê como defeito.
 *
 * São versões simplificadas: a do Brasil não traz as estrelas nem a faixa
 * "Ordem e Progresso", e a dos Estados Unidos tem sete listras em vez de
 * treze. Em 20 × 14px nada disso apareceria -- viraria borrão --, e o que
 * identifica cada país nesse tamanho é a combinação de cores e formas.
 */

const CANTO = 2;

function Brasil() {
  return (
    <svg viewBox="0 0 20 14" width={20} height={14} aria-hidden="true">
      <rect width="20" height="14" rx={CANTO} fill="#009B3A" />
      <path d="M10 2 L18 7 L10 12 L2 7 Z" fill="#FEDF00" />
      <circle cx="10" cy="7" r="3" fill="#002776" />
    </svg>
  );
}

function EstadosUnidos() {
  return (
    <svg viewBox="0 0 20 14" width={20} height={14} aria-hidden="true">
      <rect width="20" height="14" rx={CANTO} fill="#FFFFFF" />
      {[0, 2, 4, 6].map(i => (
        <rect key={i} y={i * 2} width="20" height="2" fill="#B22234" />
      ))}
      <rect width="9" height="8" rx={CANTO} fill="#3C3B6E" />
    </svg>
  );
}

function Espanha() {
  return (
    <svg viewBox="0 0 20 14" width={20} height={14} aria-hidden="true">
      <rect width="20" height="14" rx={CANTO} fill="#AA151B" />
      <rect y="3.5" width="20" height="7" fill="#F1BF00" />
    </svg>
  );
}

export const BANDEIRA: Record<Idioma, () => JSX.Element> = {
  pt: Brasil,
  en: EstadosUnidos,
  es: Espanha,
};
