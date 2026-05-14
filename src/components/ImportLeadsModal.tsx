import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { useCRM } from "@/context/CRMContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

const NONE = "__none__";

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const NAME_KEYS   = ["nome", "name", "cliente", "lead", "razao social", "razao"];
const PHONE_KEYS  = ["telefone", "celular", "fone", "whatsapp", "phone", "mobile", "tel", "contato", "numero", "num"];
const EMAIL_KEYS  = ["email", "e-mail", "correio", "mail"];

function autoDetect(headers: string[], keys: string[]) {
  const idx = headers.findIndex(h => keys.some(k => normalize(h).includes(k)));
  return idx >= 0 ? String(idx) : NONE;
}

function toPhoneString(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  // Excel stores phones as numbers — convert and re-add leading zero if needed
  if (typeof val === "number") {
    const s = Math.round(val).toString();
    // Brazilian numbers: 10–11 digits without country code
    return s;
  }
  return String(val).trim();
}

export function ImportLeadsModal({ open, onClose }: Props) {
  const { pipelines, crmTags, addLead, leads: existingLeads } = useCRM();

  const [file, setFile]           = useState<File | null>(null);
  const [headers, setHeaders]     = useState<string[]>([]);
  const [rows, setRows]           = useState<unknown[][]>([]);
  const [parseError, setParseError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Column mapping
  const [nameCol,  setNameCol]  = useState(NONE);
  const [phoneCol, setPhoneCol] = useState(NONE);
  const [emailCol, setEmailCol] = useState(NONE);

  // Destination
  const [pipelineId, setPipelineId] = useState(() => pipelines[0]?.id ?? "");
  const [stageId,    setStageId]    = useState(() => pipelines[0]?.columns[0]?.id ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const selectedPipeline = pipelines.find(p => p.id === pipelineId) ?? pipelines[0] ?? null;

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setHeaders([]);
    setRows([]);
    setParseError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const all  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

        if (!all || all.length < 2) {
          setParseError("Arquivo vazio ou sem dados.");
          return;
        }

        const hdrs = (all[0] as unknown[]).map(h => String(h ?? "").trim());
        const dataRows = all.slice(1).filter(r => (r as unknown[]).some(c => c !== ""));

        if (dataRows.length === 0) {
          setParseError("Nenhuma linha de dados encontrada.");
          return;
        }

        setHeaders(hdrs);
        setRows(dataRows);
        setNameCol(autoDetect(hdrs, NAME_KEYS));
        setPhoneCol(autoDetect(hdrs, PHONE_KEYS));
        setEmailCol(autoDetect(hdrs, EMAIL_KEYS));
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

  const toggleTag = (name: string) =>
    setSelectedTags(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);

  const previewLeads = rows.slice(0, 3).map(row => ({
    name:  nameCol  !== NONE ? String((row as unknown[])[+nameCol]  ?? "").trim() : "",
    phone: phoneCol !== NONE ? toPhoneString((row as unknown[])[+phoneCol]) : "",
    email: emailCol !== NONE ? String((row as unknown[])[+emailCol] ?? "").trim() : "",
  }));

  const handleImport = async () => {
    if (!rows.length) return;
    if (!pipelineId || !stageId) { toast.error("Selecione um pipeline e uma etapa."); return; }
    if (nameCol === NONE && phoneCol === NONE) {
      toast.error("Mapeie ao menos a coluna de Nome ou Telefone.");
      return;
    }

    setImporting(true);
    const maxNum = Math.max(...Object.values(existingLeads).map(l => l.dealNumber ?? 0), 1000);
    let ok = 0;

    for (let i = 0; i < rows.length; i++) {
      const row   = rows[i] as unknown[];
      const name  = nameCol  !== NONE ? String(row[+nameCol]  ?? "").trim() : "";
      const phone = phoneCol !== NONE ? toPhoneString(row[+phoneCol]) : "";
      const email = emailCol !== NONE ? String(row[+emailCol] ?? "").trim() : "";

      const displayName = name || phone || email;
      if (!displayName) continue;

      const success = await addLead({
        dealNumber: maxNum + i + 1,
        name: displayName,
        whatsapp: phone.replace(/\D/g, ""),
        phoneDdi: "+55",
        email: email || undefined,
        emails: email ? [email] : [],
        company: undefined, site: undefined,
        value: 0, responsible: "",
        pipelineId, stage: stageId,
        priority: "Média", origin: "Outro",
        productId: undefined,
        entryDate: new Date().toISOString().split("T")[0],
        nextFollowUp: undefined, notes: "",
        tags: selectedTags,
        document: undefined, birthDate: undefined,
        country: undefined, zipCode: undefined,
        address: undefined, addrNumber: undefined,
        complement: undefined, neighborhood: undefined,
        city: undefined, state: undefined,
        dealStatus: "open", lossReasonId: undefined,
        customFieldValues: {}, activities: [],
      });
      if (success) ok++;
    }

    setImporting(false);
    toast.success(`${ok} lead${ok !== 1 ? "s" : ""} importado${ok !== 1 ? "s" : ""} com sucesso!`);
    handleClose();
  };

  const handleClose = () => {
    setFile(null); setHeaders([]); setRows([]); setParseError("");
    setNameCol(NONE); setPhoneCol(NONE); setEmailCol(NONE);
    setSelectedTags([]);
    setPipelineId(pipelines[0]?.id ?? "");
    setStageId(pipelines[0]?.columns[0]?.id ?? "");
    onClose();
  };

  const colOptions = (
    <>
      <SelectItem value={NONE}>— não mapear —</SelectItem>
      {headers.map((h, i) => (
        <SelectItem key={i} value={String(i)}>{h || `Coluna ${i + 1}`}</SelectItem>
      ))}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar lista de leads</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* Upload zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              isDragging ? "border-[#128A68] bg-[#E1F5EE]"
                        : "border-[#EEEEEE] hover:border-[#128A68] hover:bg-[#F8FDFB]"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
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
                <p className="text-sm font-semibold text-[#128A68]">
                  {rows.length} linha{rows.length !== 1 ? "s" : ""} encontrada{rows.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-[#AAAAAA] mt-0.5">{file.name}</p>
              </>
            )}
          </div>

          {/* Column mapping */}
          {headers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-[#333]">
                Mapeamento de colunas
                <span className="text-[#AAAAAA] font-normal ml-1">— confirme ou ajuste a detecção automática</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Nome", value: nameCol,  set: setNameCol },
                  { label: "Telefone", value: phoneCol, set: setPhoneCol },
                  { label: "E-mail", value: emailCol,  set: setEmailCol },
                ].map(({ label, value, set }) => (
                  <div key={label} className="space-y-1">
                    <label className="text-[11px] font-medium text-[#666]">{label}</label>
                    <Select value={value} onValueChange={set}>
                      <SelectTrigger className="h-8 text-xs rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>{colOptions}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && (
            <div className="rounded-lg border border-[#EEEEEE] overflow-hidden">
              <div className="bg-[#F8F8F8] px-3 py-2 text-xs font-medium text-[#555] border-b border-[#EEEEEE]">
                Pré-visualização
              </div>
              <div className="divide-y divide-[#F0F0F0]">
                {previewLeads.map((l, i) => (
                  <div key={i} className="px-3 py-2 text-xs text-[#444] flex gap-3">
                    <span className="font-medium truncate flex-1 min-w-0">{l.name || <span className="text-[#CCC]">—</span>}</span>
                    <span className="text-[#888] shrink-0 w-28">{l.phone || <span className="text-[#CCC]">—</span>}</span>
                    <span className="text-[#888] truncate max-w-[120px]">{l.email || <span className="text-[#CCC]">—</span>}</span>
                  </div>
                ))}
                {rows.length > 3 && (
                  <div className="px-3 py-1.5 text-xs text-[#AAAAAA]">
                    + {rows.length - 3} linha{rows.length - 3 !== 1 ? "s" : ""} a mais...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pipeline */}
          {rows.length > 0 && (
            <>
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

              {crmTags.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[#333]">
                    Tags <span className="text-[#AAAAAA] font-normal">(opcional)</span>
                  </label>
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
                            background:   active ? tag.color + "22" : "transparent",
                            borderColor:  active ? tag.color : "#DDDDDD",
                            color:        active ? tag.color : "#666",
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
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importing}>Cancelar</Button>
          <Button
            onClick={handleImport}
            disabled={!rows.length || importing || !pipelineId || !stageId}
            className="bg-[#128A68] hover:bg-[#128A68]/90 min-w-[140px]"
          >
            {importing
              ? "Importando..."
              : rows.length
                ? `Importar ${rows.length} lead${rows.length !== 1 ? "s" : ""}`
                : "Importar leads"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
