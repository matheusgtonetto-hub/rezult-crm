import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateDisparo, RHYTHMS, type Disparo, type DisparoRhythm } from "@/data/disparos";
import { toast } from "sonner";

// Converte ISO → valor de <input type="datetime-local"> no fuso local.
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function EditDisparoDialog({
  disparo, open, onOpenChange, onSaved,
}: {
  disparo: Disparo;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (patch: Partial<Disparo>) => void;
}) {
  const [title, setTitle] = useState(disparo.title);
  const [description, setDescription] = useState(disparo.description ?? "");
  const [rhythm, setRhythm] = useState<DisparoRhythm>(disparo.rhythm);
  const [scheduleOn, setScheduleOn] = useState(!!disparo.scheduled_at);
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(disparo.scheduled_at));
  const [confirmFilters, setConfirmFilters] = useState(disparo.confirm_filters);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(disparo.title);
    setDescription(disparo.description ?? "");
    setRhythm(disparo.rhythm);
    setScheduleOn(!!disparo.scheduled_at);
    setScheduledAt(toLocalInput(disparo.scheduled_at));
    setConfirmFilters(disparo.confirm_filters);
  }, [open, disparo]);

  const save = async () => {
    if (!title.trim()) { toast.error("Informe um título"); return; }
    setSaving(true);
    const newScheduled = scheduleOn && scheduledAt ? new Date(scheduledAt).toISOString() : null;
    // Ajusta status entre criado/agendado quando ainda não iniciou.
    let status = disparo.status;
    if (disparo.status === "criado" && newScheduled) status = "agendado";
    if (disparo.status === "agendado" && !newScheduled) status = "criado";
    const patch: Partial<Disparo> = {
      title: title.trim(),
      description: description.trim() || undefined,
      rhythm,
      scheduled_at: newScheduled ?? undefined,
      confirm_filters: confirmFilters,
      status,
    };
    try {
      await updateDisparo(disparo.id, { ...patch, scheduled_at: newScheduled });
      toast.success("Disparo atualizado");
      onSaved({ ...patch, scheduled_at: newScheduled ?? undefined });
      onOpenChange(false);
    } catch {
      toast.error("Não foi possível atualizar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" style={{ width: "min(560px, 94vw)" }}>
        <h2 className="text-lg font-bold">Atualizar disparo</h2>

        <div>
          <label className="text-sm font-medium">Título</label>
          <Input className="mt-1" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Descrição</label>
          <Textarea className="mt-1" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className="border-t border-border pt-4">
          <label className="text-sm font-medium">Ritmo de execução</label>
          <Select value={rhythm} onValueChange={v => setRhythm(v as DisparoRhythm)}>
            <SelectTrigger className="mt-1 [&_[data-hint]]:hidden"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RHYTHMS.map(r => (
                <SelectItem key={r.id} value={r.id}>
                  <div className="flex flex-col"><span>{r.label}</span><span data-hint className="text-[11px] text-muted-foreground">{r.hint}</span></div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-2">
            <span className="text-primary">ℹ</span>
            Verifique nas configurações da conexão da automação o limite de mensagens por segundo para definir o melhor tamanho do lote neste disparo.
          </p>
          <p className="text-xs text-amber-600 flex items-start gap-1.5 mt-1">⚠ Concorrência com as APIs externas podem impactar a taxa de envio de mensagens/seg.</p>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox checked={scheduleOn} onCheckedChange={v => setScheduleOn(!!v)} className="mt-0.5" />
          <span>
            <span className="text-sm font-medium block">Agendar</span>
            <span className="text-xs text-muted-foreground">Definir uma data e hora para o início do disparo, caso contrário deverá ser iniciado manualmente</span>
            {scheduleOn && <Input type="datetime-local" className="mt-2 h-9" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />}
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox checked={confirmFilters} onCheckedChange={v => setConfirmFilters(!!v)} className="mt-0.5" />
          <span>
            <span className="text-sm font-medium block">Confirmar filtros antes da execução</span>
            <span className="text-xs text-muted-foreground">Atualizar a lista de leads com base no filtro selecionado antes do disparo inicial.</span>
          </span>
        </label>

        <div className="flex justify-end pt-2">
          <Button disabled={saving} onClick={save}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
