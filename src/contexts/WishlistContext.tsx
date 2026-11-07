import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { loadSavedProductIds, saveProduct, unsaveProduct } from '@/lib/wishlist';
import { Toast, type ToastTone } from '@/components/ui/Toast';

const TOAST_DURATION_MS = 3500;

interface ToastState {
  message: string;
  tone: ToastTone;
}

interface WishlistContextValue {
  isSaved: (productId: string) => boolean;
  isPending: (productId: string) => boolean;
  toggleSave: (productId: string) => Promise<void>;
  showToast: (message: string, tone: ToastTone) => void;
  refreshSaved: () => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone) => {
    setToast({ message, tone });
  }, []);

  const refreshSaved = useCallback(async () => {
    if (!userId) {
      setSavedIds(new Set());
      return;
    }
    try {
      setSavedIds(await loadSavedProductIds(userId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Your saved products could not be loaded.', 'error');
    }
  }, [userId, showToast]);

  useEffect(() => {
    refreshSaved();
  }, [refreshSaved]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const setPending = useCallback((productId: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }, []);

  const toggleSave = useCallback(async (productId: string) => {
    if (!userId) {
      showToast('Sign in to save products to your wishlist.', 'error');
      navigate('/signin');
      return;
    }
    if (pendingIds.has(productId)) return;

    const wasSaved = savedIds.has(productId);
    setPending(productId, true);
    try {
      if (wasSaved) {
        await unsaveProduct(userId, productId);
        setSavedIds((prev) => { const next = new Set(prev); next.delete(productId); return next; });
        showToast('Removed from your wishlist.', 'success');
      } else {
        await saveProduct(userId, productId);
        setSavedIds((prev) => new Set(prev).add(productId));
        showToast('Saved to your wishlist.', 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Your wishlist could not be updated.', 'error');
    } finally {
      setPending(productId, false);
    }
  }, [userId, pendingIds, savedIds, setPending, showToast]);

  const value = useMemo<WishlistContextValue>(() => ({
    isSaved: (productId) => savedIds.has(productId),
    isPending: (productId) => pendingIds.has(productId),
    toggleSave,
    showToast,
    refreshSaved,
  }), [savedIds, pendingIds, toggleSave, showToast, refreshSaved]);

  return (
    <WishlistContext.Provider value={value}>
      {children}
      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider');
  return ctx;
}
