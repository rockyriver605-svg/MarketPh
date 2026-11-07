import { type ReactNode } from 'react';
import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-400">
        {icon ?? <PackageOpen className="h-8 w-8" />}
      </div>
      <h3 className="text-lg font-semibold text-brand-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-brand-500 max-w-sm mb-6">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
