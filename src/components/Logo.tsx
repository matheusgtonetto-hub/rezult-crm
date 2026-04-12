export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-xl", md: "text-2xl", lg: "text-4xl" };
  return (
    <span className={`${sizes[size]} font-bold tracking-tight`}>
      <span className="logo-re">Re</span>
      <span className="logo-zult">zult</span>
    </span>
  );
}
