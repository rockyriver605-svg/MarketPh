import { AlertCircle, CheckCircle2 } from 'lucide-react';

export type ToastTone = 'success' | 'error';

interface ToastProps {
  message: string;
  tone: ToastTone;
}

export function Toast({ message, tone }: ToastProps) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  const toneClasses = tone === 'success'
    ? 'bg-brand-900 text-white'
    : 'bg-red-700 text-white';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg animate-fade-in ${toneClasses}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
