import type { CSSProperties, ReactNode } from "react";
import { tintaDeChip } from "@/lib/contraste";
import { useTema } from "@/context/ProfileContext";

/**
 * A etiqueta de tag do sistema. UMA para todas as telas.
 *
 * Antes de existir, cada lugar desenhava a sua: o funil e a lista de leads
 * pintavam a tag com a cor CHEIA e texto branco por cima, o detalhe do negócio
 * também, o Multiatendimento usava fundo esmaecido com raio 6, as automações
 * fundo esmaecido com raio 12 e a cor crua como tinta, e o painel do lead tinha
 * `background: "var(--accent-700)18"` -- que não é cor válida em CSS, então
 * aquele fundo simplesmente não aparecia.
 *
 * O padrão, decidido pelo dono em 23/09/2026: 10px, fundo esmaecido, tinta na
 * própria cor da tag mas escurecida, e raio de 50px.
 *
 * ─── Por que a tinta não é a cor crua ───────────────────────────────────────
 *
 * Porque a cor que o cliente escolhe não serve como texto. Amarelo ou ciano
 * sobre o próprio fundo esmaecido dá 2:1 de contraste, e a palavra some.
 * `tintaDeChip` escurece a cor em passos, mantendo matiz e saturação, até
 * passar 4,5:1 contra o fundo tingido: a etiqueta continua "da cor da tag", só
 * que legível. A fração 0,13 é a mesma do `+ "22"` usado no fundo.
 */
export function TagPill({
  cor,
  children,
  onClick,
  title,
  style,
}: {
  /** A cor da tag, como gravada no banco. Sem cor, a etiqueta fica neutra. */
  cor?: string | null;
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  /** Ajustes pontuais de layout (margem, largura). Cor e raio não se sobrescrevem. */
  style?: CSSProperties;
}) {
  // A tinta sai de uma conta contra a SUPERFÍCIE do tema, então esta etiqueta
  // precisa repintar quando o tema muda. Ler o tema aqui é o que assina essa
  // mudança; o valor em si não entra no cálculo (quem lê a superfície é o
  // `tintaDeChip`, direto do documento).
  useTema();

  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: cor ? `${cor}22` : "var(--neutral-50)",
    color: cor ? tintaDeChip(cor) : "var(--text-muted)",
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1.6,
    padding: "1px 8px",
    borderRadius: 50,
    whiteSpace: "nowrap",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    ...style,
  };

  if (!onClick) return <span title={title} style={base}>{children}</span>;

  return (
    <button type="button" title={title} onClick={onClick} style={{ ...base, border: "none", cursor: "pointer" }}>
      {children}
    </button>
  );
}
