import { useState, type FormEvent } from 'react';
import { Star, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { StarRating } from '@/components/reviews/StarRating';
import { getRatingLabel, MAX_REVIEW_BODY_LENGTH, MAX_REVIEW_TITLE_LENGTH, MAX_REVIEW_PHOTOS } from '@/lib/reviews';

interface ReviewFormProps {
  productTitle: string;
  productImage?: string | null;
  shopName?: string | null;
  initialRating?: number;
  initialTitle?: string;
  initialBody?: string;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (rating: number, title: string, body: string, photos: File[]) => Promise<void>;
  onCancel: () => void;
}

export function ReviewForm({
  productTitle, productImage, shopName,
  initialRating = 0, initialTitle = '', initialBody = '',
  submitLabel, busy, error, onSubmit, onCancel,
}: ReviewFormProps) {
  const [rating, setRating] = useState(initialRating);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [photos, setPhotos] = useState<File[]>([]);

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => [...prev, ...files].slice(0, MAX_REVIEW_PHOTOS));
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (rating === 0) return;
    void onSubmit(rating, title.trim(), body.trim(), photos);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg bg-cream-50 p-3">
        {productImage ? (
          <img src={productImage} alt={productTitle} className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-brand-100 text-brand-300">
            <Star className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-900 truncate">{productTitle}</p>
          {shopName && <p className="text-xs text-brand-500">from {shopName}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-brand-900 mb-1.5">Your rating</label>
        <StarRating rating={rating} size={32} interactive onChange={setRating} />
        {rating > 0 && <p className="mt-1 text-xs text-brand-500">{getRatingLabel(rating)}</p>}
      </div>

      <Input
        label="Review title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={MAX_REVIEW_TITLE_LENGTH}
        placeholder="Summarize your experience"
      />

      <Textarea
        label="Your review"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_REVIEW_BODY_LENGTH}
        rows={4}
        placeholder="Share details about the product quality, condition, and your buying experience."
      />

      <div>
        <label className="block text-sm font-medium text-brand-900 mb-1.5">Photos (optional, up to {MAX_REVIEW_PHOTOS})</label>
        <div className="flex flex-wrap gap-2">
          {photos.map((photo, idx) => (
            <div key={idx} className="relative">
              <img src={URL.createObjectURL(photo)} alt={`Preview ${idx + 1}`} className="h-20 w-20 rounded-lg object-cover border border-brand-100" />
              <button type="button" onClick={() => removePhoto(idx)} className="absolute -top-1 -right-1 rounded-full bg-red-500 p-0.5 text-white">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {photos.length < MAX_REVIEW_PHOTOS && (
            <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-brand-200 text-brand-400 hover:border-brand-400 hover:text-brand-600">
              <ImagePlus className="h-6 w-6" />
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
            </label>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={rating === 0}>{submitLabel}</Button>
      </div>
    </form>
  );
}
