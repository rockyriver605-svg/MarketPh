import { FolderOpen, Plus, Settings2, Star } from 'lucide-react';
import type { WishlistCollection } from '@/lib/wishlist';
import { Button } from '@/components/ui/Button';

interface CollectionBarProps {
  collections: WishlistCollection[];
  counts: Record<string, number>;
  totalCount: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onManage: () => void;
}

export function CollectionBar({
  collections,
  counts,
  totalCount,
  selectedId,
  onSelect,
  onCreate,
  onManage,
}: CollectionBarProps) {
  const chipClass = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'border-brand-700 bg-brand-700 text-white'
        : 'border-brand-200 bg-white text-brand-700 hover:border-brand-400 hover:text-brand-900'
    }`;

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Collections">
        <button type="button" role="tab" aria-selected={selectedId === null} onClick={() => onSelect(null)} className={chipClass(selectedId === null)}>
          <FolderOpen className="h-4 w-4" /> All saved <span className="opacity-75">{totalCount}</span>
        </button>
        {collections.map((collection) => (
          <button
            key={collection.id}
            type="button"
            role="tab"
            aria-selected={selectedId === collection.id}
            onClick={() => onSelect(collection.id)}
            className={chipClass(selectedId === collection.id)}
          >
            {collection.is_default && <Star className="h-3.5 w-3.5 fill-current" aria-label="Default collection" />}
            {collection.name} <span className="opacity-75">{counts[collection.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex shrink-0 gap-2">
        {selectedId && (
          <Button variant="ghost" size="sm" onClick={onManage} aria-label="Manage this collection">
            <Settings2 className="h-4 w-4" /> <span className="hidden sm:inline">Manage</span>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New collection</span>
        </Button>
      </div>
    </div>
  );
}
