/**
 * A marca, nas telas de antes do login.
 *
 * ─── Por que não é mais o PNG ───────────────────────────────────────────────
 *
 * Era `/logo-rezult.png`, um arquivo único com o símbolo verde e a palavra
 * "Rezult" em PRETO embutida. Com o tema escuro valendo também nessas telas
 * (o seletor ao lado do idioma, pedido do dono em 24/09/2026), a palavra ficou
 * preta sobre o cartão escuro: 1,49:1, medido na tela. Imagem não se recolore
 * por CSS sem estragar o verde junto.
 *
 * A composição aqui é a MESMA que a barra lateral já usava: o símbolo vem do
 * arquivo do favicon e a palavra é texto, com o token de título. Então ela
 * inverte sozinha, é a mesma marca dos dois lados do login, e a arte continua
 * morando num arquivo só.
 */
/*
 * `style` existe por causa das superfícies de venda (SetupPage e
 * OfertaDeContratacao), que são escuras NOS DOIS temas. Lá o
 * `--text-heading` do tema claro sairia quase preto sobre o cartão preto, então
 * quem chama passa a cor. Por isso a tinta mora no span de fora e as palavras
 * herdam: assim um `color` do chamador vence sem precisar de `!important`.
 */
export function MarcaRezult({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 text-[color:var(--text-heading)] ${className ?? ""}`}
      style={style}
    >
      <img
        src="/favicon.png?v=5"
        alt=""
        aria-hidden="true"
        className="shrink-0 block object-cover"
        style={{ width: 34, height: 34, borderRadius: 9 }}
      />
      {/* "Rezult CRM", igual à navbar do site (dono, 11/10/2026). Era "Rezult"
          numa palavra só, com "ult" em verde, herdado da arte antiga.

          Os tamanhos são os do site: 20px no "Rezult" em 600 e 18px no "CRM"
          em 400. O 18 mora no pai porque as duas palavras dividem o
          `line-height` dele; subir o pai moveria a linha de base das duas. E a
          cor é uma só, sem o verde, porque o site também é de uma cor só. */}
      <span className="text-[18px] font-normal leading-none tracking-tight">
        <span className="text-[20px] font-semibold">Rezult</span> CRM
      </span>
    </span>
  );
}
