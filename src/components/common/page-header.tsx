import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ description, actions, className }: PageHeaderProps) {
  if (!description && !actions) return null;

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : <div />}
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
