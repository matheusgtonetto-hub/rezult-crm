export function Logo({ size = "md", showIcon = false }: { size?: "sm" | "md" | "lg"; showIcon?: boolean }) {
  const sizes = { sm: "text-lg", md: "text-[28px]", lg: "text-4xl" };
  const iconSizes = { sm: "w-7 h-7 text-xs", md: "w-[40px] h-[40px] text-sm", lg: "w-12 h-12 text-base" };
  return (
    <div className="flex items-center gap-2.5">
      {showIcon && (
        <div
          className={`${iconSizes[size]} rounded-[10px] bg-primary text-white font-bold flex items-center justify-center tracking-tight`}
        >
          RZ
        </div>
      )}
      <span className={`${sizes[size]} leading-none`} style={{ letterSpacing: "-0.030em", fontWeight: 650 }}>
        <span className="logo-re">Re</span>
        <span className="logo-zult">zult</span>
      </span>
    </div>
  );
}
