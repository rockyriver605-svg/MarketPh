import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  size?: number;
  interactive?: boolean;
  onChange?: (rating: number) => void;
  className?: string;
}

export function StarRating({ rating, size = 16, interactive = false, onChange, className = '' }: StarRatingProps) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`} role={interactive ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onChange?.(star)}
          role={interactive ? 'radio' : undefined}
          aria-checked={interactive ? rating === star : undefined}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          className={`transition-transform ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
        >
          <Star
            style={{ width: size, height: size }}
            className={star <= rating ? 'fill-amber-400 text-amber-400' : 'fill-brand-100 text-brand-200'}
          />
        </button>
      ))}
    </div>
  );
}
