import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { X } from "lucide-react";

interface PendingFollowup {
  id: string;
  message: string;
  scheduled_at: string;
  status: string;
  error_message: string | null;
}

export function FollowupScheduleDialog({
  open, onClose, phone, leadId, ownerId, companyId, connectionId, createdBy,
}: {
  open: boolean;
  onClose: () => void;
  phone: string;
  leadId?: string;
  ownerId: string;
  companyId: string;
  connectionId: string | undefined;
  createdBy?: string;
}) {
  const [message, setMessage] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingFollowup[]>([]);
  const cleanPhone = phone.replace(/\D/g, "");

  const loadPending = async () => {
    const { data } = await supabase
      .from("scheduled_followups")
      .select("id, message, scheduled_at, status, error_message")
      .eq("owner_id", ownerId)
      .eq("phone", cleanPhone)
      .in("status", ["agendado", "erro"])
      .order("scheduled_at", { ascending: true });
    setPending((data as PendingFollowup[] | null) ?? []);
  };

  useEffect(() => {
    if (!open) return;
    setMessage("");
    setScheduledAt("");
    loadPending();

    const channel = supabase
      .channel(`scheduled-followups-${cleanPhone}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_followups", filter: `phone=eq.${cleanPhone}` }, loadPending)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cleanPhone]);

  const handleSchedule = async () => {
    if (!message.trim()) { toast.error("Escreva a mensagem."); return; }
    if (!scheduledAt) { toast.error("Escolha uma data e hora."); return; }
    const when = new Date(scheduledAt);
    if (when.getTime() <= Date.now()) { toast.error("Escolha um horário no futuro."); return; }
    if (!connectionId) { toast.error("Nenhuma conexão de WhatsApp ativa. Configure em Configurações → Conexões."); return; }

    setSaving(true);
    const { error } = await supabase.from("scheduled_followups").insert({
      owner_id: ownerId,
      company_id: companyId,
      lead_id: leadId ?? null,
      phone: cleanPhone,
      connection_id: connectionId,
      message: message.trim(),
      scheduled_at: when.toISOString(),
      created_by: createdBy ?? null,
    });
    setSaving(false);

    if (error) { toast.error("Não foi possível agendar o follow up."); return; }
    toast.success("Follow up agendado.");
    setMessage("");
    setScheduledAt("");
    loadPending();
  };

  const handleCancel = async (id: string) => {
    const { error } = await supabase.from("scheduled_followups").update({ status: "cancelado" }).eq("id", id);
    if (error) { toast.error("Não foi possível cancelar."); return; }
    loadPending();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg" style={{ width: "min(480px, 94vw)" }}>
        <h2 className="text-lg font-bold">Follow up</h2>
        <p className="text-sm text-muted-foreground -mt-2">Agende o envio automático de uma mensagem de WhatsApp para esta conversa.</p>

        <div>
          <label className="text-sm font-medium">Mensagem</label>
          <Textarea
            className="mt-1"
            rows={4}
            placeholder="Escreva a mensagem que será enviada..."
            value={message}
            onChange={e => setMessage(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Data e hora do envio</label>
          <Input
            type="datetime-local"
            className="mt-1 h-9"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
          />
        </div>

        <div className="flex justify-end pt-1">
          <Button disabled={saving} onClick={handleSchedule}>{saving ? "Agendando..." : "Agendar envio"}</Button>
        </div>

        {pending.length > 0 && (
          <div className="border-t border-border pt-3 mt-1">
            <p className="text-sm font-medium mb-2">Agendados para esta conversa</p>
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              {pending.map(f => (
                <div key={f.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {new Date(f.scheduled_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {f.status === "erro" && <span className="text-destructive font-medium"> · falhou{f.error_message ? `: ${f.error_message}` : ""}</span>}
                    </p>
                    <p className="text-sm truncate">{f.message}</p>
                  </div>
                  {f.status === "agendado" && (
                    <button
                      type="button"
                      onClick={() => handleCancel(f.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Cancelar follow up"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
