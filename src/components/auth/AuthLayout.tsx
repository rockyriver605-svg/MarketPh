import type { ReactNode } from 'react';
import { ArrowLeft, Store } from 'lucide-react';
import { navigate } from '@/lib/router';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12 animate-fade-in">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-brand-100 p-8">
          <div className="flex flex-col items-center mb-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white mb-3">
              <Store className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
            <p className="text-sm text-brand-500 mt-1">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

interface FormAlertProps {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
}

const toneClasses: Record<FormAlertProps['tone'], string> = {
  error: 'bg-red-50 border-red-200 text-red-700',
  success: 'bg-green-50 border-green-200 text-green-700',
  info: 'bg-brand-50 border-brand-200 text-brand-800',
};

export function FormAlert({ tone, children }: FormAlertProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`border rounded-lg px-3 py-2 text-sm ${toneClasses[tone]}`}>
      {children}
    </div>
  );
}
