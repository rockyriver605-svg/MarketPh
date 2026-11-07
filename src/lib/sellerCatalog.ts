import { supabase } from '@/lib/supabase';
import { type CatalogProduct, toCentavos } from '@/lib/salesCalculator';

export interface SellerCatalogItem extends CatalogProduct {
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  sellerId: string;
}

export interface SellerShop {
  name: string;
  phone: string | null;
  email: string | null;
}

export type SellerCatalogResult =
  | { kind: 'ready'; sellerId: string; shop: SellerShop; products: SellerCatalogItem[] }
  | { kind: 'no-seller' }
  | { kind: 'error'; message: string };

interface VariantRow {
  id: string;
  name: string;
  value: string;
  price_override: number | string | null;
  stock: number;
}

interface ImageRow {
  image_url: string;
  is_primary: boolean;
  sort_order: number;
}

interface ProductRow {
  id: string;
  title: string;
  price: number | string;
  sale_price: number | string | null;
  stock: number;
  category_id: string | null;
  category: { id: string; name: string } | null;
  product_images: ImageRow[] | null;
  product_variants: VariantRow[] | null;
}

function pickImage(images: ImageRow[] | null): string | null {
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  return sorted[0].image_url || null;
}

function toCatalogItem(row: ProductRow, sellerId: string): SellerCatalogItem {
  const baseCentavos = toCentavos(Number(row.sale_price ?? row.price));
  return {
    id: row.id,
    title: row.title,
    unitCentavos: baseCentavos,
    stock: row.stock,
    variants: (row.product_variants ?? []).map((v) => ({
      id: v.id,
      label: `${v.name}: ${v.value}`,
      unitCentavos: v.price_override != null ? toCentavos(Number(v.price_override)) : baseCentavos,
      stock: v.stock,
    })),
    imageUrl: pickImage(row.product_images),
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    sellerId,
  };
}

export async function loadSellerCatalog(userId: string): Promise<SellerCatalogResult> {
  const { data: seller, error: sellerError } = await supabase
    .from('seller_profiles')
    .select('id, shop_name, contact_phone, contact_email')
    .eq('user_id', userId)
    .maybeSingle();
  if (sellerError) {
    return { kind: 'error', message: 'Your seller account could not be loaded. Please try again.' };
  }
  if (!seller) return { kind: 'no-seller' };

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, title, price, sale_price, stock, category_id, category:categories(id, name), product_images(image_url, is_primary, sort_order), product_variants(id, name, value, price_override, stock)',
    )
    .eq('seller_id', seller.id)
    .eq('status', 'published')
    .order('title');
  if (error || !Array.isArray(data)) {
    return { kind: 'error', message: 'Your products could not be loaded. Please try again.' };
  }

  return {
    kind: 'ready',
    sellerId: seller.id,
    shop: { name: seller.shop_name, phone: seller.contact_phone, email: seller.contact_email },
    products: (data as unknown as ProductRow[]).map((row) => toCatalogItem(row, seller.id)),
  };
}
