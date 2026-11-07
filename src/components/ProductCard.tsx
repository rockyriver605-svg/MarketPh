import { MapPin, Star, Tag } from 'lucide-react';
import type { ProductWithRelations } from '@/types';
import { formatCurrency, getConditionLabel } from '@/lib/utils';
import { navigate } from '@/lib/router';
import { Badge } from '@/components/ui/Badge';
import { SaveButton } from '@/components/wishlist/SaveButton';

interface ProductCardProps {
  product: ProductWithRelations;
}

export function ProductCard({ product }: ProductCardProps) {
  const primaryImage = product.product_images?.find((img) => img.is_primary) ?? product.product_images?.[0];
  const effectivePrice = product.sale_price ?? product.price;
  const hasDiscount = product.sale_price !== null && product.sale_price < product.price;
  const discountPct = hasDiscount ? Math.round((1 - product.sale_price! / product.price) * 100) : 0;
  const canNegotiate = product.negotiation_enabled || product.seller?.negotiation_enabled === true;

  const sellerName = product.seller?.shop_name;
  const municipalityName = product.municipality?.name;

  return (
    <div
      onClick={() => navigate(`/product/${product.id}`)}
      className="group bg-white rounded-xl border border-brand-100 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:border-brand-200 cursor-pointer flex flex-col"
    >
      {/* Image */}
      <div className="relative aspect-square bg-cream-100 overflow-hidden">
        {primaryImage ? (
          <img
            src={primaryImage.image_url}
            alt={primaryImage.alt_text ?? product.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cream-100 to-brand-50">
            <div className="text-brand-300 text-center">
              <div className="text-4xl mb-1">📷</div>
              <p className="text-xs">No image</p>
            </div>
          </div>
        )}
        {hasDiscount && (
          <div className="absolute top-2 left-2">
            <Badge variant="accent">-{discountPct}%</Badge>
          </div>
        )}
        {canNegotiate && (
          <div className={`absolute top-2 ${hasDiscount ? 'left-16' : 'left-2'}`}>
            <Badge variant="info"><Tag className="h-3 w-3" /></Badge>
          </div>
        )}
        {product.condition && (
          <div className="absolute top-2 right-2">
            <Badge variant="default">{getConditionLabel(product.condition)}</Badge>
          </div>
        )}
        <SaveButton productId={product.id} className="absolute bottom-2 right-2 z-10" />
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-brand-950/40 flex items-center justify-center">
            <span className="text-white font-semibold text-sm bg-brand-900/80 px-3 py-1.5 rounded-lg">Out of Stock</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <h3 className="text-sm font-semibold text-brand-900 line-clamp-2 mb-1 group-hover:text-brand-600 transition-colors">
          {product.title}
        </h3>

        {sellerName && (
          <p className="text-xs text-brand-500 mb-1.5 truncate">by {sellerName}</p>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-base font-bold text-brand-800">{formatCurrency(effectivePrice)}</span>
          {hasDiscount && (
            <span className="text-xs text-brand-400 line-through">{formatCurrency(product.price)}</span>
          )}
        </div>

        {/* Location */}
        {municipalityName && (
          <div className="flex items-center gap-1 text-xs text-brand-400 mt-auto">
            <MapPin className="h-3 w-3" />
            <span>{municipalityName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface SellerCardProps {
  seller: {
    id: string;
    shop_name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    municipality?: { name: string } | null;
    is_verified: boolean;
  };
}

export function SellerCard({ seller }: SellerCardProps) {
  return (
    <div
      onClick={() => navigate(`/seller/${seller.slug}`)}
      className="group bg-white rounded-xl border border-brand-100 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:border-brand-200 cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="h-12 w-12 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg shrink-0">
          {seller.logo_url ? (
            <img src={seller.logo_url} alt={seller.shop_name} className="h-full w-full rounded-lg object-cover" />
          ) : (
            seller.shop_name[0]?.toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-brand-900 truncate group-hover:text-brand-600 transition-colors">
            {seller.shop_name}
          </h3>
          {seller.municipality?.name && (
            <div className="flex items-center gap-1 text-xs text-brand-400">
              <MapPin className="h-3 w-3" />
              <span>{seller.municipality.name}</span>
            </div>
          )}
        </div>
        {seller.is_verified && (
          <Badge variant="success" className="ml-auto shrink-0">
            <Star className="h-3 w-3" /> Verified
          </Badge>
        )}
      </div>
      {seller.description && (
        <p className="text-xs text-brand-500 line-clamp-2">{seller.description}</p>
      )}
    </div>
  );
}
