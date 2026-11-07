import { useMemo, useState } from 'react';
import { ArrowLeft, Heart, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { navigate } from '@/lib/router';
import { getConditionLabel } from '@/lib/utils';
import { applyWishlistView, distinctOptions, DEFAULT_FILTERS, type WishlistFilters } from '@/lib/wishlistView';
import type { WishlistCollection, WishlistItem } from '@/lib/wishlist';
import { useWishlistData } from '@/hooks/useWishlistData';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { WishlistItemCard } from '@/components/wishlist/WishlistItemCard';
import { WishlistToolbar } from '@/components/wishlist/WishlistToolbar';
import { CollectionBar } from '@/components/wishlist/CollectionBar';
import { CollectionFormModal, CollectionManageModal, ConfirmModal } from '@/components/wishlist/CollectionDialogs';
import { ItemCollectionsModal } from '@/components/wishlist/ItemCollectionsModal';
import { ShareCollectionModal } from '@/components/wishlist/ShareCollectionModal';

type FormState = { mode: 'create' } | { mode: 'rename'; collection: WishlistCollection } | null;

export function FavoritesPage() {
  const { user } = useAuth();
  const { isPending } = useWishlist();
  const data = useWishlistData(user?.id ?? null);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState<WishlistFilters>(DEFAULT_FILTERS);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<WishlistItem | null>(null);
  const [membershipItem, setMembershipItem] = useState<WishlistItem | null>(null);
  const [formState, setFormState] = useState<FormState>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const selectedCollection = data.collections.find((c) => c.id === selectedCollectionId) ?? null;

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of data.memberships) map[m.collection_id] = (map[m.collection_id] ?? 0) + 1;
    return map;
  }, [data.memberships]);

  const collectionIdsByFavorite = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of data.memberships) {
      const set = map.get(m.favorite_id) ?? new Set<string>();
      set.add(m.collection_id);
      map.set(m.favorite_id, set);
    }
    return map;
  }, [data.memberships]);

  const scopedFavoriteIds = useMemo(() => {
    if (!selectedCollectionId) return null;
    return new Set(data.memberships.filter((m) => m.collection_id === selectedCollectionId).map((m) => m.favorite_id));
  }, [data.memberships, selectedCollectionId]);

  const visibleItems = useMemo(
    () => applyWishlistView(data.items, filters, scopedFavoriteIds),
    [data.items, filters, scopedFavoriteIds],
  );

  const categoryOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of data.items) if (item.category_id && item.category_name) names.set(item.category_id, item.category_name);
    return Array.from(names, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [data.items]);

  const conditionOptions = useMemo(
    () => distinctOptions(data.items, (i) => i.condition).map((value) => ({ value, label: getConditionLabel(value) })),
    [data.items],
  );
  const municipalityOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of data.items) if (item.municipality_id && item.municipality_name) names.set(item.municipality_id, item.municipality_name);
    return Array.from(names, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [data.items]);
  const shopOptions = useMemo(
    () => distinctOptions(data.items, (i) => i.shop_name).map((value) => ({ value, label: value })),
    [data.items],
  );

  if (!user) {
    return (
      <div className="container-app py-16 text-center">
        <Button onClick={() => navigate('/signin')}>Sign In</Button>
      </div>
    );
  }

  const selectCollection = (id: string | null) => {
    setSelectedCollectionId(id);
  };

  const handleFormSubmit = async (name: string) => {
    if (formState?.mode === 'create') {
      const created = await data.createNewCollection(name);
      if (created) {
        setSelectedCollectionId(created.id);
        setFormState(null);
      }
    } else if (formState?.mode === 'rename') {
      const ok = await data.renameExistingCollection(formState.collection, name);
      if (ok) setFormState(null);
    }
  };

  const handleDeleteCollection = async () => {
    if (!selectedCollection) return;
    const ok = await data.removeCollection(selectedCollection);
    if (ok) {
      setSelectedCollectionId(null);
      setDeleteOpen(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    const ok = await data.removeItem(removeTarget);
    if (ok) setRemoveTarget(null);
  };

  const handleToggleMembership = (item: WishlistItem, collectionId: string, next: boolean) => {
    void data.setMembership(item, collectionId, next);
  };

  const membershipCollection: WishlistCollection | null = shareOpen ? selectedCollection : null;

  const renderContent = () => {
    if (data.loading) {
      return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 animate-pulse" aria-label="Loading wishlist">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-cream-100" />
          ))}
        </div>
      );
    }
    if (data.loadError) {
      return (
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Your wishlist could not be loaded"
          description={data.loadError}
          action={<Button onClick={data.retry}>Try again</Button>}
        />
      );
    }
    if (data.items.length === 0) {
      return (
        <EmptyState
          icon={<Heart className="h-8 w-8" />}
          title="Your wishlist is empty"
          description="Tap the heart on any product to save it here for later."
          action={<Button onClick={() => navigate('/browse')}>Browse products</Button>}
        />
      );
    }
    if (visibleItems.length === 0) {
      return (
        <EmptyState
          icon={<Heart className="h-8 w-8" />}
          title="No items match these filters"
          description="Try a different search or clear the filters."
          action={
            <Button variant="outline" onClick={() => { setFilters(DEFAULT_FILTERS); setSelectedCollectionId(null); }}>
              Clear filters
            </Button>
          }
        />
      );
    }
    return (
      <div className={layout === 'grid' ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4' : 'flex flex-col gap-3'}>
        {visibleItems.map((item) => {
          const names = Array.from(collectionIdsByFavorite.get(item.favorite_id) ?? [])
            .map((id) => data.collections.find((c) => c.id === id)?.name)
            .filter((n): n is string => Boolean(n));
          return (
            <WishlistItemCard
              key={item.favorite_id}
              item={item}
              layout={layout}
              collectionNames={names}
              busy={isPending(item.product_id) || data.busyKey === `cart:${item.product_id}` || data.busyKey === `remove:${item.product_id}`}
              onAddToCart={(i) => void data.addItemToCart(i)}
              onManageCollections={setMembershipItem}
              onRemove={setRemoveTarget}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/browse')} className="mb-4 flex items-center gap-1 text-sm text-brand-600 transition-colors hover:text-brand-800">
        <ArrowLeft className="h-4 w-4" /> Back to browse
      </button>
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-brand-900">My Wishlist</h1>
        <p className="text-sm text-brand-500">Products you saved, with live availability and prices.</p>
      </div>

      <div className="mb-4">
        <CollectionBar
          collections={data.collections}
          counts={counts}
          totalCount={data.items.length}
          selectedId={selectedCollectionId}
          onSelect={selectCollection}
          onCreate={() => setFormState({ mode: 'create' })}
          onManage={() => setManageOpen(true)}
        />
      </div>

      <div className="mb-6">
        <WishlistToolbar
          filters={filters}
          onChange={setFilters}
          layout={layout}
          onLayoutChange={setLayout}
          categories={categoryOptions}
          conditions={conditionOptions}
          municipalities={municipalityOptions}
          shops={shopOptions}
          resultCount={visibleItems.length}
          totalCount={data.items.length}
        />
      </div>

      {renderContent()}

      <ConfirmModal
        open={removeTarget !== null}
        title="Remove from wishlist?"
        message={`"${removeTarget?.title ?? ''}" will be removed from your wishlist and from every collection.`}
        confirmLabel="Remove"
        busy={removeTarget !== null && data.busyKey === `remove:${removeTarget.product_id}`}
        onConfirm={handleRemove}
        onClose={() => setRemoveTarget(null)}
      />

      <ItemCollectionsModal
        item={membershipItem}
        collections={data.collections}
        memberIds={membershipItem ? collectionIdsByFavorite.get(membershipItem.favorite_id) ?? new Set<string>() : new Set<string>()}
        busyCollectionId={data.busyKey?.startsWith('collection:') ? data.busyKey.slice('collection:'.length) : null}
        onToggle={(collectionId, next) => membershipItem && handleToggleMembership(membershipItem, collectionId, next)}
        onClose={() => setMembershipItem(null)}
      />

      <CollectionFormModal
        key={formState?.mode === 'rename' ? formState.collection.id : 'create'}
        open={formState !== null}
        initialName={formState?.mode === 'rename' ? formState.collection.name : ''}
        title={formState?.mode === 'rename' ? 'Rename collection' : 'New collection'}
        submitLabel={formState?.mode === 'rename' ? 'Save' : 'Create'}
        busy={data.busyKey === 'collection-form'}
        error={null}
        onSubmit={handleFormSubmit}
        onClose={() => setFormState(null)}
      />

      <CollectionManageModal
        open={manageOpen}
        collection={selectedCollection}
        itemCount={selectedCollection ? counts[selectedCollection.id] ?? 0 : 0}
        busy={data.busyKey !== null}
        onClose={() => setManageOpen(false)}
        onRename={() => {
          if (selectedCollection) setFormState({ mode: 'rename', collection: selectedCollection });
          setManageOpen(false);
        }}
        onSetDefault={() => { if (selectedCollection) void data.makeDefaultCollection(selectedCollection); setManageOpen(false); }}
        onShare={() => { setManageOpen(false); setShareOpen(true); }}
        onDelete={() => { setManageOpen(false); setDeleteOpen(true); }}
      />

      <ConfirmModal
        open={deleteOpen}
        title="Delete collection?"
        message={`"${selectedCollection?.name ?? ''}" will be deleted. Products stay in your wishlist and in any other collections.`}
        confirmLabel="Delete collection"
        busy={data.busyKey === 'collection-delete'}
        onConfirm={handleDeleteCollection}
        onClose={() => setDeleteOpen(false)}
      />

      <ShareCollectionModal
        collection={membershipCollection}
        busy={data.busyKey === 'share'}
        error={null}
        onEnable={() => selectedCollection && void data.setSharing(selectedCollection, true)}
        onRevoke={() => selectedCollection && void data.setSharing(selectedCollection, false)}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
