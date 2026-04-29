import { useState, useEffect } from "react";
import { useCRM } from "@/context/CRMContext";
import { Lead } from "@/data/mockData";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";

const DDI_OPTIONS = [
  { code: "+55", flag: "🇧🇷" },
  { code: "+1",  flag: "🇺🇸" },
  { code: "+351",flag: "🇵🇹" },
  { code: "+34", flag: "🇪🇸" },
  { code: "+44", flag: "🇬🇧" },
  { code: "+49", flag: "🇩🇪" },
  { code: "+33", flag: "🇫🇷" },
  { code: "+54", flag: "🇦🇷" },
  { code: "+52", flag: "🇲🇽" },
];

const ORIGINS = ["Instagram", "Facebook Ads", "Indicação", "Site", "Outro"] as const;

const BRASIL_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const empty = {
  name: "",
  tags: [] as string[],
  phoneDdi: "+55",
  whatsapp: "",
  email: "",
  site: "",
  document: "",
  company: "",
  origin: "Outro" as string,
  birthDate: "",
  country: "Brasil",
  zipCode: "",
  address: "",
  addrNumber: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  notes: "",
};

type Form = typeof empty;

interface Props {
  open: boolean;
  onClose: () => void;
  editLead?: Lead | null;
}

export function LeadModal({ open, onClose, editLead }: Props) {
  const { addLead, updateLead, pipelines, nextDealNumber, crmTags } = useCRM();
  const [tab, setTab] = useState("contato");
  const [form, setForm] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTab("contato");
      setForm(editLead ? {
        name:         editLead.name         ?? "",
        tags:         editLead.tags         ?? [],
        phoneDdi:     editLead.phoneDdi     ?? "+55",
        whatsapp:     editLead.whatsapp     ?? "",
        email:        editLead.email        ?? "",
        site:         editLead.site         ?? "",
        document:     editLead.document     ?? "",
        company:      editLead.company      ?? "",
        origin:       editLead.origin       ?? "Outro",
        birthDate:    editLead.birthDate    ?? "",
        country:      editLead.country      ?? "Brasil",
        zipCode:      editLead.zipCode      ?? "",
        address:      editLead.address      ?? "",
        addrNumber:   editLead.addrNumber   ?? "",
        complement:   editLead.complement   ?? "",
        neighborhood: editLead.neighborhood ?? "",
        city:         editLead.city         ?? "",
        state:        editLead.state        ?? "",
        notes:        editLead.notes        ?? "",
      } : empty);
    }
  }, [open, editLead]);

  const set = (k: keyof Form, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const toggleTag = (tag: string) =>
    setForm(p => ({
      ...p,
      tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag],
    }));

  const fetchCep = async (raw: string) => {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setForm(p => ({
          ...p,
          address:      d.logradouro ?? p.address,
          neighborhood: d.bairro     ?? p.neighborhood,
          city:         d.localidade ?? p.city,
          state:        d.uf         ?? p.state,
        }));
      }
    } catch { /* ignore */ } finally {
      setCepLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const patch = {
        name:         form.name,
        tags:         form.tags,
        phoneDdi:     form.phoneDdi   || undefined,
        whatsapp:     form.whatsapp,
        email:        form.email      || undefined,
        site:         form.site       || undefined,
        document:     form.document   || undefined,
        company:      form.company    || undefined,
        origin:       form.origin as Lead["origin"],
        birthDate:    form.birthDate  || undefined,
        country:      form.country    || undefined,
        zipCode:      form.zipCode    || undefined,
        address:      form.address    || undefined,
        addrNumber:   form.addrNumber || undefined,
        complement:   form.complement || undefined,
        neighborhood: form.neighborhood || undefined,
        city:         form.city       || undefined,
        state:        form.state      || undefined,
        notes:        form.notes,
      };

      if (editLead) {
        await updateLead(editLead.id, patch);
        toast.success("Lead atualizado!");
        onClose();
      } else {
        const firstPipeline = pipelines[0];
        const firstCol      = firstPipeline?.columns[0];
        const ok = await addLead({
          ...patch,
          dealNumber:  nextDealNumber(),
          value:       0,
          responsible: "",
          pipelineId:  firstPipeline?.id ?? "",
          stage:       firstCol?.id      ?? "",
          priority:    "Média",
          entryDate:   new Date().toISOString().split("T")[0],
          activities:  [{
            id:          `a-${Date.now()}`,
            date:        new Date().toISOString().split("T")[0],
            type:        "created",
            description: "Lead criado.",
          }],
        });
        if (ok) {
          toast.success("Lead criado!");
          onClose();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[560px] p-0 gap-0 overflow-hidden">

        <DialogHeader className="px-6 pt-5 pb-4 border-b border-[#EEEEEE]">
          <DialogTitle className="text-base font-semibold">
            {editLead ? "Editar Lead" : "Novo Lead"}
          </DialogTitle>
        </DialogHeader>

        {/* ── Campos fixos: Nome + Tags ── */}
        <div className="px-6 pt-5 pb-4 space-y-4 border-b border-[#EEEEEE]">
          <div>
            <label className="text-xs font-medium text-[#666666] mb-1.5 block">Nome *</label>
            <Input
              value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder="Nome completo"
              className="border-[#EEEEEE]"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[#666666] mb-1.5 block">Tags</label>
            <div className="flex flex-wrap gap-2">
              {crmTags.length === 0 && (
                <p className="text-xs text-[#AAAAAA] italic">Crie tags em Configurações → Tags.</p>
              )}
              {crmTags.map(t => {
                const active = form.tags.includes(t.name);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.name)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
                    style={{
                      borderColor: active ? t.color : "#EEEEEE",
                      background:  active ? `${t.color}18` : "transparent",
                      color:       active ? t.color : "#888",
                    }}
                  >
                    {active && <X size={9} />}
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Sub-abas ── */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 mx-6 mt-4 h-9 bg-[#F5F5F5] rounded-lg p-1 shrink-0">
            <TabsTrigger value="contato"  className="text-xs rounded-md">Contato</TabsTrigger>
            <TabsTrigger value="pessoal"  className="text-xs rounded-md">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="endereco" className="text-xs rounded-md">Endereço</TabsTrigger>
            <TabsTrigger value="anotacoes"className="text-xs rounded-md">Anotações</TabsTrigger>
          </TabsList>

          {/* Contato */}
          <TabsContent value="contato" className="px-6 pt-4 pb-2 space-y-4 overflow-y-auto max-h-[260px]">
            <Field label="Telefone">
              <div className="flex gap-2">
                <Select value={form.phoneDdi} onValueChange={v => set("phoneDdi", v)}>
                  <SelectTrigger className="w-[90px] border-[#EEEEEE] text-xs shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DDI_OPTIONS.map(d => (
                      <SelectItem key={d.code} value={d.code} className="text-xs">
                        {d.flag} {d.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={form.whatsapp}
                  onChange={e => set("whatsapp", e.target.value)}
                  placeholder="(11) 99999-0000"
                  className="border-[#EEEEEE] flex-1"
                />
              </div>
            </Field>

            <Field label="E-mail">
              <Input
                type="email"
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="email@exemplo.com"
                className="border-[#EEEEEE]"
              />
            </Field>

            <Field label="Site">
              <Input
                value={form.site}
                onChange={e => set("site", e.target.value)}
                placeholder="https://exemplo.com"
                className="border-[#EEEEEE]"
              />
            </Field>
          </TabsContent>

          {/* Dados Pessoais */}
          <TabsContent value="pessoal" className="px-6 pt-4 pb-2 space-y-4 overflow-y-auto max-h-[260px]">
            <Field label="Documento (CPF / CNPJ)">
              <Input
                value={form.document}
                onChange={e => set("document", e.target.value)}
                placeholder="000.000.000-00"
                className="border-[#EEEEEE]"
              />
            </Field>

            <Field label="Empresa">
              <Input
                value={form.company}
                onChange={e => set("company", e.target.value)}
                placeholder="Nome da empresa"
                className="border-[#EEEEEE]"
              />
            </Field>

            <Field label="Origem">
              <Select value={form.origin} onValueChange={v => set("origin", v)}>
                <SelectTrigger className="border-[#EEEEEE]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORIGINS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Data de Nascimento">
              <Input
                type="date"
                value={form.birthDate}
                onChange={e => set("birthDate", e.target.value)}
                className="border-[#EEEEEE]"
              />
            </Field>
          </TabsContent>

          {/* Endereço */}
          <TabsContent value="endereco" className="px-6 pt-4 pb-2 space-y-4 overflow-y-auto max-h-[260px]">
            <Field label="País">
              <Input
                value={form.country}
                onChange={e => set("country", e.target.value)}
                placeholder="Brasil"
                className="border-[#EEEEEE]"
              />
            </Field>

            <Field label="CEP">
              <div className="relative">
                <Input
                  value={form.zipCode}
                  onChange={e => { set("zipCode", e.target.value); fetchCep(e.target.value); }}
                  placeholder="00000-000"
                  maxLength={9}
                  className="border-[#EEEEEE] pr-8"
                />
                {cepLoading && (
                  <Loader2 size={14} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Endereço">
                  <Input value={form.address} onChange={e => set("address", e.target.value)} placeholder="Rua, Av..." className="border-[#EEEEEE]" />
                </Field>
              </div>
              <Field label="Número">
                <Input value={form.addrNumber} onChange={e => set("addrNumber", e.target.value)} placeholder="123" className="border-[#EEEEEE]" />
              </Field>
            </div>

            <Field label="Complemento">
              <Input value={form.complement} onChange={e => set("complement", e.target.value)} placeholder="Apto, sala..." className="border-[#EEEEEE]" />
            </Field>

            <Field label="Bairro">
              <Input value={form.neighborhood} onChange={e => set("neighborhood", e.target.value)} placeholder="Bairro" className="border-[#EEEEEE]" />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Cidade">
                  <Input value={form.city} onChange={e => set("city", e.target.value)} placeholder="Cidade" className="border-[#EEEEEE]" />
                </Field>
              </div>
              <Field label="UF">
                <Select value={form.state} onValueChange={v => set("state", v)}>
                  <SelectTrigger className="border-[#EEEEEE]"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {BRASIL_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </TabsContent>

          {/* Anotações */}
          <TabsContent value="anotacoes" className="px-6 pt-4 pb-2 overflow-y-auto max-h-[260px]">
            <Textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Adicione informações relevantes sobre este lead..."
              className="border-[#EEEEEE] min-h-[200px] resize-none"
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-6 py-4 mt-2 border-t border-[#EEEEEE] gap-2">
          <Button variant="outline" onClick={onClose} className="border-[#EEEEEE]">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#128A68] hover:bg-[#128A68]/90"
          >
            {saving ? "Salvando..." : editLead ? "Salvar alterações" : "Criar Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-[#666666] mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
