import { supabase } from '@/lib/supabase';

export const DEFAULT_COLLECTION_NAME = 'Saved';
const UNIQUE_VIOLATION = '23505';

export interface WishlistCollection {
  id: string;
  name: string;
  is_default: boolean;
  share_token: string | null;
  created_at: string;
}

export interface CollectionMembership {
  collection_id: string;
  favorite_id: string;
}

export interface WishlistItem {
  favorite_id: string;
  saved_at: string;
  product_id: string;
  title: string;
  condition: string | null;
  status: string;
  price: number;
  sale_price: number | null;
  stock: number;
  max_order_quantity: number | null;
  has_variants: boolean;
  category_id: string | null;
  category_name: string | null;
  municipality_id: string | null;
  municipality_name: string | null;
  barangay_name: string | null;
  shop_name: string | null;
  seller_active: boolean;
  image_url: string | null;
}

export interface SharedWishlistItem {
  product_id: string;
  title: string;
  slug: string | null;
  condition: string | null;
  status: string;
  price: number;
  sale_price: number | null;
  image_url: string | null;
  shop_name: string | null;
  added_at: string;
}

export interface SharedWishlist {
  name: string;
  items: SharedWishlistItem[];
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

export async function loadSavedProductIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('favorites').select('product_id').eq('user_id', userId);
  if (error) throw new Error('Your saved products could not be loaded.');
  return new Set(((data as { product_id: string }[] | null) ?? []).map((row) => row.product_id));
}

async function getOrCreateDefaultCollection(): Promise<string> {
  const existing = await supabase.from('wishlist_collections').select('id').eq('is_default', true).maybeSingle();
  if (existing.error) throw new Error('Your collections could not be loaded.');
  if (existing.data) return existing.data.id as string;

  const created = await supabase
    .from('wishlist_collections')
    .insert({ name: DEFAULT_COLLECTION_NAME, is_default: true })
    .select('id')
    .single();
  if (created.data) return created.data.id as string;
  if (!isUniqueViolation(created.error)) throw new Error('Your collections could not be created.');

  const retry = await supabase.from('wishlist_collections').select('id').eq('is_default', true).maybeSingle();
  if (retry.error || !retry.data) throw new Error('Your collections could not be loaded.');
  return retry.data.id as string;
}

export async function saveProduct(userId: string, productId: string): Promise<void> {
  const { data, error } = await supabase
    .from('favorites')
    .insert({ user_id: userId, product_id: productId })
    .select('id')
    .single();

  let favoriteId: string | null = null;
  if (data) {
    favoriteId = data.id as string;
  } else if (isUniqueViolation(error)) {
    const existing = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();
    if (existing.error || !existing.data) throw new Error('This product could not be saved. Please try again.');
    favoriteId = existing.data.id as string;
  } else {
    throw new Error('This product could not be saved. Please try again.');
  }

  const collectionId = await getOrCreateDefaultCollection();
  const membership = await supabase
    .from('wishlist_collection_items')
    .upsert({ collection_id: collectionId, favorite_id: favoriteId }, { onConflict: 'collection_id,favorite_id', ignoreDuplicates: true });
  if (membership.error) throw new Error('The product was saved but could not be added to your collection.');
}

export async function unsaveProduct(userId: string, productId: string): Promise<void> {
  const { error } = await supabase.from('favorites').delete().eq('user_id', userId).eq('product_id', productId);
  if (error) throw new Error('This product could not be removed. Please try again.');
}

export async function loadCollections(): Promise<{ collections: WishlistCollection[]; memberships: CollectionMembership[] }> {
  const [collectionsRes, membershipsRes] = await Promise.all([
    supabase.from('wishlist_collections').select('id, name, is_default, share_token, created_at').order('is_default', { ascending: false }).order('name', { ascending: true }),
    supabase.from('wishlist_collection_items').select('collection_id, favorite_id'),
  ]);
  if (collectionsRes.error || membershipsRes.error) throw new Error('Your collections could not be loaded.');
  return {
    collections: (collectionsRes.data as WishlistCollection[] | null) ?? [],
    memberships: (membershipsRes.data as CollectionMembership[] | null) ?? [],
  };
}

export async function createCollection(name: string): Promise<WishlistCollection> {
  const { data, error } = await supabase
    .from('wishlist_collections')
    .insert({ name: name.trim() })
    .select('id, name, is_default, share_token, created_at')
    .single();
  if (isUniqueViolation(error)) throw new Error('You already have a collection with that name.');
  if (error || !data) throw new Error('The collection could not be created.');
  return data as WishlistCollection;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('wishlist_collections')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (isUniqueViolation(error)) throw new Error('You already have a collection with that name.');
  if (error) throw new Error('The collection could not be renamed.');
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from('wishlist_collections').delete().eq('id', id);
  if (error) throw new Error('The collection could not be deleted.');
}

export async function setDefaultCollection(id: string): Promise<void> {
  const clear = await supabase.from('wishlist_collections').update({ is_default: false }).eq('is_default', true);
  if (clear.error) throw new Error('The default collection could not be changed.');
  const set = await supabase.from('wishlist_collections').update({ is_default: true }).eq('id', id);
  if (set.error) throw new Error('The default collection could not be changed.');
}

export async function addToCollection(collectionId: string, favoriteId: string): Promise<void> {
  const { error } = await supabase
    .from('wishlist_collection_items')
    .upsert({ collection_id: collectionId, favorite_id: favoriteId }, { onConflict: 'collection_id,favorite_id', ignoreDuplicates: true });
  if (error) throw new Error('The product could not be added to that collection.');
}

export async function removeFromCollection(collectionId: string, favoriteId: string): Promise<void> {
  const { error } = await supabase
    .from('wishlist_collection_items')
    .delete()
    .eq('collection_id', collectionId)
    .eq('favorite_id', favoriteId);
  if (error) throw new Error('The product could not be removed from that collection.');
}

function isWishlistItem(value: unknown): value is WishlistItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.favorite_id === 'string'
    && typeof v.product_id === 'string'
    && typeof v.title === 'string'
    && typeof v.status === 'string'
    && typeof v.price === 'number'
    && typeof v.stock === 'number';
}

export async function fetchWishlistItems(): Promise<WishlistItem[]> {
  const { data, error } = await supabase.rpc('get_my_wishlist');
  if (error) throw new Error('Your wishlist could not be loaded.');
  if (!Array.isArray(data)) throw new Error('Your wishlist could not be loaded.');
  return data.filter(isWishlistItem);
}

export function buildSharedWishlistUrl(token: string): string {
  return `${window.location.origin}/#/wishlist/shared/${token}`;
}

export async function setCollectionSharing(collectionId: string, enabled: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_wishlist_collection_sharing', {
    p_collection_id: collectionId,
    p_enabled: enabled,
  });
  if (error) throw new Error('Sharing could not be updated. Please try again.');
  return typeof data === 'string' ? data : null;
}

function isSharedItem(value: unknown): value is SharedWishlistItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.product_id === 'string' && typeof v.title === 'string' && typeof v.status === 'string' && typeof v.price === 'number';
}

export async function fetchSharedWishlist(token: string): Promise<SharedWishlist | null> {
  const { data, error } = await supabase.rpc('get_shared_wishlist', { p_token: token });
  if (error) throw new Error('This shared wishlist could not be loaded.');
  if (!data || typeof data !== 'object') return null;
  const shape = data as { name?: unknown; items?: unknown };
  if (typeof shape.name !== 'string' || !Array.isArray(shape.items)) {
    throw new Error('This shared wishlist could not be loaded.');
  }
  return { name: shape.name, items: shape.items.filter(isSharedItem) };
}
