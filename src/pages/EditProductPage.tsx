import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Trash2, AlertCircle, Plus, Save, Send, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { SellerProfile, Category, Municipality, Product, ProductImage, ProductVariant, ProductStatus, ProductCondition, ProductConditionOption, BulkPricingTier } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { LocationSelect } from '@/components/location/LocationSelect';
import { ProductImageUploader } from '@/components/ProductImageUploader';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { slugify, isSecondhandCondition } from '@/lib/utils';
import { extractStoragePath } from '@/lib/imageOptimize';

interface ImageData {
  id?: string;
  image_url: string;
  alt_text?: string | null;
  is_primary?: boolean;
}

interface VariantRow {
  id?: string;
  name: string;
  value: string;
  price_override: string;
  stock: string;
  sku: string;
}

interface SpecRow {
  key: string;
  value: string;
}

const DELIVERY_OPTIONS = [
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'gcash', label: 'GCash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'maya', label: 'Maya' },
];

export function EditProductPage({ productId }: { productId: string }) {
  const { user } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [topCategories, setTopCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [conditions, setConditions] = useState<ProductConditionOption[]>([]);
  const [product, setProduct] = useState<(Product & { product_images: ProductImage[]; product_variants: ProductVariant[] }) | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [stock, setStock] = useState('1');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [condition, setCondition] = useState<ProductCondition>('brand_new');
  const [conditionDescription, setConditionDescription] = useState('');
  const [productAge, setProductAge] = useState('');
  const [defects, setDefects] = useState('');
  const [repairHistory, setRepairHistory] = useState('');
  const [warrantyInfo, setWarrantyInfo] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [minOrderQty, setMinOrderQty] = useState('1');
  const [maxOrderQty, setMaxOrderQty] = useState('');
  const [promotionStart, setPromotionStart] = useState('');
  const [promotionEnd, setPromotionEnd] = useState('');
  const [negotiationEnabled, setNegotiationEnabled] = useState(false);
  const [minOfferPrice, setMinOfferPrice] = useState('');
  const [bulkTiers, setBulkTiers] = useState<{ id?: string; min_quantity: string; discount_percentage: string; label: string }[]>([]);
  const [municipalityId, setMunicipalityId] = useState('');
  const [barangayId, setBarangayId] = useState('');
  const [status, setStatus] = useState<ProductStatus>('draft');
  const [images, setImages] = useState<ImageData[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<string[]>([]);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadSubcategories = useCallback((parentCatId: string) => {
    if (!parentCatId) { setSubcategories([]); return; }
    supabase.from('categories').select('*').eq('is_active', true).eq('parent_id', parentCatId).order('sort_order')
      .then(({ data }) => setSubcategories(data as Category[] ?? []));
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: sellerData }, { data: catData }, { data: muniData }, { data: condData }] = await Promise.all([
        supabase.from('seller_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('categories').select('*').eq('is_active', true).is('parent_id', null).order('sort_order'),
        supabase.from('municipalities').select('*').order('name'),
        supabase.from('product_conditions').select('*').eq('is_active', true).order('sort_order'),
      ]);
      setSeller(sellerData as SellerProfile | null);
      setTopCategories(catData as Category[] ?? []);
      setMunicipalities(muniData as Municipality[] ?? []);
      setConditions(condData as ProductConditionOption[] ?? []);

      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('*, product_images(*), product_variants(*)')
        .eq('id', productId)
        .maybeSingle();

      if (prodErr || !prodData) { setNotFound(true); setFetching(false); return; }
      const prod = prodData as Product & { product_images: ProductImage[]; product_variants: ProductVariant[] };
      setProduct(prod);
      setTitle(prod.title);
      setDescription(prod.description ?? '');
      setPrice(String(prod.price));
      setSalePrice(prod.sale_price ? String(prod.sale_price) : '');
      setStock(String(prod.stock));
      setSku(prod.sku ?? '');
      setCondition(prod.condition);
      setConditionDescription(prod.condition_description ?? '');
      setProductAge(prod.product_age ?? '');
      setDefects(prod.defects ?? '');
      setRepairHistory(prod.repair_history ?? '');
      setWarrantyInfo(prod.warranty_info ?? '');
      setConditionNotes(prod.condition_notes ?? '');
      setMinOrderQty(String(prod.min_order_quantity ?? 1));
      setMaxOrderQty(prod.max_order_quantity ? String(prod.max_order_quantity) : '');
      if (prod.promotion_start_at) setPromotionStart(new Date(prod.promotion_start_at).toISOString().slice(0, 16));
      if (prod.promotion_end_at) setPromotionEnd(new Date(prod.promotion_end_at).toISOString().slice(0, 16));
      setNegotiationEnabled(prod.negotiation_enabled ?? false);
      setMinOfferPrice(prod.min_offer_price ? String(prod.min_offer_price) : '');

      const { data: tierData } = await supabase.from('bulk_pricing_tiers').select('*').eq('product_id', productId).order('sort_order');
      setBulkTiers((tierData as BulkPricingTier[] | null)?.map((t) => ({ id: t.id, min_quantity: String(t.min_quantity), discount_percentage: String(t.discount_percentage), label: t.label ?? '' })) ?? []);
      setStatus(prod.status);
      setDeliveryOptions(prod.delivery_options ?? []);
      setPickupEnabled(prod.pickup_enabled);

      const specObj = prod.specifications as Record<string, string> | null;
      setSpecs(specObj ? Object.entries(specObj).map(([key, value]) => ({ key, value })) : []);

      setImages((prod.product_images ?? []).map((img) => ({ id: img.id, image_url: img.image_url, alt_text: img.alt_text, is_primary: img.is_primary })));
      setVariants((prod.product_variants ?? []).map((v) => ({
        id: v.id, name: v.name, value: v.value,
        price_override: v.price_override ? String(v.price_override) : '',
        stock: String(v.stock), sku: v.sku ?? '',
      })));

      if (prod.category_id) {
        const { data: cat } = await supabase.from('categories').select('id, parent_id').eq('id', prod.category_id).maybeSingle();
        if (cat?.parent_id) {
          setCategoryId(cat.parent_id);
          setSubcategoryId(prod.category_id);
          loadSubcategories(cat.parent_id);
        } else {
          setCategoryId(prod.category_id);
        }
      }
      setMunicipalityId(prod.municipality_id ?? '');
      setBarangayId(prod.barangay_id ?? '');
      setFetching(false);
    })();
  }, [user, productId, loadSubcategories]);

  useEffect(() => {
    if (categoryId) loadSubcategories(categoryId);
    else setSubcategories([]);
  }, [categoryId, loadSubcategories]);

  const availableConditions = useMemo(() => {
    if (conditions.length === 0) return [];
    const filtered = conditions.filter((c) => c.category_group === 'all' || c.category_group === 'secondhand_all');
    return filtered.length > 0 ? filtered : conditions;
  }, [conditions]);
  const selectedCondition = conditions.find((c) => c.value === condition);

  if (!user) return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  if (fetching) return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/3" /></div>;
  if (notFound || !product || !seller) {
    return (
      <div className="container-app py-12">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <p className="text-brand-800 font-semibold mb-2">Product not found</p>
          <p className="text-sm text-brand-500 mb-4">This product may have been deleted, or you do not have permission to edit it.</p>
          <Button onClick={() => navigate('/seller/dashboard')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const toggleDelivery = (opt: string) => {
    setDeliveryOptions((prev) => prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]);
  };

  const addVariant = () => setVariants((prev) => [...prev, { name: '', value: '', price_override: '', stock: '', sku: '' }]);
  const updateVariant = (i: number, field: keyof VariantRow, val: string) => setVariants((prev) => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v));
  const removeVariant = (i: number) => setVariants((prev) => prev.filter((_, idx) => idx !== i));

  const addSpec = () => setSpecs((prev) => [...prev, { key: '', value: '' }]);
  const updateSpec = (i: number, field: keyof SpecRow, val: string) => setSpecs((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  const removeSpec = (i: number) => setSpecs((prev) => prev.filter((_, idx) => idx !== i));

  const addBulkTier = () => setBulkTiers((prev) => [...prev, { min_quantity: '', discount_percentage: '', label: '' }]);
  const updateBulkTier = (i: number, field: 'min_quantity' | 'discount_percentage' | 'label', val: string) => setBulkTiers((prev) => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));
  const removeBulkTier = (i: number) => setBulkTiers((prev) => prev.filter((_, idx) => idx !== i));

  const validate = (): string | null => {
    if (!title.trim()) return 'Title is required.';
    if (!price) return 'Price is required.';
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) return 'Price must be a valid positive number.';
    if (parseInt(stock) < 0) return 'Stock cannot be negative.';
    if (salePrice.trim()) {
      const sp = parseFloat(salePrice);
      if (isNaN(sp) || sp < 0) return 'Sale price must be valid.';
      if (sp >= priceNum) return 'Sale price must be less than the regular price.';
    }
    return null;
  };

  const syncImages = async () => {
    const oldImageIds = product.product_images?.map((img) => img.id) ?? [];
    const keptIds = images.filter((img) => img.id).map((img) => img.id);
    const toDelete = oldImageIds.filter((id) => !keptIds.includes(id));
    const toInsert = images.filter((img) => !img.id);
    if (toDelete.length > 0) {
      const deletedImages = product.product_images?.filter((img) => toDelete.includes(img.id)) ?? [];
      const storagePaths = deletedImages.map((img) => extractStoragePath(img.image_url)).filter((p): p is string => !!p);
      if (storagePaths.length > 0) { try { await supabase.storage.from('product-images').remove(storagePaths); } catch { /* best-effort */ } }
      await supabase.from('product_images').delete().in('id', toDelete);
    }
    if (toInsert.length > 0) {
      await supabase.from('product_images').insert(
        toInsert.map((img) => ({
          product_id: productId,
          image_url: img.image_url,
          alt_text: img.alt_text ?? title.trim(),
          is_primary: img.is_primary ?? false,
          sort_order: images.indexOf(img),
        })),
      );
    }
    for (const img of images) {
      if (img.id) {
        await supabase.from('product_images').update({ is_primary: img.is_primary ?? false, sort_order: images.indexOf(img) }).eq('id', img.id);
      }
    }
  };

  const syncBulkTiers = async () => {
    const { data: existing } = await supabase.from('bulk_pricing_tiers').select('id').eq('product_id', productId);
    const existingIds = (existing ?? []).map((t) => t.id);
    const keptIds = bulkTiers.filter((t) => t.id).map((t) => t.id);
    const toDelete = existingIds.filter((id) => !keptIds.includes(id));
    if (toDelete.length > 0) await supabase.from('bulk_pricing_tiers').delete().in('id', toDelete);
    for (const t of bulkTiers) {
      if (!t.min_quantity.trim() || !t.discount_percentage.trim()) continue;
      const payload = {
        product_id: productId,
        min_quantity: parseInt(t.min_quantity) || 1,
        discount_percentage: parseFloat(t.discount_percentage) || 0,
        label: t.label.trim() || null,
      };
      if (t.id) {
        await supabase.from('bulk_pricing_tiers').update(payload).eq('id', t.id);
      } else {
        await supabase.from('bulk_pricing_tiers').insert(payload);
      }
    }
  };

  const syncVariants = async () => {
    const oldVariantIds = product.product_variants?.map((v) => v.id) ?? [];
    const keptVariantIds = variants.filter((v) => v.id).map((v) => v.id);
    const toDelete = oldVariantIds.filter((id) => !keptVariantIds.includes(id));
    if (toDelete.length > 0) await supabase.from('product_variants').delete().in('id', toDelete);
    for (const v of variants) {
      if (v.name.trim() && v.value.trim()) {
        const payload = {
          product_id: productId,
          name: v.name.trim(),
          value: v.value.trim(),
          price_override: v.price_override ? parseFloat(v.price_override) : null,
          stock: parseInt(v.stock) || 0,
          sku: v.sku.trim() || null,
        };
        if (v.id) {
          await supabase.from('product_variants').update(payload).eq('id', v.id);
        } else {
          await supabase.from('product_variants').insert(payload);
        }
      }
    }
  };

  const handleSave = async (e: FormEvent, targetStatus?: ProductStatus) => {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    const finalStatus = targetStatus ?? status;
    const specObj: Record<string, string> = {};
    specs.filter((s) => s.key.trim() && s.value.trim()).forEach((s) => { specObj[s.key.trim()] = s.value.trim(); });

    const isSecondhand = ['used', 'gently_used', 'refurbished'].includes(condition);
    const { error: updateError } = await supabase
      .from('products')
      .update({
        title: title.trim(),
        slug: slugify(title),
        description: description.trim() || null,
        price: parseFloat(price),
        sale_price: salePrice.trim() ? parseFloat(salePrice) : null,
        stock: parseInt(stock) || 0,
        sku: sku.trim() || null,
        condition,
        condition_description: conditionDescription.trim() || null,
        product_age: isSecondhand ? (productAge.trim() || null) : null,
        defects: isSecondhand ? (defects.trim() || null) : null,
        repair_history: isSecondhand ? (repairHistory.trim() || null) : null,
        warranty_info: warrantyInfo.trim() || null,
        condition_notes: conditionNotes.trim() || null,
        min_order_quantity: parseInt(minOrderQty) || 1,
        max_order_quantity: maxOrderQty.trim() ? parseInt(maxOrderQty) : null,
        promotion_start_at: promotionStart ? new Date(promotionStart).toISOString() : null,
        promotion_end_at: promotionEnd ? new Date(promotionEnd).toISOString() : null,
        negotiation_enabled: negotiationEnabled,
        min_offer_price: minOfferPrice.trim() ? parseFloat(minOfferPrice) : null,
        status: finalStatus,
        category_id: subcategoryId || categoryId || null,
        municipality_id: municipalityId || null,
        barangay_id: barangayId || null,
        delivery_options: deliveryOptions,
        pickup_enabled: pickupEnabled,
        specifications: specObj,
        moderation_note: finalStatus === 'published' || finalStatus === 'pending_review' ? null : product.moderation_note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (updateError) { setError(updateError.message); setLoading(false); return; }

    await syncImages();
    await syncVariants();
    await syncBulkTiers();

    setLoading(false);
    if (targetStatus === 'pending_review') setNotice('Listing submitted for review.');
    else if (targetStatus === 'published') setNotice('Listing published.');
    else setNotice('Changes saved.');
    setTimeout(() => navigate('/seller/dashboard'), 800);
  };

  const handleDelete = async () => {
    setDeleteBusy(true);
    const allImages = product.product_images ?? [];
    const storagePaths = allImages.map((img) => extractStoragePath(img.image_url)).filter((p): p is string => !!p);
    if (storagePaths.length > 0) { try { await supabase.storage.from('product-images').remove(storagePaths); } catch { /* best-effort */ } }
    await supabase.from('product_images').delete().eq('product_id', productId);
    await supabase.from('product_variants').delete().eq('product_id', productId);
    const { error: delError } = await supabase.from('products').delete().eq('id', productId);
    setDeleteBusy(false);
    if (delError) { setError(delError.message); setDeleteOpen(false); return; }
    navigate('/seller/dashboard');
  };

  const canDelete = status !== 'published' || stock === '0';
  const isRejected = status === 'rejected';

  return (
    <div className="container-app max-w-2xl py-8 animate-fade-in">
      <button onClick={() => navigate('/seller/dashboard')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Edit Product</h1>
          <Badge variant={isRejected ? 'error' : 'default'} className="mt-1">{status.replace(/_/g, ' ')}</Badge>
        </div>
        {canDelete && (
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      {isRejected && product.moderation_note && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <p className="font-semibold mb-0.5 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Listing rejected by moderator</p>
          <p>{product.moderation_note}</p>
          <p className="mt-2 text-xs text-red-600">Make your changes and resubmit for review or publish directly.</p>
        </div>
      )}

      {notice && <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-sm text-emerald-800">{notice}</div>}

      <form onSubmit={(e) => handleSave(e)} className="space-y-5 bg-white rounded-2xl border border-brand-100 shadow-sm p-6">
        <Input label="Product Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Fresh Marinduque Honey" required />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe your product..." />
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Price (PHP)" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" required />
          <Input label="Sale Price (PHP)" type="number" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Optional" hint="Must be less than regular price" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Stock Quantity" type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="1" required />
          <Input label="SKU (optional)" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g., HNY-001" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Condition" value={condition} onChange={(e) => setCondition(e.target.value as ProductCondition)}>
            {availableConditions.map((c) => <option key={c.id} value={c.value}>{c.label}</option>)}
          </Select>
        </div>
        {subcategories.length > 0 && (
          <Select label="Subcategory" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
            <option value="">None</option>
            {subcategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        {selectedCondition && selectedCondition.description && (
          <p className="text-xs text-brand-500 bg-cream-50 rounded-lg p-2.5">{selectedCondition.description}</p>
        )}
        <Textarea label="Condition Description" value={conditionDescription} onChange={(e) => setConditionDescription(e.target.value)} rows={2} placeholder="Describe the overall condition of the item..." />
        {isSecondhandCondition(condition) && (
          <div className="space-y-4 border border-brand-100 rounded-xl p-4 bg-cream-50/50">
            <p className="text-sm font-semibold text-brand-800">Secondhand Details</p>
            <Input label="Product Age" value={productAge} onChange={(e) => setProductAge(e.target.value)} placeholder="e.g., 2 years old" />
            <Textarea label="Defects or Damage" value={defects} onChange={(e) => setDefects(e.target.value)} rows={2} placeholder="Describe any visible defects, scratches, or damage..." />
            <Textarea label="Repair History" value={repairHistory} onChange={(e) => setRepairHistory(e.target.value)} rows={2} placeholder="Any repairs or modifications done? Leave blank if none..." />
          </div>
        )}
        <Input label="Warranty Information" value={warrantyInfo} onChange={(e) => setWarrantyInfo(e.target.value)} placeholder="e.g., 7-day personal warranty, or 'No warranty'" />
        <Textarea label="Additional Condition Notes" value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} rows={2} placeholder="Any other notes about the item's condition..." />
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Min Order Quantity" type="number" value={minOrderQty} onChange={(e) => setMinOrderQty(e.target.value)} placeholder="1" hint="Minimum units per purchase" />
          <Input label="Max Order Quantity" type="number" value={maxOrderQty} onChange={(e) => setMaxOrderQty(e.target.value)} placeholder="Optional" hint="Maximum units per purchase" />
        </div>
        <div className="border border-brand-100 rounded-xl p-4 bg-cream-50/50 space-y-4">
          <p className="text-sm font-semibold text-brand-800">Pricing & Negotiation</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={negotiationEnabled} onChange={(e) => setNegotiationEnabled(e.target.checked)} className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500" />
            <span className="text-sm text-brand-700">Allow buyers to make offers on this product</span>
          </label>
          {negotiationEnabled && (
            <Input label="Minimum Acceptable Offer (PHP)" type="number" step="0.01" value={minOfferPrice} onChange={(e) => setMinOfferPrice(e.target.value)} placeholder="Optional" hint="Lowest offer amount you'll accept" />
          )}
        </div>
        <div className="border border-brand-100 rounded-xl p-4 bg-cream-50/50 space-y-3">
          <p className="text-sm font-semibold text-brand-800">Scheduled Promotion (optional)</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Promotion Start" type="datetime-local" value={promotionStart} onChange={(e) => setPromotionStart(e.target.value)} />
            <Input label="Promotion End" type="datetime-local" value={promotionEnd} onChange={(e) => setPromotionEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-brand-900">Bulk Pricing Tiers</label>
            <button type="button" onClick={addBulkTier} className="text-xs font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add tier
            </button>
          </div>
          {bulkTiers.length === 0 ? (
            <p className="text-xs text-brand-400 bg-cream-50 rounded-lg p-3">Offer discounts for larger quantities (e.g., buy 10+ get 10% off).</p>
          ) : (
            <div className="space-y-2">
              {bulkTiers.map((tier, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input placeholder="Min qty" type="number" value={tier.min_quantity} onChange={(e) => updateBulkTier(i, 'min_quantity', e.target.value)} className="w-28" />
                  <Input placeholder="Discount %" type="number" value={tier.discount_percentage} onChange={(e) => updateBulkTier(i, 'discount_percentage', e.target.value)} className="w-28" />
                  <Input placeholder="Label (optional)" value={tier.label} onChange={(e) => updateBulkTier(i, 'label', e.target.value)} className="flex-1" />
                  <button type="button" onClick={() => removeBulkTier(i)} className="p-2.5 text-brand-400 hover:text-red-500 hover:bg-red-50 rounded-lg mt-0.5 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <LocationSelect
          municipalities={municipalities}
          municipalityId={municipalityId}
          barangayId={barangayId}
          onMunicipalityChange={setMunicipalityId}
          onBarangayChange={setBarangayId}
        />
        <ProductImageUploader userId={user.id} existingImages={images} onImagesChange={setImages} />
        <div>
          <label className="block text-sm font-medium text-brand-900 mb-1.5">Delivery Options</label>
          <div className="flex flex-wrap gap-2">
            {DELIVERY_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => toggleDelivery(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${deliveryOptions.includes(opt.value) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-brand-700 border-brand-200 hover:border-brand-400'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={pickupEnabled} onChange={(e) => setPickupEnabled(e.target.checked)} className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500" />
          <span className="text-sm text-brand-700">Allow in-person pickup</span>
        </label>

        {/* Specifications */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-brand-900">Product Specifications</label>
            <button type="button" onClick={addSpec} className="text-xs font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add spec
            </button>
          </div>
          {specs.length === 0 ? (
            <p className="text-xs text-brand-400 bg-cream-50 rounded-lg p-3">No specifications added.</p>
          ) : (
            <div className="space-y-2">
              {specs.map((spec, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input placeholder="Spec name" value={spec.key} onChange={(e) => updateSpec(i, 'key', e.target.value)} className="flex-1" />
                  <Input placeholder="Value" value={spec.value} onChange={(e) => updateSpec(i, 'value', e.target.value)} className="flex-1" />
                  <button type="button" onClick={() => removeSpec(i)} className="p-2.5 text-brand-400 hover:text-red-500 hover:bg-red-50 rounded-lg mt-0.5 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Variants */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-brand-900">Product Variants</label>
            <button type="button" onClick={addVariant} className="text-xs font-medium text-brand-600 hover:text-brand-800 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add variant
            </button>
          </div>
          {variants.length === 0 ? (
            <p className="text-xs text-brand-400 bg-cream-50 rounded-lg p-3">No variants added.</p>
          ) : (
            <div className="space-y-3">
              {variants.map((variant, i) => (
                <div key={i} className="border border-brand-100 rounded-xl p-3 space-y-2 bg-cream-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand-600">Variant {i + 1}</span>
                    <button type="button" onClick={() => removeVariant(i)} className="text-brand-400 hover:text-red-500 transition-colors p-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <Input placeholder="Name (e.g., Size)" value={variant.name} onChange={(e) => updateVariant(i, 'name', e.target.value)} />
                    <Input placeholder="Value (e.g., 500ml)" value={variant.value} onChange={(e) => updateVariant(i, 'value', e.target.value)} />
                    <Input label="Price Override" type="number" step="0.01" placeholder="Optional" value={variant.price_override} onChange={(e) => updateVariant(i, 'price_override', e.target.value)} />
                    <Input label="Stock" type="number" placeholder="0" value={variant.stock} onChange={(e) => updateVariant(i, 'stock', e.target.value)} />
                    <Input placeholder="Variant SKU" value={variant.sku} onChange={(e) => updateVariant(i, 'sku', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {status !== 'archived' && status !== 'sold_out' && (
          <Select label="Listing Status" value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)}>
            <option value="draft">Draft (not visible)</option>
            <option value="published">Published (visible to buyers)</option>
            <option value="paused">Paused (temporarily hidden)</option>
            <option value="archived">Archived (hidden, kept for records)</option>
            {isRejected && <option value="pending_review">Resubmit for Review</option>}
          </Select>
        )}

        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" size="lg" loading={loading} className="flex-1">
            <Save className="h-4 w-4" /> Save Changes
          </Button>
          {isRejected && (
            <Button type="button" size="lg" variant="accent" loading={loading} onClick={(e) => handleSave(e as unknown as FormEvent, 'pending_review')}>
              <Send className="h-4 w-4" /> Resubmit for Review
            </Button>
          )}
          {(status === 'draft' || isRejected) && (
            <Button type="button" size="lg" loading={loading} onClick={(e) => handleSave(e as unknown as FormEvent, 'published')}>
              <CheckCircle2 className="h-4 w-4" /> Publish Now
            </Button>
          )}
        </div>
      </form>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete product" size="sm">
        <p className="text-sm text-brand-600 mb-5">
          Permanently delete "{product.title}"? This removes the listing, all images, and variants. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleteBusy}>Delete permanently</Button>
        </div>
      </Modal>
    </div>
  );
}
