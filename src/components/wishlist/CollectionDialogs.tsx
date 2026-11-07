import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { WishlistCollection } from '@/lib/wishlist';

const MAX_NAME_LENGTH = 60;

interface CollectionFormModalProps {
  open: boolean;
  initialName: string;
  title: string;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function CollectionFormModal({ open, initialName, title, submitLabel, busy, error, onSubmit, onClose }: CollectionFormModalProps) {
  const [name, setName] = useState(initialName);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setLocalError('Enter a name for this collection.');
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Collection name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          error={localError ?? error ?? undefined}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>{submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

interface CollectionManageModalProps {
  open: boolean;
  collection: WishlistCollection | null;
  itemCount: number;
  busy: boolean;
  onClose: () => void;
  onRename: () => void;
  onSetDefault: () => void;
  onShare: () => void;
  onDelete: () => void;
}

export function CollectionManageModal({
  open,
  collection,
  itemCount,
  busy,
  onClose,
  onRename,
  onSetDefault,
  onShare,
  onDelete,
}: CollectionManageModalProps) {
  if (!collection) return null;
  const isSharing = collection.share_token !== null;

  return (
    <Modal open={open} onClose={onClose} title={collection.name} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-brand-500">
          {itemCount} {itemCount === 1 ? 'saved item' : 'saved items'}
          {collection.is_default ? ' · Default collection' : ''}
          {isSharing ? ' · Shared with a link' : ' · Private'}
        </p>
        <div className="grid gap-2">
          <Button variant="outline" onClick={onRename} disabled={busy}>Rename collection</Button>
          {!collection.is_default && (
            <Button variant="outline" onClick={onSetDefault} disabled={busy}>Make default collection</Button>
          )}
          <Button variant="outline" onClick={onShare} disabled={busy}>
            {isSharing ? 'Manage sharing link' : 'Share collection'}
          </Button>
          <Button variant="danger" onClick={onDelete} disabled={busy}>Delete collection</Button>
        </div>
        <p className="text-xs text-brand-400">
          Deleting a collection does not remove products from your wishlist. Products in other collections stay put.
        </p>
      </div>
    </Modal>
  );
}

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ open, title, message, confirmLabel, busy, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-brand-600">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
