import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, Phone, MessageCircle, Mail, RefreshCw, Check } from "lucide-react";
import { useState } from "react";
import type { ActivityType } from "@/data/mockData";

interface ActivityFormData {
  title: string;
  type: ActivityType;
  scheduledAt: string;
  contactEmail: string;
  meetLink: string;
  description: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ActivityFormData) => void;
  defaultEmail?: string;
}

const ACTIVITY_TYPES: {
  type: ActivityType;
  icon: typeof CalendarDays;
  label: string;
  color: string;
}[] = [
  { type: "meeting", icon: CalendarDays, label: "Reunião", color: "text-blue-500 bg-blue-500/10 border-blue-500/30 data-[selected=true]:bg-blue-500 data-[selected=true]:text-white data-[selected=true]:border-blue-500" },
  { type: "call", icon: Phone, label: "Ligação", color: "text-green-500 bg-green-500/10 border-green-500/30 data-[selected=true]:bg-green-500 data-[selected=true]:text-white data-[selected=true]:border-green-500" },
  { type: "whatsapp", icon: MessageCircle, label: "WhatsApp", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30 data-[selected=true]:bg-emerald-500 data-[selected=true]:text-white data-[selected=true]:border-emerald-500" },
  { type: "email", icon: Mail, label: "E-mail", color: "text-orange-500 bg-orange-500/10 border-orange-500/30 data-[selected=true]:bg-orange-500 data-[selected=true]:text-white data-[selected=true]:border-orange-500" },
  { type: "follow_up", icon: RefreshCw, label: "Follow-up", color: "text-purple-500 bg-purple-500/10 border-purple-500/30 data-[selected=true]:bg-purple-500 data-[selected=true]:text-white data-[selected=true]:border-purple-500" },
];

function defaultScheduledAt() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function NewActivityDialog({ open, onClose, onSubmit, defaultEmail = "" }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ActivityType>("meeting");
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt);
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [meetLink, setMeetLink] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setTitle("");
    setType("meeting");
    setScheduledAt(defaultScheduledAt());
    setContactEmail(defaultEmail);
    setMeetLink("");
    setDescription("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!title.trim() || !scheduledAt) return;
    onSubmit({ title: title.trim(), type, scheduledAt, contactEmail, meetLink, description });
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="bg-card border-card-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Nova atividade</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Título */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Título</label>
            <Input
              autoFocus
              placeholder="Ex: Reunião de apresentação"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="bg-background border-card-border rounded-lg"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Tipo de atividade</label>
            <div className="flex gap-2 flex-wrap">
              {ACTIVITY_TYPES.map(({ type: t, icon: Icon, label, color }) => (
                <button
                  key={t}
                  data-selected={type === t}
                  onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${color}`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Data e hora */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Data e hora</label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="bg-background border-card-border rounded-lg"
            />
          </div>

          {/* E-mail do contato */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">E-mail do contato</label>
            <Input
              type="email"
              placeholder="contato@empresa.com"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              className="bg-background border-card-border rounded-lg"
            />
          </div>

          {/* Link */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Link do Meet / Zoom</label>
            <Input
              type="url"
              placeholder="https://meet.google.com/..."
              value={meetLink}
              onChange={e => setMeetLink(e.target.value)}
              className="bg-background border-card-border rounded-lg"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Descrição</label>
            <Textarea
              placeholder="Descreva os detalhes da atividade..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-background border-card-border rounded-lg min-h-[80px] resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} className="rounded-lg border-card-border">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !scheduledAt}
            className="rounded-lg"
          >
            <Check size={14} className="mr-1.5" />
            Criar atividade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
