import { cn } from '../../utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-gray-100 text-gray-700': variant === 'default',
          'bg-green-100 text-green-700': variant === 'success',
          'bg-red-100 text-red-700': variant === 'danger',
          'bg-yellow-100 text-yellow-700': variant === 'warning',
          'bg-blue-100 text-blue-700': variant === 'info',
        },
        className
      )}
    >
      {children}
    </span>
  );
}
