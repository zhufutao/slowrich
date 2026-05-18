import { cn } from '../../utils/cn';

interface ProgressBarProps {
  value: number;
  className?: string;
  size?: 'sm' | 'md';
}

export function ProgressBar({ value, className, size = 'md' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('w-full bg-gray-200 rounded-full overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all duration-500',
          clamped >= 100 ? 'bg-green-500' : 'bg-primary-600'
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
