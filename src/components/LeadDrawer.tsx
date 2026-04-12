import { useCRM } from "@/context/CRMContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Priority, LeadOrigin } from "@/data/mockData";

interface Props {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}

export function LeadDrawer({ leadId, open, onClose }: Props) {
  const { leads, updateLead, columns, teamMembers, addActivity } = useCRM();
  const [newNote, setNewNote] = useState("");

  if (!leadId || !leads[leadId]) return null;
  const lead = leads[leadId];

  const handleSaveNote = () => {
    if (!newNote.trim()) return;
    addActivity(leadId, {
      id: `a-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      type: "note",
      description: newNote.trim(),
    });
    setNewNote("");
    toast.success("Anotação salva!");
  };

  const handleFieldChange = (field: string, value: string | number) => {
    updateLead(leadId, { [field]: value });
  };

  const handleStageChange = (newStage: string) => {
    const oldStage = lead.stage;
    const oldCol = columns.find(c => c.id === oldStage);
    const newCol = columns.find(c => c.id === newStage);
    updateLead(leadId, { stage: newStage });
    addActivity(leadId, {
      id: `a-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      type: "stage_change",
      description: `Movido de "${oldCol?.title}" para "${newCol?.title}".`,
    });
    toast.success("Etapa atualizada!");
  };

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-card border-card-border overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">{lead.name}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome completo</label>
              <Input value={lead.name} onChange={e => handleFieldChange("name", e.target.value)} className="bg-background border-card-border rounded-lg" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Empresa</label>
              <Input value={lead.company || ""} onChange={e => handleFieldChange("company", e.target.value)} className="bg-background border-card-border rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">WhatsApp</label>
              <div className="flex gap-2">
                <Input value={lead.whatsapp} onChange={e => handleFieldChange("whatsapp", e.target.value)} className="bg-background border-card-border rounded-lg flex-1" />
                <a href={`https://wa.me/${lead.whatsapp}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-success text-success-foreground hover:opacity-90">
                  <MessageCircle size={16} />
                </a>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">E-mail</label>
              <Input value={lead.email || ""} onChange={e => handleFieldChange("email", e.target.value)} className="bg-background border-card-border rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valor do negócio</label>
              <Input type="number" value={lead.value} onChange={e => handleFieldChange("value", Number(e.target.value))} className="bg-background border-card-border rounded-lg" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Responsável</label>
              <Select value={lead.responsible} onValueChange={v => handleFieldChange("responsible", v)}>
                <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {teamMembers.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Etapa</label>
              <Select value={lead.stage} onValueChange={handleStageChange}>
                <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {columns.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prioridade</label>
              <Select value={lead.priority} onValueChange={v => handleFieldChange("priority", v)}>
                <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {(["Alta", "Média", "Baixa"] as Priority[]).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Origem</label>
              <Select value={lead.origin} onValueChange={v => handleFieldChange("origin", v)}>
                <SelectTrigger className="bg-background border-card-border rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {(["Instagram", "Facebook Ads", "Indicação", "Site", "Outro"] as LeadOrigin[]).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Próximo follow-up</label>
              <Input type="date" value={lead.nextFollowUp || ""} onChange={e => handleFieldChange("nextFollowUp", e.target.value)} className="bg-background border-card-border rounded-lg" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Anotações</label>
            <Textarea value={lead.notes} onChange={e => handleFieldChange("notes", e.target.value)} className="bg-background border-card-border rounded-lg min-h-[80px]" />
          </div>

          {/* Activity history */}
          <div className="border-t border-card-border pt-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">Histórico de atividades</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
              {lead.activities.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma atividade registrada.</p>}
              {[...lead.activities].reverse().map(act => (
                <div key={act.id} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground whitespace-nowrap">{new Date(act.date).toLocaleDateString("pt-BR")}</span>
                  <span className={act.type === "stage_change" ? "text-primary" : "text-foreground"}>
                    {act.description}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova anotação..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                className="bg-background border-card-border rounded-lg flex-1"
                onKeyDown={e => e.key === "Enter" && handleSaveNote()}
              />
              <Button onClick={handleSaveNote} size="sm" className="rounded-lg">Salvar</Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
