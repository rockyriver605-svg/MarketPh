import { Heart, Loader2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useWishlist } from '@/contexts/WishlistContext';

interface SaveButtonProps {
  productId: string;
  className?: string;
}

export function SaveButton({ productId, className = '' }: SaveButtonProps) {
  const { isSaved, isPending, toggleSave } = useWishlist();
  const saved = isSaved(productId);
  const pending = isPending(productId);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSave(productId);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      title={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-70 ${className}`}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
      ) : (
        <Heart
          className={`h-4 w-4 transition-colors duration-200 ${saved ? 'fill-red-500 text-red-500' : 'text-brand-600'}`}
        />
      )}
    </button>
  );
}
