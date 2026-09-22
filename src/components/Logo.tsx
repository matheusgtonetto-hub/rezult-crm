/**
 * A marca escrita, com o símbolo opcional à esquerda.
 *
 * O símbolo era um quadrado emerald com as letras "RZ" desenhadas em texto --
 * um lugar reservado, de quando não havia arquivo de marca no projeto. Desde
 * 19/09/2026 ele é a MARCA OFICIAL, o mesmo `/favicon.png` que a barra lateral
 * e a aba do navegador usam.
 *
 * Um arquivo só para os três lugares: trocar a arte é substituir `public/favicon.png`
 * e subir o `?v=`, e não caçar cópias pelo código.
 */
export function Logo({ size = "md", showIcon = false }: { size?: "sm" | "md" | "lg"; showIcon?: boolean }) {
  const sizes = { sm: "text-[18px]", md: "text-[20px]", lg: "text-[24px]" };
  /** Lado do símbolo por tamanho. O raio acompanha, para a curva não achatar. */
  const lados = { sm: 28, md: 34, lg: 44 };
  const raios = { sm: 8, md: 10, lg: 12 };
  return (
    <div className="inline-flex items-center" style={{ gap: "11px" }}>
      {showIcon && (
        <img
          src="/favicon.png?v=4"
          alt=""
          aria-hidden="true"
          className="flex-shrink-0 block object-cover"
          style={{ width: lados[size], height: lados[size], borderRadius: raios[size] }}
        />
      )}
      <span className={`${sizes[size]} leading-none`} style={{ letterSpacing: "-0.04em", fontWeight: 600 }}>
        Re<b style={{ fontWeight: 600, color: "var(--accent-800)" }}>zult CRM</b>
      </span>
    </div>
  );
}
