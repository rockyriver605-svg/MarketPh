import type { WishlistCollection, WishlistItem } from '@/lib/wishlist';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface ItemCollectionsModalProps {
  item: WishlistItem | null;
  collections: WishlistCollection[];
  memberIds: Set<string>;
  busyCollectionId: string | null;
  onToggle: (collectionId: string, next: boolean) => void;
  onClose: () => void;
}

export function ItemCollectionsModal({ item, collections, memberIds, busyCollectionId, onToggle, onClose }: ItemCollectionsModalProps) {
  return (
    <Modal open={item !== null} onClose={onClose} title="Add to collections" size="sm">
      {item && (
        <div className="space-y-4">
          <p className="text-sm text-brand-600 line-clamp-2">{item.title}</p>
          <ul className="divide-y divide-brand-100 rounded-lg border border-brand-100">
            {collections.map((collection) => {
              const checked = memberIds.has(collection.id);
              return (
                <li key={collection.id}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 hover:bg-cream-50">
                    <span className="text-sm font-medium text-brand-900">
                      {collection.name}
                      {collection.is_default && <span className="ml-2 text-xs text-brand-400">Default</span>}
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-700"
                      checked={checked}
                      disabled={busyCollectionId === collection.id}
                      onChange={(e) => onToggle(collection.id, e.target.checked)}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-brand-400">A product can sit in several collections. Unchecking removes it from that collection only.</p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
