import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { useCRM } from "@/context/CRMContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface ParsedLead {
  name: string;
  phone: string;
  email: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

// Maps common column names (PT + EN) to our fields
const NAME_KEYS   = ["nome", "name", "contato", "cliente", "lead"];
const PHONE_KEYS  = ["telefone", "celular", "fone", "whatsapp", "phone", "mobile", "tel"];
const EMAIL_KEYS  = ["email", "e-mail", "correio", "mail"];

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function matchKey(header: string, keys: string[]) {
  const h = normalize(header);
  return keys.some(k => h.includes(k));
}

function parseSheet(data: unknown[][]): ParsedLead[] {
  if (!data || data.length < 2) return [];

  const headers = (data[0] as string[]).map(String);
  const nameIdx  = headers.findIndex(h => matchKey(h, NAME_KEYS));
  const phoneIdx = headers.findIndex(h => matchKey(h, PHONE_KEYS));
  const emailIdx = headers.findIndex(h => matchKey(h, EMAIL_KEYS));

  const leads: ParsedLead[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    const name  = nameIdx  >= 0 ? String(row[nameIdx]  ?? "").trim() : "";
    const phone = phoneIdx >= 0 ? String(row[phoneIdx] ?? "").trim() : "";
    const email = emailIdx >= 0 ? String(row[emailIdx] ?? "").trim() : "";
    if (name || phone || email) leads.push({ name: name || phone || email, phone, email });
  }
  return leads;
}

