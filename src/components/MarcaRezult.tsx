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
export function MarcaRezult({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <img
        src="/favicon.png?v=4"
        alt=""
        aria-hidden="true"
        className="shrink-0 block object-cover"
        style={{ width: 34, height: 34, borderRadius: 9 }}
      />
      {/* O nome é uma palavra só, com as duas metades em pesos diferentes, como
          na arte original: "Rez" forte e "ult" no verde da marca. */}
      <span className="text-[26px] font-bold leading-none tracking-tight text-[color:var(--text-heading)]">
        Rez<span className="text-[color:var(--text-link)]">ult</span>
      </span>
    </span>
  );
}
