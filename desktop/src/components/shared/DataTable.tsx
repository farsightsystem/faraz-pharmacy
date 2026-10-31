import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortKey?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (sortKey: string) => void;
}

export default function DataTable<T>({
  columns,
  data,
  loading,
  keyExtractor,
  onRowClick,
  emptyMessage,
  sortBy,
  sortOrder,
  onSort,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col.key}>
                  <Skeleton className="h-4 w-full max-w-[100px]" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-surface shadow-xs overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-2/40 hover:bg-surface-2/40">
            {columns.map((col) => {
              const isSortable = col.sortable && !!onSort;
              const fieldKey = col.sortKey || col.key;
              const isCurrent = sortBy === fieldKey;

              return (
                <TableHead key={col.key} className={col.className}>
                  {isSortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(fieldKey)}
                      className="group inline-flex items-center gap-1.5 font-medium hover:text-text-primary transition-colors cursor-pointer select-none text-left"
                    >
                      <span>{col.header}</span>
                      {isCurrent ? (
                        sortOrder === "asc" ? (
                          <ArrowUp className="h-3 w-3 text-brand shrink-0" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-brand shrink-0" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-text-tertiary/40 group-hover:text-text-secondary shrink-0 transition-opacity opacity-0 group-hover:opacity-100" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center text-text-secondary py-12 text-xs"
              >
                {emptyMessage || "No data found"}
              </TableCell>
            </TableRow>
          ) : (
            data.map((item, idx) => (
              <TableRow
                key={keyExtractor(item)}
                className={cn(
                  onRowClick && "cursor-pointer",
                  idx % 2 === 0 ? "bg-surface" : "bg-surface-2/25"
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
