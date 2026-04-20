import { useCRM } from "@/context/CRMContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle,
  Trophy,
  XCircle,
  StickyNote,
  ArrowRightLeft,
  PlusCircle,
  Sparkles,
  Plus,
  CheckSquare,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Priority, LeadOrigin, ActivityType } from "@/data/mockData";

interface Props {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}

const ACTIVITY_META: Record<
  ActivityType,
  { icon: typeof StickyNote; tone: string; label: string }
> = {
  note: { icon: StickyNote, tone: "text-foreground bg-muted", label: "Anotação" },
  stage_change: { icon: ArrowRightLeft, tone: "text-primary bg-primary/10", label: "Etapa" },
  whatsapp: { icon: MessageCircle, tone: "text-success bg-success/10", label: "WhatsApp" },
  won: { icon: Trophy, tone: "text-success bg-success/10", label: "Ganho" },
  lost: { icon: XCircle, tone: "text-destructive bg-destructive/10", label: "Perdido" },
  created: { icon: PlusCircle, tone: "text-muted-foreground bg-muted", label: "Criado" },
};

export function LeadDrawer({ leadId, open, onClose }: Props) {
  const {
    leads,
    updateLead,
    columns,
    teamMembers,
    addActivity,
    products,
    markLeadWon,
    markLeadLost,
  } = useCRM();
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

  const handleFieldChange = (field: string, value: string | number | undefined) => {
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

  const handleWon = () => {
    markLeadWon(leadId);
    toast.success("Negócio marcado como ganho!");
  };
  const handleLost = () => {
    markLeadLost(leadId);
    toast.error("Negócio marcado como perdido.");
  };

  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-card border-card-border overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <Sparkles size={12} className="text-primary" />
            Negócio #{lead.dealNumber}
          </div>
          <SheetTitle className="text-foreground">{lead.name}</SheetTitle>
        </SheetHeader>

        {/* Action buttons */}
        <div className="flex gap-2 mt-4">
          <Button
            onClick={handleWon}
            className="flex-1 rounded-lg font-semibold bg-success text-success-foreground hover:bg-success/90"
          >
            <Trophy size={14} className="mr-1.5" />
            Ganho
          </Button>
          <Button
            onClick={handleLost}
            variant="destructive"
            className="flex-1 rounded-lg font-semibold"
          >
            <XCircle size={14} className="mr-1.5" />
            Perdido
          </Button>
        </div>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome completo</label>
              <Input
                value={lead.name}
                onChange={e => handleFieldChange("name", e.target.value)}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Empresa</label>
              <Input
                value={lead.company || ""}
                onChange={e => handleFieldChange("company", e.target.value)}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">WhatsApp</label>
              <div className="flex gap-2">
                <Input
                  value={lead.whatsapp}
                  onChange={e => handleFieldChange("whatsapp", e.target.value)}
                  className="bg-background border-card-border rounded-lg flex-1"
                />
                <a
                  href={`https://wa.me/${lead.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-success text-success-foreground hover:opacity-90"
                >
                  <MessageCircle size={16} />
                </a>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">E-mail</label>
              <Input
                value={lead.email || ""}
                onChange={e => handleFieldChange("email", e.target.value)}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Valor do negócio</label>
              <Input
                type="number"
                value={lead.value}
                onChange={e => handleFieldChange("value", Number(e.target.value))}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Responsável</label>
              <Select
                value={lead.responsible}
                onValueChange={v => handleFieldChange("responsible", v)}
              >
                <SelectTrigger className="bg-background border-card-border rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {teamMembers.map(m => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Etapa</label>
              <Select value={lead.stage} onValueChange={handleStageChange}>
                <SelectTrigger className="bg-background border-card-border rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {columns.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prioridade</label>
              <Select
                value={lead.priority}
                onValueChange={v => handleFieldChange("priority", v)}
              >
                <SelectTrigger className="bg-background border-card-border rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {(["Alta", "Média", "Baixa"] as Priority[]).map(p => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Origem</label>
              <Select value={lead.origin} onValueChange={v => handleFieldChange("origin", v)}>
                <SelectTrigger className="bg-background border-card-border rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-card-border">
                  {(["Instagram", "Facebook Ads", "Indicação", "Site", "Outro"] as LeadOrigin[]).map(
                    o => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Próximo follow-up</label>
              <Input
                type="date"
                value={lead.nextFollowUp || ""}
                onChange={e => handleFieldChange("nextFollowUp", e.target.value)}
                className="bg-background border-card-border rounded-lg"
              />
            </div>
          </div>

          {/* Product link */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Produto vinculado</label>
            <Select
              value={lead.productId || "none"}
              onValueChange={v =>
                handleFieldChange("productId", v === "none" ? undefined : v)
              }
            >
              <SelectTrigger className="bg-background border-card-border rounded-lg">
                <SelectValue placeholder="Sem produto" />
              </SelectTrigger>
              <SelectContent className="bg-card border-card-border">
                <SelectItem value="none">Sem produto</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Anotações</label>
            <Textarea
              value={lead.notes}
              onChange={e => handleFieldChange("notes", e.target.value)}
              className="bg-background border-card-border rounded-lg min-h-[80px]"
            />
          </div>

          {/* Activity history */}
          <div className="border-t border-card-border pt-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">
              Histórico de atividades
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
              {lead.activities.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma atividade registrada.
                </p>
              )}
              {[...lead.activities].reverse().map(act => {
                const meta = ACTIVITY_META[act.type] || ACTIVITY_META.note;
                const Icon = meta.icon;
                return (
                  <div
                    key={act.id}
                    className="flex gap-2 items-start text-xs p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${meta.tone}`}
                    >
                      <Icon size={13} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground leading-snug">{act.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {meta.label} ·{" "}
                        {new Date(act.date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova anotação..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                className="bg-background border-card-border rounded-lg flex-1"
                onKeyDown={e => e.key === "Enter" && handleSaveNote()}
              />
              <Button onClick={handleSaveNote} size="sm" className="rounded-lg">
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
