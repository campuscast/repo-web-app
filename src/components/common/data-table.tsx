import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DataTableProps = {
  toolbar?: ReactNode;
  children: ReactNode;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function DataTable({
  toolbar,
  children,
  total,
  page,
  pageSize,
  onPageChange,
  className
}: DataTableProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className={cn('overflow-hidden', className)}>
      {toolbar ? <div className="border-b px-4 py-3">{toolbar}</div> : null}
      <CardContent className="p-0">{children}</CardContent>
      <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Page {page} of {pageCount} ({total} rows)
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            <ChevronLeft className="size-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
