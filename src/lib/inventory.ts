import { supabase } from '@/lib/supabase';

export interface InventoryItem {
  id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  reserved: number;
  low_stock_threshold: number;
  updated_at: string;
  product: {
    id: string;
    title: string;
    sku: string | null;
    status: string;
    seller_id: string;
    category: { id: string; name: string } | null;
    product_images: { image_url: string }[];
  } | null;
  variant: { id: string; name: string; value: string; sku: string | null } | null;
}

export interface StockMovement {
  id: string;
  product_id: string;
  variant_id: string | null;
  movement_type: string;
  quantity_change: number;
  quantity_after: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export function getStockStatus(qty: number, threshold: number): StockStatus {
  if (qty <= 0) return 'out_of_stock';
  if (qty <= threshold) return 'low_stock';
  return 'in_stock';
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
};

export interface InventoryStats {
  totalActive: number;
  totalUnits: number;
  lowStock: number;
  outOfStock: number;
}

export async function fetchSellerInventory(sellerId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, product_id, variant_id, quantity, reserved, low_stock_threshold, updated_at,
      product:products!inner(
        id, title, sku, status, seller_id,
        category:categories(id, name),
        product_images(image_url)
      ),
      variant:product_variants(id, name, value, sku)
    `)
    .eq('product.seller_id', sellerId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error('Inventory could not be loaded.');
  return (data ?? []) as unknown as InventoryItem[];
}

export async function fetchInventoryMovements(productId: string, variantId: string | null): Promise<StockMovement[]> {
  let query = supabase
    .from('stock_movements')
    .select('id, product_id, variant_id, movement_type, quantity_change, quantity_after, reason, reference_type, reference_id, created_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (variantId) {
    query = query.eq('variant_id', variantId);
  } else {
    query = query.is('variant_id', null);
  }
  const { data, error } = await query;
  if (error) throw new Error('Stock history could not be loaded.');
  return (data ?? []) as StockMovement[];
}

export async function adjustStock(productId: string, variantId: string | null, delta: number, reason: string): Promise<number> {
  const { data, error } = await supabase.rpc('adjust_stock', {
    p_product_id: productId,
    p_variant_id: variantId,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
  return data as number;
}

export async function updateLowStockThreshold(productId: string, variantId: string | null, threshold: number): Promise<void> {
  const { error } = await supabase
    .from('inventory')
    .update({ low_stock_threshold: threshold })
    .eq('product_id', productId)
    .eq('variant_id', variantId ?? null);
  if (error) throw new Error('Could not update the low-stock threshold.');
}
