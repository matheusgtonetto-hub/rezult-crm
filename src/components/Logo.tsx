export function Logo({ size = "md", showIcon = false }: { size?: "sm" | "md" | "lg"; showIcon?: boolean }) {
  const sizes = { sm: "text-[17px]", md: "text-[21px]", lg: "text-[28px]" };
  const iconSizes = { sm: "w-[28px] h-[28px] text-[11px]", md: "w-[34px] h-[34px] text-[14px]", lg: "w-[44px] h-[44px] text-[17px]" };
  return (
    <div className="inline-flex items-center" style={{ gap: "11px" }}>
      {showIcon && (
        <div
          className={`${iconSizes[size]} rounded-[11px] bg-primary text-white font-bold flex items-center justify-center flex-shrink-0`}
          style={{ letterSpacing: "-0.05em", boxShadow: "0 0 20px color-mix(in srgb, hsl(var(--primary)) 30%, transparent)" }}
        >
          RZ
        </div>
      )}
      <span className={`${sizes[size]} leading-none`} style={{ letterSpacing: "-0.04em", fontWeight: 600 }}>
        Re<b style={{ fontWeight: 600, color: "hsl(var(--primary))" }}>zult CRM</b>
      </span>
    </div>
  );
}
