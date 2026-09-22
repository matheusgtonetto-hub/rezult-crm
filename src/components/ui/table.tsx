import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      {/* text-sm é o corpo do sistema (14px). Células que ainda pedem 13px ou
          10px por classe própria são herança de tela, e caem nas ondas 4 a 6. */}
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      /* 44px no cabeçalho (o corpo é 48). Sem isto ele herdava o h-12 do
         TableRow e os dois ficavam da mesma altura.
         A divisória do cabeçalho é a borda padrão (#E7E7E7), mais forte que a
         do corpo (#F2F2F2): é ela que marca onde a tabela começa. */
      className={cn("[&_tr]:h-11 [&_tr]:border-b [&_tr]:border-[color:var(--border-default)]", className)}
      {...props}
    />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      // Selecionado é emerald claro (--surface-selected), não cinza: é o estado
      // "selecionado" do design system, o mesmo da linha de tabela e do item de
      // menu. O hover segue neutro para os dois estados não se confundirem.
      /* h-12 = 48px, a linha da densidade confortável (decisão D8). Em tabela,
         `height` é piso e não teto: célula com duas linhas de texto cresce. A
         divisória usa --neutral-100, mais leve que a borda de cartão. */
      className={cn(
        "h-12 border-b border-[color:var(--neutral-100)] transition-colors hover:bg-[color:var(--surface-hover)] data-[state=selected]:bg-[color:var(--surface-selected)] data-[state=selected]:hover:bg-[color:var(--accent-200)]",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      /* Cabeçalho: 13px Medium em cinza, SEM fundo tingido. Quem separa do
         corpo é a linha de 1px na borda de baixo (ver TableHeader), como no
         DataTable do design system. O tint que estava aqui dava 1,07:1 contra
         o cartão branco: existia no código e não na tela. */
      className={cn(
        "px-4 text-left align-middle text-[13px] font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    /* O respiro vertical sai do px-4 mais a altura da linha: com p-4 nos dois
       eixos, uma linha de uma frase virava 56px e a de duas, 72px. */
    <td ref={ref} className={cn("px-4 py-2 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
