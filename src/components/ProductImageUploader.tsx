import { useRef, useState, useCallback } from 'react';
import { Upload, X, Loader2, ArrowLeft, ArrowRight, RefreshCw, ImagePlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { optimizeImage, extractStoragePath } from '@/lib/imageOptimize';

interface ImageData {
  id?: string;
  image_url: string;
  alt_text?: string | null;
  is_primary?: boolean;
}

interface ProductImageUploaderProps {
  userId: string;
  existingImages: ImageData[];
  onImagesChange: (images: ImageData[]) => void;
  maxImages?: number;
}

interface UploadState {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

export function ProductImageUploader({ userId, existingImages, onImagesChange, maxImages = 8 }: ProductImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);

  const deleteFromStorage = useCallback(async (imageUrl: string) => {
    const path = extractStoragePath(imageUrl);
    if (!path) return;
    try { await supabase.storage.from('product-images').remove([path]); } catch { /* best-effort */ }
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    if (existingImages.length >= maxImages) {
      setError(`Maximum ${maxImages} images allowed.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB.');
      return;
    }
    setError(null);

    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setUploads((prev) => [...prev, { id: uploadId, name: file.name, progress: 0, status: 'uploading' }]);

    try {
      const { blob } = await optimizeImage(file);
      const folder = `seller-${userId}`;
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const optimizedFile = new File([blob], file.name, { type: blob.type });

      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, optimizedFile, {
        upsert: false,
        contentType: blob.type,
      });
      if (uploadError) throw uploadError;

      setUploads((prev) => prev.map((u) => u.id === uploadId ? { ...u, progress: 100, status: 'done' } : u));
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
      onImagesChange([...existingImages, { image_url: urlData.publicUrl, is_primary: existingImages.length === 0 }]);
    } catch {
      setUploads((prev) => prev.map((u) => u.id === uploadId ? { ...u, status: 'error', error: 'Upload failed' } : u));
      setError('Could not upload image. Please try again.');
    } finally {
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== uploadId)), 1500);
    }
  }, [existingImages, maxImages, onImagesChange, userId]);

  const handleFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      if (existingImages.length >= maxImages) break;
      uploadFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReplaceInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && replaceIndex !== null) {
      replaceImage(replaceIndex, file);
    }
    setReplaceIndex(null);
    if (replaceInputRef.current) replaceInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeImage = async (index: number) => {
    const img = existingImages[index];
    if (img && !img.id) {
      await deleteFromStorage(img.image_url);
    }
    const next = existingImages.filter((_, i) => i !== index);
    if (next.length > 0 && !next.some((im) => im.is_primary)) {
      next[0] = { ...next[0], is_primary: true };
    }
    onImagesChange(next);
  };

  const setPrimary = (index: number) => {
    onImagesChange(existingImages.map((img, i) => ({ ...img, is_primary: i === index })));
  };

  const moveImage = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= existingImages.length) return;
    const next = [...existingImages];
    [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
    const primaryIdx = next.findIndex((img) => img.is_primary);
    if (primaryIdx < 0 && next.length > 0) next[0] = { ...next[0], is_primary: true };
    onImagesChange(next);
  };

  const replaceImage = async (index: number, file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    const oldImg = existingImages[index];
    setError(null);

    const uploadId = `replace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setUploads((prev) => [...prev, { id: uploadId, name: file.name, progress: 0, status: 'uploading' }]);

    try {
      const { blob } = await optimizeImage(file);
      const folder = `seller-${userId}`;
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const optimizedFile = new File([blob], file.name, { type: blob.type });

      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, optimizedFile, {
        upsert: false,
        contentType: blob.type,
      });
      if (uploadError) throw uploadError;

      setUploads((prev) => prev.map((u) => u.id === uploadId ? { ...u, progress: 100, status: 'done' } : u));
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);

      // Delete the old file from storage if it was a new upload (no DB record yet)
      if (oldImg && !oldImg.id) {
        await deleteFromStorage(oldImg.image_url);
      }

      onImagesChange(existingImages.map((img, i) => i === index ? { ...img, image_url: urlData.publicUrl } : img));
    } catch {
      setUploads((prev) => prev.map((u) => u.id === uploadId ? { ...u, status: 'error', error: 'Replace failed' } : u));
      setError('Could not replace image. Please try again.');
    } finally {
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== uploadId)), 1500);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-brand-900 mb-1.5">Product Images</label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => existingImages.length < maxImages && fileInputRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-4 mb-3 transition-all cursor-pointer ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-brand-200 hover:border-brand-400 bg-cream-50/50'
        } ${existingImages.length >= maxImages ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          {dragOver ? (
            <ImagePlus className="h-8 w-8 text-brand-500" />
          ) : (
            <Upload className="h-8 w-8 text-brand-400" />
          )}
          <p className="text-sm font-medium text-brand-700">
            {dragOver ? 'Drop images here' : 'Drag & drop images or click to browse'}
          </p>
          <p className="text-xs text-brand-400">JPG, PNG up to 10MB — optimized automatically on upload</p>
        </div>
      </div>

      {/* Image grid */}
      {existingImages.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-3">
          {existingImages.map((img, i) => (
            <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-brand-200">
              <img src={img.image_url} alt={img.alt_text ?? ''} className="w-full h-full object-cover" loading="lazy" />
              {img.is_primary && (
                <span className="absolute top-1 left-1 bg-brand-600 text-white text-[10px] px-1.5 py-0.5 rounded z-10">Primary</span>
              )}
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="absolute bottom-1 left-1 right-1 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  type="button"
                  onClick={() => moveImage(i, 'left')}
                  disabled={i === 0}
                  className="bg-brand-900/70 text-white rounded p-0.5 disabled:opacity-30"
                  aria-label="Move left"
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => { setReplaceIndex(i); replaceInputRef.current?.click(); }}
                    className="bg-brand-900/70 text-white rounded p-0.5"
                    aria-label="Replace image"
                    title="Replace"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                  {!img.is_primary && (
                    <button
                      type="button"
                      onClick={() => setPrimary(i)}
                      className="bg-brand-600 text-white text-[10px] px-1.5 py-0.5 rounded"
                    >
                      Primary
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => moveImage(i, 'right')}
                  disabled={i === existingImages.length - 1}
                  className="bg-brand-900/70 text-white rounded p-0.5 disabled:opacity-30"
                  aria-label="Move right"
                >
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active uploads */}
      {uploads.filter((u) => u.status === 'uploading').length > 0 && (
        <div className="space-y-1.5 mb-3">
          {uploads.filter((u) => u.status === 'uploading').map((u) => (
            <div key={u.id} className="flex items-center gap-2 bg-cream-50 rounded-lg px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-brand-600 truncate">{u.name}</p>
                <div className="h-1 bg-brand-100 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${u.progress || 50}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error uploads */}
      {uploads.filter((u) => u.status === 'error').length > 0 && (
        <div className="space-y-1 mb-3">
          {uploads.filter((u) => u.status === 'error').map((u) => (
            <div key={u.id} className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
              <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
              <p className="text-xs text-red-600">{u.name}: {u.error}</p>
            </div>
          ))}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFileInput} className="hidden" />
      <input ref={replaceInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleReplaceInput} className="hidden" />
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <p className="text-xs text-brand-400">
        {existingImages.length}/{maxImages} images. Images are auto-compressed to max 1600px. Use arrows to reorder, refresh icon to replace.
      </p>
    </div>
  );
}
