import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

const PHOTO_BUCKET = 'profile-photos';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface AvatarUploaderProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  onChange: () => Promise<void>;
}

function extensionFor(type: string) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/${PHOTO_BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

export function AvatarUploader({ userId, displayName, avatarUrl, onChange }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shownUrl = preview ?? avatarUrl;
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  const handleFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Upload a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Photos must be 5 MB or smaller.');
      return;
    }
    setPending(file);
    setPreview(URL.createObjectURL(file));
  };

  const cancelPending = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPending(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const savePhoto = async () => {
    if (!pending) return;
    setBusy('upload');
    setError(null);
    try {
      const path = `${userId}/avatar-${Date.now()}.${extensionFor(pending.type)}`;
      const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, pending, {
        contentType: pending.type,
        cacheControl: '3600',
      });
      if (uploadError) throw new Error('Your photo could not be uploaded. Try a smaller image.');
      const publicUrl = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
        .select('id');
      if (updateError || !data || data.length === 0) {
        await supabase.storage.from(PHOTO_BUCKET).remove([path]);
        throw new Error('We could not save your photo. Please try again.');
      }
      if (avatarUrl) {
        const oldPath = storagePathFromUrl(avatarUrl);
        if (oldPath) await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
      }
      cancelPending();
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const removePhoto = async () => {
    if (!avatarUrl) return;
    setBusy('remove');
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId)
        .select('id');
      if (updateError || !data || data.length === 0) throw new Error('We could not remove your photo. Please try again.');
      const oldPath = storagePathFromUrl(avatarUrl);
      if (oldPath) await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full bg-brand-100 ring-4 ring-white shadow-md">
        {shownUrl ? (
          <img src={shownUrl} alt="Profile photo preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-brand-600">{initial}</div>
        )}
        {busy === 'upload' && (
          <div className="absolute inset-0 flex items-center justify-center bg-brand-900/50 text-xs font-medium text-white">
            Uploading...
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 text-center sm:text-left">
        <p className="text-sm text-brand-600">JPG, PNG, or WebP up to 5 MB.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap justify-center sm:justify-start gap-2">
          {pending ? (
            <>
              <Button size="sm" onClick={savePhoto} loading={busy === 'upload'}>Save photo</Button>
              <Button size="sm" variant="outline" onClick={cancelPending} disabled={busy === 'upload'}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
              <Camera className="h-4 w-4" /> {avatarUrl ? 'Change photo' : 'Upload photo'}
            </Button>
          )}
          {avatarUrl && !pending && (
            <Button size="sm" variant="ghost" onClick={removePhoto} loading={busy === 'remove'}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
