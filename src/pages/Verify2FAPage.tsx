import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const CODE_LENGTH = 6;

export default function Verify2FAPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { verifyOtp, resendConfirmation } = useAuth();

  const email =
    (location.state as { email?: string } | null)?.email ??
    sessionStorage.getItem("register_email") ??
    "";

  const [digits, setDigits]     = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading]   = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    const char = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    const next = [...digits];
    pasted.split("").forEach((char, i) => { next[i] = char; });
    setDigits(next);
    const lastFilled = Math.min(pasted.length, CODE_LENGTH - 1);
    inputRefs.current[lastFilled]?.focus();
  };

  const handleVerify = async () => {
    const code = digits.join("");
    if (code.length < CODE_LENGTH) { toast.error("Digite o código completo de 6 dígitos."); return; }
    if (!email) { toast.error("E-mail não encontrado. Volte e tente novamente."); return; }

    setLoading(true);
    const error = await verifyOtp(email, code);
    setLoading(false);

    if (error) {
      toast.error("Código inválido ou expirado. Tente novamente.");
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
      return;
    }

    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_name")
      .eq("id", userId)
      .maybeSingle();

    navigate(profile?.company_name ? "/inicio" : "/company-register");
  };

  const handleResend = async () => {
    if (!email) { toast.error("E-mail não encontrado. Volte e tente novamente."); return; }
    setResending(true);
    await resendConfirmation(email);
    setResending(false);
    toast.success(`Novo código enviado para ${email}`);
    setDigits(Array(CODE_LENGTH).fill(""));
    inputRefs.current[0]?.focus();
  };

  const isComplete = digits.every(d => d !== "");

  return (
    <div className="h-screen overflow-hidden flex items-center justify-center px-4" style={{ background: "#F2F7F5" }}>
      <div className="relative w-full max-w-[380px] rounded-[7px] p-[1px] overflow-hidden">
        {/* Rotating border lights */}
        <div
          className="absolute inset-[-100%]"
          style={{
            background: "conic-gradient(from 0deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
            animation: "spin-border 4s linear infinite",
          }}
        />
        <div
          className="absolute inset-[-100%]"
          style={{
            background: "conic-gradient(from 180deg, transparent 0%, transparent 55%, #128A68 65%, #4ade80 75%, #128A68 85%, transparent 95%)",
            animation: "spin-border 4s linear infinite",
          }}
        />
        <div className="relative w-full bg-card rounded-[7px] px-[30px] pt-[30px] pb-[24px] text-center">
          <div className="flex justify-center items-center mb-[15px]">
            <img src="/logo-rezult.png?v=2" alt="Rezult CRM" className="h-10 w-auto" />
          </div>

          <h1 className="text-[22px] font-semibold text-foreground">Verifique seu e-mail</h1>
          <p className="text-[14px] text-gray-500 mt-[1px] leading-snug font-normal">
            Enviamos um código de 6 dígitos para
          </p>
          {email && (
            <p className="text-[13px] font-semibold text-foreground mt-1">{email}</p>
          )}

          {/* OTP inputs */}
          <div className="flex justify-center gap-2 mt-6" onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className="w-8 h-9 text-center text-[16px] font-semibold border border-gray-300 rounded-[5px] bg-white focus:outline-none focus:border-primary transition-colors"
              />
            ))}
          </div>

          <Button
            className="w-full h-auto py-[10px] rounded-[5px] font-semibold mt-5"
            onClick={handleVerify}
            disabled={loading || !isComplete}
          >
            {loading ? "Verificando..." : "Verificar"}
          </Button>

          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-[13px] text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
            >
              {resending ? "Reenviando..." : "Reenviar código"}
            </button>
          </div>

          <div className="flex justify-center mt-2">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Voltar para o login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
