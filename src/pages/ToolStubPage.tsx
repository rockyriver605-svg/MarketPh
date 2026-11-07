import {
  ArrowLeft, Construction, CheckCircle2, Clock, LogIn, BookOpen, ArrowRight,
} from 'lucide-react';
import { navigate } from '@/lib/router';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { getToolGuide } from '@/lib/toolGuides';

export function ToolStubPage({ toolId }: { toolId: string }) {
  const { user } = useAuth();
  const tool = getToolGuide(toolId);

  if (!tool) {
    return (
      <div className="container-app py-8 animate-fade-in">
        <button onClick={() => navigate('/seller/tools')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Business Tools
        </button>
        <div className="bg-white rounded-xl border border-brand-100 p-8 text-center">
          <h1 className="text-xl font-bold text-brand-900 mb-2">Tool not found</h1>
          <p className="text-sm text-brand-500 mb-6">This business tool does not exist.</p>
          <Button onClick={() => navigate('/seller/tools')}>Back to Business Tools</Button>
        </div>
      </div>
    );
  }

  const Icon = tool.icon;
  const isReady = tool.status === 'ready';
  const isSignedIn = !!user;

  const handleOpen = () => {
    if (!isSignedIn) {
      navigate('/signin');
      return;
    }
    if (tool.id === 'product-catalog') {
      navigate('/seller/dashboard');
      return;
    }
  };

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/seller/tools')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Business Tools
      </button>

      <div className="max-w-3xl mx-auto">
        {/* Tool header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shrink-0">
            <Icon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-brand-900">{tool.title}</h1>
            <span className={`inline-flex items-center gap-1 mt-1 text-xs font-medium ${isReady ? 'text-green-600' : 'text-brand-400'}`}>
              {isReady ? <><CheckCircle2 className="h-3 w-3" /> Available</> : <><Clock className="h-3 w-3" /> Coming soon</>}
            </span>
          </div>
        </div>

        {/* What it does */}
        <div className="bg-white rounded-xl border border-brand-100 p-6 mb-5">
          <h2 className="text-sm font-semibold text-brand-900 mb-2 flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-brand-500" /> What this tool does
          </h2>
          <p className="text-sm text-brand-600 leading-relaxed">{tool.whatItDoes}</p>
        </div>

        {/* How to use */}
        <div className="bg-white rounded-xl border border-brand-100 p-6 mb-5">
          <h2 className="text-sm font-semibold text-brand-900 mb-4">How to use it</h2>
          <div className="space-y-3">
            {tool.howToUse.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold shrink-0">
                  {i + 1}
                </div>
                <p className="text-sm text-brand-600 leading-relaxed pt-1">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Action area */}
        {isReady ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="flex-1" onClick={handleOpen}>
              Open this tool <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => navigate('/seller/tools')}>Back to Business Tools</Button>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Construction className="h-5 w-5 text-amber-600" />
              <h2 className="text-base font-semibold text-amber-900">Not yet available</h2>
            </div>
            <p className="text-sm text-amber-700">
              This module is part of the TindaTap Business Tools integration and will be available
              in a future update. The database is already prepared — once implemented, your
              existing products and store data will work seamlessly with it.
            </p>
          </div>
        )}

        {/* Sign-in prompt for non-authenticated visitors */}
        {!isSignedIn && (
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white shrink-0">
              <LogIn className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-brand-900">Sign in to access this tool</p>
              <p className="text-xs text-brand-600 mt-0.5">
                Create a seller account or sign in to start using this and other business tools.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={() => navigate('/signin')}>Sign In</Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/signup')}>Sign Up</Button>
            </div>
          </div>
        )}

        {!isSignedIn && (
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={() => navigate('/seller/tools')}>
              <ArrowLeft className="h-4 w-4" /> Back to Business Tools
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
