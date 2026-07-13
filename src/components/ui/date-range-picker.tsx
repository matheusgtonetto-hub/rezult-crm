import { useState } from "react";
import { format, subDays, subMonths, isSameDay } from "date-fns";
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
  dataFrom?: Date;
  dataTo?: Date;
}

const CUSTOM_KEY = "__custom__";

export function DateRangePicker({ value, onChange, className, dataFrom, dataTo }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>({ from: value.from, to: value.to });
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const presets = [
    {
      key: "este_mes",
      label: "Este mês",
      from: () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      to:   () => new Date(),
    },
    {
      key: "mes_passado",
      label: "Mês passado",
      from: () => new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
      to:   () => new Date(new Date().getFullYear(), new Date().getMonth(), 0),
    },
    {
      key: "ultimos_6",
      label: "Últimos 6 meses",
      from: () => subMonths(new Date(), 6),
      to:   () => new Date(),
    },
    {
      key: "este_ano",
      label: "Este ano",
      from: () => new Date(new Date().getFullYear(), 0, 1),
      to:   () => new Date(),
    },
    {
      key: "ano_passado",
      label: "Ano passado",
      from: () => new Date(new Date().getFullYear() - 1, 0, 1),
      to:   () => new Date(new Date().getFullYear() - 1, 11, 31),
    },
    {
      key: "hoje",
      label: "Hoje",
      from: () => new Date(),
      to:   () => new Date(),
    },
    {
      key: "ultimos_7",
      label: "Últimos 7 dias",
      from: () => subDays(new Date(), 6),
      to:   () => new Date(),
    },
    {
      key: "ultimos_15",
      label: "Últimos 15 dias",
      from: () => subDays(new Date(), 14),
      to:   () => new Date(),
    },
    {
      key: "historico",
      label: "Todo histórico",
      from: () => dataFrom ?? new Date("2000-01-01"),
      to:   () => dataTo   ?? new Date(),
    },
  ];

  const handleSelect = (range: DateRange | undefined) => {
    if (!range) {
      if (draft.from) {
        const single = { from: draft.from, to: draft.from };
        setDraft(single);
        onChange(single);
        setActiveKey(CUSTOM_KEY);
      }
      return;
    }

    setDraft(range);

    if (range.from && range.to) {
      onChange({ from: range.from, to: range.to });
      // Verifica se coincide com algum preset; senão, marca como personalizado
      const matched = presets.find(p =>
        isSameDay(p.from(), range.from!) && isSameDay(p.to(), range.to!)
      );
      setActiveKey(matched ? matched.key : CUSTOM_KEY);
    }
  };

  const handlePreset = (preset: typeof presets[number]) => {
    const range = { from: preset.from(), to: preset.to() };
    setDraft(range);
    onChange(range);
    setActiveKey(preset.key);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft({ from: value.from, to: value.to });
      const matched = presets.find(p =>
        isSameDay(p.from(), value.from) && isSameDay(p.to(), value.to)
      );
      setActiveKey(matched ? matched.key : CUSTOM_KEY);
    }
    setOpen(next);
  };

  const displayText = value.from && value.to
    ? value.from.toDateString() === value.to.toDateString()
      ? format(value.from, "dd/MM/yyyy")
      : `${format(value.from, "dd/MM/yyyy")} - ${format(value.to, "dd/MM/yyyy")}`
    : "Selecionar período";

  const activeClass = "bg-success/15 text-success font-medium";
  const idleClass   = "text-foreground hover:bg-muted";

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
          <div className="flex flex-col border-r border-border p-3 gap-[2px] min-w-[160px]">
            <p className="text-xs font-semibold text-foreground px-2 pb-2">Selecione</p>

            {presets.map(preset => (
              <button
                key={preset.key}
                onClick={() => handlePreset(preset)}
                className={cn(
                  "text-left text-[12px] px-2 py-0.5 rounded-md transition-colors",
                  activeKey === preset.key ? activeClass : idleClass,
                )}
              >
                {preset.label}
              </button>
            ))}

            <div
              className={cn(
                "text-left text-[12px] px-2 py-0.5 rounded-md mt-0.5",
                activeKey === CUSTOM_KEY ? activeClass : "text-muted-foreground",
              )}
            >
              Período personalizado
            </div>

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
