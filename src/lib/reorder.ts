import { supabase } from '@/lib/supabase';
import type { OrderItem } from '@/types';

export interface ReorderIssue {
  title: string;
  message: string;
}

export type ReorderLine = Pick<OrderItem, 'product_id' | 'variant_id' | 'quantity' | 'product_title'> & { unit_price?: number };

export interface ReorderPlan {
  eligible: { product_id: string; variant_id: string | null; quantity: number }[];
  issues: ReorderIssue[];
}

interface ProductRow {
  id: string;
  title: string;
  price: number;
  sale_price: number | null;
  stock: number;
  status: string;
  seller_id: string;
  max_order_quantity: number | null;
}

interface VariantRow {
  id: string;
  product_id: string;
  price_override: number | null;
  stock: number;
}

export async function planReorder(items: ReorderLine[]): Promise<ReorderPlan> {
  const productIds = Array.from(new Set(items.map((i) => i.product_id)));
  const variantIds = Array.from(new Set(items.map((i) => i.variant_id).filter((v): v is string => !!v)));

  const [productsRes, variantsRes] = await Promise.all([
    supabase.from('products').select('id, title, price, sale_price, stock, status, seller_id, max_order_quantity').in('id', productIds),
    variantIds.length > 0
      ? supabase.from('product_variants').select('id, product_id, price_override, stock').in('id', variantIds)
      : Promise.resolve({ data: [] as VariantRow[], error: null }),
  ]);
  if (productsRes.error || variantsRes.error) throw new Error('Could not check current product availability.');

  const products = new Map(((productsRes.data as ProductRow[] | null) ?? []).map((p) => [p.id, p]));
  const variants = new Map(((variantsRes.data as VariantRow[] | null) ?? []).map((v) => [v.id, v]));

  const sellerIds = Array.from(new Set(Array.from(products.values()).map((p) => p.seller_id)));
  const sellersRes = sellerIds.length > 0
    ? await supabase.from('seller_profiles').select('id, is_active').in('id', sellerIds)
    : { data: [] as { id: string; is_active: boolean }[], error: null };
  if (sellersRes.error) throw new Error('Could not check seller availability.');
  const activeSellers = new Set(
    ((sellersRes.data as { id: string; is_active: boolean }[] | null) ?? []).filter((s) => s.is_active).map((s) => s.id),
  );

  const plan: ReorderPlan = { eligible: [], issues: [] };

  for (const item of items) {
    const product = products.get(item.product_id);
    if (!product) {
      plan.issues.push({ title: item.product_title, message: 'This product is no longer available.' });
      continue;
    }
    if (product.status !== 'published') {
      plan.issues.push({ title: product.title, message: 'This product is not currently listed.' });
      continue;
    }
    if (!activeSellers.has(product.seller_id)) {
      plan.issues.push({ title: product.title, message: 'The seller is not currently active.' });
      continue;
    }
    const variant = item.variant_id ? variants.get(item.variant_id) : undefined;
    if (item.variant_id && (!variant || variant.product_id !== product.id)) {
      plan.issues.push({ title: product.title, message: 'The option you bought is no longer available.' });
      continue;
    }

    const stock = variant ? variant.stock : product.stock;
    if (stock <= 0) {
      plan.issues.push({ title: product.title, message: 'This item is out of stock.' });
      continue;
    }

    const currentPrice = variant?.price_override ?? product.sale_price ?? product.price;
    const cap = Math.min(stock, product.max_order_quantity ?? Number.POSITIVE_INFINITY);
    const quantity = Math.min(item.quantity, cap);

    if (quantity < item.quantity) {
      plan.issues.push({ title: product.title, message: `Only ${quantity} left. Added ${quantity} instead of ${item.quantity}.` });
    }
    if (item.unit_price !== undefined && currentPrice !== item.unit_price) {
      plan.issues.push({ title: product.title, message: 'The current price differs from your previous purchase. The cart shows the current price.' });
    }
    plan.eligible.push({ product_id: product.id, variant_id: item.variant_id, quantity });
  }

  return plan;
}

export async function addPlanToCart(userId: string, plan: ReorderPlan): Promise<void> {
  if (plan.eligible.length === 0) return;

  const { data: existing, error: cartReadErr } = await supabase
    .from('carts').select('id').eq('user_id', userId).maybeSingle();
  if (cartReadErr) throw new Error('Could not open your cart.');

  let cartId = existing?.id as string | undefined;
  if (!cartId) {
    const { data: created, error: cartCreateErr } = await supabase
      .from('carts').insert({ user_id: userId }).select('id').single();
    if (cartCreateErr || !created) throw new Error('Could not open your cart.');
    cartId = created.id as string;
  }

  const rows = plan.eligible.map((e) => ({
    cart_id: cartId,
    product_id: e.product_id,
    variant_id: e.variant_id,
    quantity: e.quantity,
  }));
  const { error } = await supabase.from('cart_items').upsert(rows, { onConflict: 'cart_id,product_id,variant_id' });
  if (error) throw new Error('Could not add items to your cart.');
}
