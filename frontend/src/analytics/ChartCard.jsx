import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Glass card shell with a title row; shared by the charts and the activity feed. */
export function GlassCard({ title, subtitle, action, dimmed, className, children }) {
  return (
    <section className={cn("glass flex min-w-0 flex-col gap-3 rounded-3xl p-5 transition-opacity", dimmed && "opacity-60", className)}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }) {
  return <div className="flex min-h-52 items-center justify-center text-center text-sm text-muted-foreground">{children}</div>;
}

/**
 * Card around one chart: title, subtitle, the chart, and a "Show table" toggle so every value
 * is readable without hovering. `columns` is [{ key, label, format? }] and `rows` the table data.
 */
export default function ChartCard({ title, subtitle, columns, rows, empty, dimmed, children }) {
  const [table, setTable] = useState(false);
  return (
    <GlassCard
      title={title}
      subtitle={subtitle}
      dimmed={dimmed}
      action={
        rows?.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full text-[13px]"
            onClick={() => setTable((t) => !t)}
            aria-pressed={table}
          >
            {table ? "Show chart" : "Show table"}
          </Button>
        )
      }
    >
      {!rows?.length ? (
        <Empty>{empty}</Empty>
      ) : table ? (
        <ScrollArea className="h-[260px]">
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow>{columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {columns.map((c) => <TableCell key={c.key}>{c.format ? c.format(r[c.key], r) : r[c.key]}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      ) : (
        children
      )}
    </GlassCard>
  );
}
