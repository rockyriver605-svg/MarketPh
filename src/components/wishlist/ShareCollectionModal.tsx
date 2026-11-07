import { useState } from 'react';
import { Copy, Check, Link2, Link2Off } from 'lucide-react';
import { buildSharedWishlistUrl, type WishlistCollection } from '@/lib/wishlist';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface ShareCollectionModalProps {
  collection: WishlistCollection | null;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
  onRevoke: () => void;
  onClose: () => void;
}

export function ShareCollectionModal({ collection, busy, error, onEnable, onRevoke, onClose }: ShareCollectionModalProps) {
  const [copied, setCopied] = useState(false);
  if (!collection) return null;

  const shareUrl = collection.share_token ? buildSharedWishlistUrl(collection.share_token) : null;

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Share "${collection.name}"`} size="sm">
      <div className="space-y-4">
        {shareUrl ? (
          <>
            <p className="text-sm text-brand-600">
              Anyone with this link can view the products in this collection. They cannot see your name, address, or phone number.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-cream-50 p-2">
              <Link2 className="ml-1 h-4 w-4 shrink-0 text-brand-500" />
              <input
                readOnly
                aria-label="Share link"
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent text-sm text-brand-800 outline-none"
              />
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <Button variant="danger" onClick={onRevoke} loading={busy} className="w-full">
              <Link2Off className="h-4 w-4" /> Turn off sharing
            </Button>
            <p className="text-xs text-brand-400">Turning off sharing makes the old link stop working right away.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-brand-600">
              This collection is private. Create a link to share it. You can turn the link off at any time.
            </p>
            <Button onClick={onEnable} loading={busy} className="w-full">
              <Link2 className="h-4 w-4" /> Create share link
            </Button>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
