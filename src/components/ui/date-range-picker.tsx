import { useState } from "react";
import { format, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export type { DateRange };

export interface DateRangeValue {
  from: Date;
  to: Date;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  className?: string;
}

const PRESETS = [
  { label: "Hoje",              from: () => subDays(new Date(), 0),       to: () => new Date() },
  { label: "Últimos 7 dias",    from: () => subDays(new Date(), 6),       to: () => new Date() },
  { label: "Últimos 15 dias",   from: () => subDays(new Date(), 14),      to: () => new Date() },
  { label: "Últimos 3 meses",   from: () => subMonths(new Date(), 3),     to: () => new Date() },
  { label: "Último ano",        from: () => subDays(new Date(), 364),     to: () => new Date() },
  { label: "Todo o histórico",  from: () => new Date("2000-01-01"),       to: () => new Date() },
];

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>({ from: value.from, to: value.to });

  const handleSelect = (range: DateRange | undefined) => {
    if (!range) {
      // react-day-picker retorna undefined quando o usuário clica no mesmo dia
      // que já era o `from` — interpretamos como seleção de dia único
      if (draft.from) {
        const single = { from: draft.from, to: draft.from };
        setDraft(single);
        onChange(single);
      }
      return;
    }

    setDraft(range);

    if (range.from && range.to) {
      // Segundo clique: intervalo completo — aplica mas NÃO fecha
      onChange({ from: range.from, to: range.to });
    }
    // Primeiro clique (só from): mantém o calendário aberto aguardando o segundo
  };

  const handlePreset = (preset: typeof PRESETS[number]) => {
    const range = { from: preset.from(), to: preset.to() };
    setDraft(range);
    onChange(range);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft({ from: value.from, to: value.to });
    setOpen(next);
  };

  const displayText = value.from && value.to
    ? value.from.toDateString() === value.to.toDateString()
      ? format(value.from, "dd/MM/yyyy")
      : `${format(value.from, "dd/MM/yyyy")} - ${format(value.to, "dd/MM/yyyy")}`
    : "Selecionar período";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 h-9 px-3 text-sm bg-card border border-card-border rounded-lg",
            "text-foreground hover:bg-muted/50 transition-colors whitespace-nowrap",
            className,
          )}
        >
          <CalendarIcon size={13} className="text-muted-foreground shrink-0" />
          <span>{displayText}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0 shadow-lg" align="end">
        <div className="flex">
          {/* Presets */}
          <div className="flex flex-col border-r border-border p-3 gap-0.5 min-w-[148px]">
            <p className="text-xs font-semibold text-foreground px-2 pb-2">Selecione</p>
            {PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                className="text-left text-sm px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-foreground"
              >
                {preset.label}
              </button>
            ))}
            {draft.from && !draft.to && (
              <p className="text-xs text-muted-foreground px-2 pt-3">
                Selecione o segundo dia
              </p>
            )}
          </div>

          {/* Calendar */}
          <div className="p-3">
            <Calendar
              mode="range"
              selected={draft}
              onSelect={handleSelect}
              numberOfMonths={2}
              locale={ptBR}
              defaultMonth={subMonths(value.from ?? new Date(), 1)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