export function ImportLeadsModal({ open, onClose }: Props) {
  const { pipelines, crmTags, addLead, nextDealNumber, leads: existingLeads } = useCRM();

  const [file, setFile]               = useState<File | null>(null);
  const [parsed, setParsed]           = useState<ParsedLead[]>([]);
  const [parseError, setParseError]   = useState("");
  const [isDragging, setIsDragging]   = useState(false);
  const [pipelineId, setPipelineId]   = useState(() => pipelines[0]?.id ?? "");
  const [stageId, setStageId]         = useState(() => pipelines[0]?.columns[0]?.id ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [importing, setImporting]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedPipeline = pipelines.find(p => p.id === pipelineId) ?? pipelines[0] ?? null;

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setParsed([]);
    setParseError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        const leads = parseSheet(rows);
        if (leads.length === 0) {
          setParseError("Nenhum lead encontrado. Verifique se o arquivo tem as colunas: Nome, Telefone, E-mail.");
        } else {
          setParsed(leads);
        }
      } catch {
        setParseError("Não foi possível ler o arquivo. Use .xlsx, .xls ou .csv.");
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const toggleTag = (id: string) => {
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const handleImport = async () => {
    if (!parsed.length) return;
    if (!pipelineId || !stageId) { toast.error("Selecione um pipeline e uma etapa."); return; }

    setImporting(true);
    const maxNum = Math.max(...Object.values(existingLeads).map(l => l.dealNumber ?? 0), 1000);
    let ok = 0;

    for (let i = 0; i < parsed.length; i++) {
      const lead = parsed[i];
      const success = await addLead({
        dealNumber: maxNum + i + 1,
        name: lead.name,
        whatsapp: lead.phone.replace(/\D/g, ""),
        phoneDdi: "+55",
        email: lead.email || undefined,
        emails: lead.email ? [lead.email] : [],
        company: undefined,
        site: undefined,
        value: 0,
        responsible: "",
        pipelineId,
        stage: stageId,
        priority: "Média",
        origin: "Outro",
        productId: undefined,
        entryDate: new Date().toISOString().split("T")[0],
        nextFollowUp: undefined,
        notes: "",
        tags: selectedTags,
        document: undefined,
        birthDate: undefined,
        country: undefined,
        zipCode: undefined,
        address: undefined,
        addrNumber: undefined,
        complement: undefined,
        neighborhood: undefined,
        city: undefined,
        state: undefined,
        dealStatus: "open",
        lossReasonId: undefined,
        customFieldValues: {},
        activities: [],
      });
      if (success) ok++;
    }

    setImporting(false);
    toast.success(`${ok} lead${ok !== 1 ? "s" : ""} importado${ok !== 1 ? "s" : ""} com sucesso!`);
    handleClose();
  };

  const handleClose = () => {
    setFile(null);
    setParsed([]);
    setParseError("");
    setSelectedTags([]);
    setPipelineId(pipelines[0]?.id ?? "");
    setStageId(pipelines[0]?.columns[0]?.id ?? "");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar lista de leads</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* File upload */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              isDragging ? "border-[#128A68] bg-[#E1F5EE]" : "border-[#EEEEEE] hover:border-[#128A68] hover:bg-[#F8FDFB]"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {!file ? (
              <>
                <Upload size={28} className="mx-auto mb-2 text-[#128A68]" />
                <p className="text-sm font-medium text-[#333]">Arraste o arquivo aqui ou clique para selecionar</p>
                <p className="text-xs text-[#AAAAAA] mt-1">Suporta .xlsx, .xls e .csv</p>
              </>
            ) : parseError ? (
              <>
                <AlertCircle size={28} className="mx-auto mb-2 text-red-500" />
                <p className="text-sm font-medium text-red-600">{parseError}</p>
                <p className="text-xs text-[#AAAAAA] mt-1">{file.name}</p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <FileSpreadsheet size={22} className="text-[#128A68]" />
                  <CheckCircle2 size={18} className="text-[#128A68]" />
                </div>
                <p className="text-sm font-semibold text-[#128A68]">{parsed.length} lead{parsed.length !== 1 ? "s" : ""} encontrado{parsed.length !== 1 ? "s" : ""}</p>
                <p className="text-xs text-[#AAAAAA] mt-0.5">{file.name}</p>
              </>
            )}
          </div>

          {/* Pipeline */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#333]">Pipeline</label>
            <Select
              value={pipelineId}
              onValueChange={id => {
                setPipelineId(id);
                const p = pipelines.find(p => p.id === id);
                setStageId(p?.columns[0]?.id ?? "");
              }}
            >
              <SelectTrigger className="h-9 text-sm rounded-lg">
                <SelectValue placeholder="Selecione o pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stage */}
          {selectedPipeline && selectedPipeline.columns.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#333]">Etapa</label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="h-9 text-sm rounded-lg">
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {selectedPipeline.columns.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tags */}
          {crmTags.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#333]">Tags <span className="text-[#AAAAAA] font-normal">(opcional)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {crmTags.map(tag => {
                  const active = selectedTags.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.name)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
                      style={{
                        background: active ? tag.color + "22" : "transparent",
                        borderColor: active ? tag.color : "#DDDDDD",
                        color: active ? tag.color : "#666",
                      }}
                    >
                      {active && <X size={10} />}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview */}
          {parsed.length > 0 && (
            <div className="rounded-lg border border-[#EEEEEE] overflow-hidden">
              <div className="bg-[#F8F8F8] px-3 py-2 text-xs font-medium text-[#555] border-b border-[#EEEEEE]">
                Pré-visualização (primeiras 3 linhas)
              </div>
              <div className="divide-y divide-[#F0F0F0]">
                {parsed.slice(0, 3).map((l, i) => (
                  <div key={i} className="px-3 py-2 text-xs text-[#444] flex gap-4">
                    <span className="font-medium truncate flex-1">{l.name}</span>
                    {l.phone && <span className="text-[#888] shrink-0">{l.phone}</span>}
                    {l.email && <span className="text-[#888] truncate max-w-[140px]">{l.email}</span>}
                  </div>
                ))}
                {parsed.length > 3 && (
                  <div className="px-3 py-2 text-xs text-[#AAAAAA]">
                    + {parsed.length - 3} mais...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!parsed.length || importing || !pipelineId || !stageId}
            className="bg-[#128A68] hover:bg-[#128A68]/90 min-w-[140px]"
          >
            {importing
              ? "Importando..."
              : parsed.length
                ? `Importar ${parsed.length} lead${parsed.length !== 1 ? "s" : ""}`
                : "Importar leads"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
