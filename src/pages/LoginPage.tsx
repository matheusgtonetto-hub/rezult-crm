import { useState } from "react";
import { useCRM } from "@/context/CRMContext";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function LoginPage() {
  const { login } = useCRM();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha todos os campos.");
      return;
    }
    toast.success("Login realizado com sucesso!");
    login();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-6">
        <div className="text-center">
          <Logo size="lg" />
          <p className="mt-2 text-muted-foreground text-sm">CRM para quem vende pelo WhatsApp</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="bg-card border-card-border rounded-lg h-11"
          />
          <Input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="bg-card border-card-border rounded-lg h-11"
          />
          <Button type="submit" className="w-full h-11 rounded-lg font-semibold">
            Entrar
          </Button>
          <p className="text-center text-sm text-muted-foreground cursor-pointer hover:text-primary transition-colors">
            Esqueci minha senha
          </p>
        </form>
      </div>
    </div>
  );
}
