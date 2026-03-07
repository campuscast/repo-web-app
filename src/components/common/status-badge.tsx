import { Badge } from '@/components/ui/badge';

type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const VARIANT_BY_TONE: Record<StatusTone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  success: 'default',
  warning: 'secondary',
  danger: 'destructive',
  neutral: 'outline'
};

const CLASS_BY_TONE: Record<StatusTone, string> = {
  success: '',
  warning: '',
  danger: '',
  neutral: ''
};

export function StatusBadge({
  label,
  tone = 'neutral'
}: {
  label: string;
  tone?: StatusTone;
}) {
  return (
    <Badge variant={VARIANT_BY_TONE[tone]} className={CLASS_BY_TONE[tone]}>
      {label}
    </Badge>
  );
}
