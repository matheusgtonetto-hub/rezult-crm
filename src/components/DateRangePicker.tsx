import { useState } from "react";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, startOfWeek, endOfWeek,
  isSameDay, isWithinInterval, isBefore,
  subDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  dateFrom: string;
  dateTo: string;
  onChangeRange: (from: string, to: string) => void;
}

const PRESETS = [
  { label: "Hoje", fn: () => { const t = new Date(); return [t, t] as [Date, Date]; } },
  { label: "Últimos 7 dias", fn: () => { const t = new Date(); return [subDays(t, 6), t] as [Date, Date]; } },
  { label: "Últimos 15 dias", fn: () => { const t = new Date(); return [subDays(t, 14), t] as [Date, Date]; } },
  { label: "Últimos 3 meses", fn: () => { const t = new Date(); return [subMonths(t, 3), t] as [Date, Date]; } },
  { label: "Último ano", fn: () => { const t = new Date(); return [subMonths(t, 12), t] as [Date, Date]; } },
];

export function DateRangePicker({ dateFrom, dateTo, onChangeRange }: Props) {
  const [open, setOpen] = useState(false);
  const [leftMonth, setLeftMonth] = useState(() => new Date());
  const [picking, setPicking] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);

  const rightMonth = addMonths(leftMonth, 1);

  const parseStr = (s: string): Date | null =>
    s ? new Date(s + "T12:00:00") : null;

  const from = parseStr(dateFrom);
  const to = parseStr(dateTo);

  function applyRange(a: Date, b: Date) {
    const [f, t2] = isBefore(a, b) ? [a, b] : [b, a];
    onChangeRange(format(f, "yyyy-MM-dd"), format(t2, "yyyy-MM-dd"));
  }

  function handleClick(day: Date) {
    if (!picking) {
      setPicking(day);
    } else {
      applyRange(picking, day);
      setPicking(null);
      setOpen(false);
    }
  }

  function dayStatus(day: Date) {
    const anchor = picking ?? from;
    const tip = picking ? (hover ?? picking) : to;

    if (!anchor) return { isStart: false, isEnd: false, inRange: false };

    const rangeFrom = tip && isBefore(anchor, tip) ? anchor : tip ?? anchor;
    const rangeTo = tip && isBefore(anchor, tip) ? tip : anchor;

    const isStart = isSameDay(day, rangeFrom);
    const isEnd = tip ? isSameDay(day, rangeTo) : false;
    const inRange = tip
      ? isWithinInterval(day, { start: rangeFrom, end: rangeTo })
      : isSameDay(day, anchor);

    return { isStart, isEnd, inRange };
  }

  function renderMonth(month: Date) {
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);
    const days = eachDayOfInterval({
      start: startOfWeek(mStart, { weekStartsOn: 0 }),
      end: endOfWeek(mEnd, { weekStartsOn: 0 }),
    });

    return (
      <div className="w-[228px]">
        <div className="grid grid-cols-7 mb-1">
          {["dom", "seg", "ter", "qua", "qui", "sex", "sab"].map(d => (
            <div key={d} className="text-center text-[11px] text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const { isStart, isEnd, inRange } = dayStatus(day);
            const isOther = day.getMonth() !== month.getMonth();
            const isSelected = isStart || isEnd;
            const showRangeBg = inRange && !isSelected;
            const showLeftHalf = isEnd && inRange && !isStart;
            const showRightHalf = isStart && inRange && !isEnd;

            return (
              <div
                key={i}
                className="relative h-9 flex items-center justify-center cursor-pointer select-none"
                onMouseEnter={() => picking && setHover(day)}
                onMouseLeave={() => picking && setHover(null)}
                onClick={() => handleClick(day)}
              >
                {showRangeBg && <div className="absolute inset-y-[4px] inset-x-0 bg-blue-50" />}
                {showLeftHalf && <div className="absolute inset-y-[4px] left-0 right-[50%] bg-blue-50" />}
                {showRightHalf && <div className="absolute inset-y-[4px] left-[50%] right-0 bg-blue-50" />}
                <span className={[
                  "relative z-10 w-8 h-8 flex items-center justify-center rounded-full text-xs",
                  isSelected ? "bg-blue-500 text-white font-semibold" : "",
                  !isSelected && !isOther ? "hover:bg-gray-100" : "",
                  isOther ? "text-muted-foreground/40" : "text-foreground",
                ].join(" ")}>
                  {format(day, "d")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const capMonth = (d: Date) =>
    format(d, "MMMM", { locale: ptBR }).replace(/^\w/, c => c.toUpperCase());

  const triggerText = dateFrom && dateTo
    ? `${format(parseStr(dateFrom)!, "dd/MM/yy")} — ${format(parseStr(dateTo)!, "dd/MM/yy")}`
    : dateFrom
    ? format(parseStr(dateFrom)!, "dd/MM/yy")
    : "Selecionar período";

  return (
    <Popover open={open} onOpenChange={v => { setOpen(v); if (!v) setPicking(null); }}>
      <PopoverTrigger asChild>
        <button className="h-[30px] px-3 bg-card border border-input rounded-lg text-xs text-foreground flex items-center gap-1.5 hover:border-primary transition-colors whitespace-nowrap">
          {triggerText}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 shadow-lg" align="start">
        <div className="flex">
          {/* Presets */}
          <div className="w-40 border-r border-border p-3 flex flex-col shrink-0">
            <div className="text-xs font-semibold text-foreground mb-3">Selecione</div>
            {PRESETS.map(p => (
              <button
                key={p.label}
                className="text-left text-sm px-2 py-2 rounded hover:bg-muted transition-colors text-foreground"
                onClick={() => {
                  const [f, t2] = p.fn();
                  applyRange(f, t2);
                  setPicking(null);
                  setOpen(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendars */}
          <div className="p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setLeftMonth(m => subMonths(m, 1))}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex gap-[72px]">
                <span className="text-sm font-semibold w-[228px] text-center">
                  {capMonth(leftMonth)} {format(leftMonth, "yyyy")}
                </span>
                <span className="text-sm font-semibold w-[228px] text-center">
                  {capMonth(rightMonth)} {format(rightMonth, "yyyy")}
                </span>
              </div>
              <button
                onClick={() => setLeftMonth(m => addMonths(m, 1))}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="flex gap-6">
              {renderMonth(leftMonth)}
              <div className="w-px bg-border shrink-0" />
              {renderMonth(rightMonth)}
            </div>
          </div>
        </div>

        <div className="border-t border-border p-3 flex justify-between items-center">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { onChangeRange("", ""); setPicking(null); setOpen(false); }}
          >
            Limpar filtro
          </button>
          <button
            className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            onClick={() => setOpen(false)}
          >
            Aplicar
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
