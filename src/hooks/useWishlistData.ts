import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWishlist } from '@/contexts/WishlistContext';
import { navigate } from '@/lib/router';
import { planReorder, addPlanToCart } from '@/lib/reorder';
import {
  addToCollection,
  createCollection,
  deleteCollection,
  fetchWishlistItems,
  loadCollections,
  removeFromCollection,
  renameCollection,
  setCollectionSharing,
  setDefaultCollection,
  unsaveProduct,
  type CollectionMembership,
  type WishlistCollection,
  type WishlistItem,
} from '@/lib/wishlist';

interface ActionResult<T> {
  message: string;
  value: T;
}

export function useWishlistData(userId: string | null) {
  const { refreshSaved, showToast } = useWishlist();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [collections, setCollections] = useState<WishlistCollection[]>([]);
  const [memberships, setMemberships] = useState<CollectionMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [nextItems, nextCollections] = await Promise.all([fetchWishlistItems(), loadCollections()]);
    setItems(nextItems);
    setCollections(nextCollections.collections);
    setMemberships(nextCollections.memberships);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      await fetchAll();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Your wishlist could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  useEffect(() => {
    if (!userId) return;
    load();
  }, [userId, load]);

  useEffect(() => {
    if (!userId || items.length === 0) return;
    const productIds = items.map((i) => i.product_id);
    const channel = supabase
      .channel(`wishlist-products-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `id=in.(${productIds.join(',')})` },
        () => { void fetchAll().catch(() => {}); },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, items, fetchAll]);

  const run = useCallback(async <T,>(key: string, action: () => Promise<ActionResult<T>>): Promise<T | null> => {
    setBusyKey(key);
    try {
      const result = await action();
      if (result.message) showToast(result.message, 'success');
      await fetchAll().catch(() => showToast('Your wishlist could not be refreshed.', 'error'));
      return result.value;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Something went wrong. Please try again.', 'error');
      return null;
    } finally {
      setBusyKey(null);
    }
  }, [fetchAll, showToast]);

  const addItemToCart = useCallback((item: WishlistItem) => {
    if (!userId) return Promise.resolve(null);
    if (item.has_variants) {
      navigate(`/product/${item.product_id}`);
      return Promise.resolve(null);
    }
    return run(`cart:${item.product_id}`, async () => {
      const plan = await planReorder([{ product_id: item.product_id, variant_id: null, quantity: 1, product_title: item.title }]);
      if (plan.eligible.length === 0) {
        throw new Error(plan.issues[0]?.message ?? 'This product cannot be added right now.');
      }
      await addPlanToCart(userId, plan);
      return { message: `Added "${item.title}" to your cart.`, value: true };
    });
  }, [userId, run]);

  const removeItem = useCallback((item: WishlistItem) => {
    if (!userId) return Promise.resolve(null);
    return run(`remove:${item.product_id}`, async () => {
      await unsaveProduct(userId, item.product_id);
      await refreshSaved();
      return { message: 'Removed from your wishlist.', value: true };
    });
  }, [userId, run, refreshSaved]);

  const setMembership = useCallback((item: WishlistItem, collectionId: string, next: boolean) => {
    return run(`collection:${collectionId}`, async () => {
      if (next) await addToCollection(collectionId, item.favorite_id);
      else await removeFromCollection(collectionId, item.favorite_id);
      return { message: '', value: true };
    });
  }, [run]);

  const createNewCollection = useCallback((name: string) => {
    return run('collection-form', async () => {
      const created = await createCollection(name);
      return { message: `Created "${created.name}".`, value: created };
    });
  }, [run]);

  const renameExistingCollection = useCallback((collection: WishlistCollection, name: string) => {
    return run('collection-form', async () => {
      await renameCollection(collection.id, name);
      return { message: 'Collection renamed.', value: true };
    });
  }, [run]);

  const makeDefaultCollection = useCallback((collection: WishlistCollection) => {
    return run(`collection:${collection.id}`, async () => {
      await setDefaultCollection(collection.id);
      return { message: `"${collection.name}" is now your default collection.`, value: true };
    });
  }, [run]);

  const removeCollection = useCallback((collection: WishlistCollection) => {
    return run('collection-delete', async () => {
      await deleteCollection(collection.id);
      return { message: `Deleted "${collection.name}".`, value: true };
    });
  }, [run]);

  const setSharing = useCallback((collection: WishlistCollection, enabled: boolean) => {
    return run('share', async () => {
      await setCollectionSharing(collection.id, enabled);
      return { message: enabled ? 'Share link created.' : 'Sharing turned off.', value: true };
    });
  }, [run]);

  return {
    items,
    collections,
    memberships,
    loading,
    loadError,
    busyKey,
    retry: load,
    addItemToCart,
    removeItem,
    setMembership,
    createNewCollection,
    renameExistingCollection,
    makeDefaultCollection,
    removeCollection,
    setSharing,
  };
}
