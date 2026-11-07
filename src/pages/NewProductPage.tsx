import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Package, Check, Eye, Save, Send, Plus, Trash2,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { SellerProfile, Category, Municipality, ProductCondition, ProductConditionOption } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { LocationSelect } from '@/components/location/LocationSelect';
import { ProductImageUploader } from '@/components/ProductImageUploader';
import { Badge } from '@/components/ui/Badge';
import { slugify, formatCurrency, getConditionLabel, isSecondhandCondition } from '@/lib/utils';

interface ImageData {
  id?: string;
  image_url: string;
  alt_text?: string | null;
  is_primary?: boolean;
}

interface VariantRow {
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

const STEPS = [
  { id: 1, label: 'Basic Info' },
  { id: 2, label: 'Details & Specs' },
  { id: 3, label: 'Images' },
  { id: 4, label: 'Variants' },
  { id: 5, label: 'Review & Publish' },
] as const;



const DELIVERY_OPTIONS = [
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'gcash', label: 'GCash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'maya', label: 'Maya' },
];

export function NewProductPage() {
  const { user } = useAuth();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [conditions, setConditions] = useState<ProductConditionOption[]>([]);
  const [step, setStep] = useState(1);
  const [fetching, setFetching] = useState(true);

  // Form fields
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
  const [bulkTiers, setBulkTiers] = useState<{ min_quantity: string; discount_percentage: string; label: string }[]>([]);
  const [municipalityId, setMunicipalityId] = useState('');
  const [barangayId, setBarangayId] = useState('');
  const [deliveryOptions, setDeliveryOptions] = useState<string[]>(['cod']);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [images, setImages] = useState<ImageData[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepErrors, setStepErrors] = useState<Record<number, string[]>>({});

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
      setCategories(catData as Category[] ?? []);
      setMunicipalities(muniData as Municipality[] ?? []);
      setConditions(condData as ProductConditionOption[] ?? []);
      if (sellerData?.municipality_id) setMunicipalityId(sellerData.municipality_id);
      if (sellerData?.barangay_id) setBarangayId(sellerData.barangay_id);
      setFetching(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!categoryId) { setSubcategories([]); setSubcategoryId(''); return; }
    supabase.from('categories').select('*').eq('is_active', true).eq('parent_id', categoryId).order('sort_order')
      .then(({ data }) => { setSubcategories(data as Category[] ?? []); setSubcategoryId(''); });
  }, [categoryId]);

  const topLevelCats = useMemo(() => categories, [categories]);

  const availableConditions = useMemo(() => {
    if (conditions.length === 0) return [];
    const filtered = conditions.filter((c) => c.category_group === 'all' || c.category_group === 'secondhand_all');
    return filtered.length > 0 ? filtered : conditions;
  }, [conditions]);
  const selectedCondition = conditions.find((c) => c.value === condition);

  if (!user) return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  if (fetching) return <div className="container-app py-12 animate-pulse"><div className="h-8 bg-cream-100 rounded w-1/3" /></div>;
  if (!seller) {
    return (
      <div className="container-app py-12">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <Package className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <p className="text-brand-800 font-semibold mb-2">You need a seller profile first</p>
          <p className="text-sm text-brand-500 mb-4">Create your storefront before listing products.</p>
          <Button onClick={() => navigate('/seller/setup')}>Set Up Store</Button>
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

  const validateStep = (s: number): string[] => {
    const errs: string[] = [];
    if (s === 1) {
      if (!title.trim()) errs.push('Product title is required.');
      if (!price) errs.push('Price is required.');
      else { const p = parseFloat(price); if (isNaN(p) || p < 0) errs.push('Price must be a valid positive number.'); }
      if (salePrice.trim()) { const sp = parseFloat(salePrice); const p = parseFloat(price); if (isNaN(sp) || sp < 0) errs.push('Sale price must be valid.'); else if (sp >= p) errs.push('Sale price must be less than regular price.'); }
    }
    if (s === 2) {
      const stockNum = parseInt(stock) || 0;
      if (stockNum < 0) errs.push('Stock cannot be negative.');
    }
    return errs;
  };

  const goToStep = (target: number) => {
    const errs = validateStep(step);
    if (errs.length > 0) { setStepErrors({ ...stepErrors, [step]: errs }); return; }
    setStepErrors({});
    setStep(Math.max(1, Math.min(STEPS.length, target)));
  };

  const nextStep = () => goToStep(step + 1);
  const prevStep = () => { setStepErrors({}); setStep(step - 1); };

  const buildPayload = (status: string) => {
    const priceNum = parseFloat(price);
    let salePriceNum: number | null = null;
    if (salePrice.trim()) salePriceNum = parseFloat(salePrice);
    const specObj: Record<string, string> = {};
    specs.filter((s) => s.key.trim() && s.value.trim()).forEach((s) => { specObj[s.key.trim()] = s.value.trim(); });
    const isSecondhand = ['used', 'gently_used', 'refurbished'].includes(condition);
    return {
      seller_id: seller.id,
      category_id: subcategoryId || categoryId || null,
      title: title.trim(),
      slug: slugify(title),
      description: description.trim() || null,
      price: priceNum,
      sale_price: salePriceNum,
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
      status,
      municipality_id: municipalityId || null,
      barangay_id: barangayId || null,
      delivery_options: deliveryOptions,
      pickup_enabled: pickupEnabled,
      specifications: specObj,
    };
  };

  const saveImages = async (productId: string) => {
    if (images.length === 0) return;
    const imageRows = images.map((img, i) => ({
      product_id: productId,
      image_url: img.image_url,
      alt_text: img.alt_text ?? title.trim(),
      is_primary: i === 0,
      sort_order: i,
    }));
    await supabase.from('product_images').insert(imageRows);
  };

  const saveVariants = async (productId: string) => {
    const validVariants = variants.filter((v) => v.name.trim() && v.value.trim());
    if (validVariants.length === 0) return;
    const variantRows = validVariants.map((v) => ({
      product_id: productId,
      name: v.name.trim(),
      value: v.value.trim(),
      price_override: v.price_override ? parseFloat(v.price_override) : null,
      stock: parseInt(v.stock) || 0,
      sku: v.sku.trim() || null,
    }));
    await supabase.from('product_variants').insert(variantRows);
  };

  const saveBulkTiers = async (productId: string) => {
    const validTiers = bulkTiers.filter((t) => t.min_quantity.trim() && t.discount_percentage.trim());
    if (validTiers.length === 0) return;
    const tierRows = validTiers.map((t, i) => ({
      product_id: productId,
      min_quantity: parseInt(t.min_quantity) || 1,
      discount_percentage: parseFloat(t.discount_percentage) || 0,
      label: t.label.trim() || null,
      sort_order: i,
    }));
    await supabase.from('bulk_pricing_tiers').insert(tierRows);
  };

  const handleSave = async (status: string, redirectPath: string) => {
    const allErrors = validateStep(1).concat(validateStep(2));
    if (allErrors.length > 0) {
      setStepErrors({ 1: validateStep(1), 2: validateStep(2) });
      setStep(1);
      return;
    }
    setSaving(true);
    setError(null);
    const payload = buildPayload(status);
    const { data: product, error: insertError } = await supabase.from('products').insert(payload).select('id').single();
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    await saveImages(product.id);
    await saveVariants(product.id);
    await saveBulkTiers(product.id);
    setSaving(false);
    navigate(redirectPath);
  };

  const effectivePrice = salePrice.trim() ? parseFloat(salePrice) : parseFloat(price || '0');
  const hasDiscount = salePrice.trim() && parseFloat(salePrice) < parseFloat(price || '0');
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const selectedSubcat = subcategories.find((c) => c.id === subcategoryId);
  const primaryImage = images.find((img) => img.is_primary) ?? images[0];
  const progress = (step / STEPS.length) * 100;

  return (
    <div className="container-app max-w-3xl py-8 animate-fade-in">
      <button onClick={() => navigate('/seller/dashboard')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>
      <h1 className="text-2xl font-bold text-brand-900 mb-2">Add New Product</h1>
      <p className="text-sm text-brand-500 mb-6">Create your listing step by step</p>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <button
                onClick={() => goToStep(s.id)}
                className={`flex items-center gap-2 ${i < STEPS.length - 1 ? 'flex-1' : ''}`}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors ${
                  step > s.id ? 'bg-brand-600 text-white' : step === s.id ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-brand-100 text-brand-400'
                }`}>
                  {step > s.id ? <Check className="h-4 w-4" /> : s.id}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${step >= s.id ? 'text-brand-800' : 'text-brand-400'}`}>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-2 ${step > s.id ? 'bg-brand-600' : 'bg-brand-100'}`} />}
            </div>
          ))}
        </div>
        <div className="h-1 bg-brand-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-600 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="space-y-5 bg-white rounded-2xl border border-brand-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-brand-900 flex items-center gap-2"><Package className="h-5 w-5 text-brand-500" /> Basic Information</h2>
          <Input label="Product Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Fresh Marinduque Honey" required error={stepErrors[1]?.find((e) => e.includes('title'))} />
          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe your product in detail..." />
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Price (PHP)" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" required error={stepErrors[1]?.find((e) => e.includes('Price'))} />
            <Input label="Sale Price (PHP)" type="number" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Optional" hint="Must be less than regular price" />
          </div>
          <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select a category...</option>
            {topLevelCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {subcategories.length > 0 && (
            <Select label="Subcategory" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
              <option value="">None</option>
              {subcategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          {stepErrors[1] && stepErrors[1].length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              {stepErrors[1].map((e, i) => <p key={i} className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {e}</p>)}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={nextStep}>Continue <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Step 2: Details & Specs */}
      {step === 2 && (
        <div className="space-y-5 bg-white rounded-2xl border border-brand-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-brand-900">Product Details & Specifications</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Select label="Condition" value={condition} onChange={(e) => setCondition(e.target.value as ProductCondition)}>
              {availableConditions.map((c) => <option key={c.id} value={c.value}>{c.label}</option>)}
            </Select>
            <Input label="Stock Quantity" type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="1" required error={stepErrors[2]?.find((e) => e.includes('Stock'))} />
          </div>
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
          <Input label="SKU (optional)" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g., HNY-001" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Min Order Quantity" type="number" value={minOrderQty} onChange={(e) => setMinOrderQty(e.target.value)} placeholder="1" hint="Minimum units per purchase" />
            <Input label="Max Order Quantity" type="number" value={maxOrderQty} onChange={(e) => setMaxOrderQty(e.target.value)} placeholder="Optional" hint="Maximum units per purchase" />
          </div>
          {/* Pricing & Negotiation */}
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
          {/* Scheduled promotion */}
          <div className="border border-brand-100 rounded-xl p-4 bg-cream-50/50 space-y-3">
            <p className="text-sm font-semibold text-brand-800">Scheduled Promotion (optional)</p>
            <p className="text-xs text-brand-500">Set dates for when the sale price becomes active. Leave blank for immediate effect.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Promotion Start" type="datetime-local" value={promotionStart} onChange={(e) => setPromotionStart(e.target.value)} />
              <Input label="Promotion End" type="datetime-local" value={promotionEnd} onChange={(e) => setPromotionEnd(e.target.value)} />
            </div>
          </div>
          {/* Bulk pricing tiers */}
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
                    <Input placeholder="Min qty (e.g., 10)" type="number" value={tier.min_quantity} onChange={(e) => updateBulkTier(i, 'min_quantity', e.target.value)} className="w-32" />
                    <Input placeholder="Discount % (e.g., 10)" type="number" value={tier.discount_percentage} onChange={(e) => updateBulkTier(i, 'discount_percentage', e.target.value)} className="w-32" />
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
              <p className="text-xs text-brand-400 bg-cream-50 rounded-lg p-3">No specifications added. Add key-value pairs like weight, material, dimensions, etc.</p>
            ) : (
              <div className="space-y-2">
                {specs.map((spec, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Input placeholder="Spec name (e.g., Weight)" value={spec.key} onChange={(e) => updateSpec(i, 'key', e.target.value)} className="flex-1" />
                    <Input placeholder="Value (e.g., 1kg)" value={spec.value} onChange={(e) => updateSpec(i, 'value', e.target.value)} className="flex-1" />
                    <button type="button" onClick={() => removeSpec(i)} className="p-2.5 text-brand-400 hover:text-red-500 hover:bg-red-50 rounded-lg mt-0.5 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={prevStep}><ArrowLeft className="h-4 w-4" /> Back</Button>
            <Button onClick={nextStep}>Continue <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Step 3: Images */}
      {step === 3 && (
        <div className="space-y-5 bg-white rounded-2xl border border-brand-100 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-brand-900">Product Images</h2>
          <ProductImageUploader userId={user.id} existingImages={images} onImagesChange={setImages} />
          <div className="bg-cream-50 border border-brand-100 rounded-lg p-3 text-xs text-brand-500">
            <p className="font-medium text-brand-700 mb-1">Tips for great product images:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Use well-lit, clear photos</li>
              <li>Show the product from multiple angles</li>
              <li>The first image will be the primary display image</li>
              <li>Use arrows to reorder images by importance</li>
            </ul>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={prevStep}><ArrowLeft className="h-4 w-4" /> Back</Button>
            <Button onClick={nextStep}>Continue <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Step 4: Variants */}
      {step === 4 && (
        <div className="space-y-5 bg-white rounded-2xl border border-brand-100 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-900">Product Variants</h2>
            <Button size="sm" variant="outline" onClick={addVariant}><Plus className="h-4 w-4" /> Add Variant</Button>
          </div>
          {variants.length === 0 ? (
            <p className="text-xs text-brand-400 bg-cream-50 rounded-lg p-3">
              No variants added. Variants let buyers choose between options like size, color, or weight. Skip this step if your product has a single option.
            </p>
          ) : (
            <div className="space-y-3">
              {variants.map((variant, i) => (
                <div key={i} className="border border-brand-100 rounded-xl p-4 space-y-3 bg-cream-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand-600">Variant {i + 1}</span>
                    <button type="button" onClick={() => removeVariant(i)} className="text-brand-400 hover:text-red-500 transition-colors p-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Input label="Name" placeholder="e.g., Size" value={variant.name} onChange={(e) => updateVariant(i, 'name', e.target.value)} />
                    <Input label="Value" placeholder="e.g., 500ml" value={variant.value} onChange={(e) => updateVariant(i, 'value', e.target.value)} />
                    <Input label="Price Override (PHP)" type="number" step="0.01" placeholder="Optional" value={variant.price_override} onChange={(e) => updateVariant(i, 'price_override', e.target.value)} />
                    <Input label="Stock" type="number" placeholder="0" value={variant.stock} onChange={(e) => updateVariant(i, 'stock', e.target.value)} />
                    <Input label="Variant SKU" placeholder="Optional" value={variant.sku} onChange={(e) => updateVariant(i, 'sku', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={prevStep}><ArrowLeft className="h-4 w-4" /> Back</Button>
            <Button onClick={nextStep}>Continue <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Step 5: Review & Publish */}
      {step === 5 && (
        <div className="space-y-5">
          {/* Preview card */}
          <div className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-3 bg-brand-50 border-b border-brand-100">
              <Eye className="h-4 w-4 text-brand-600" />
              <span className="text-sm font-semibold text-brand-800">Listing Preview</span>
            </div>
            <div className="p-6 grid sm:grid-cols-2 gap-6">
              <div className="aspect-square bg-cream-100 rounded-xl overflow-hidden">
                {primaryImage ? (
                  <img src={primaryImage.image_url} alt={title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-brand-300"><Package className="h-16 w-16" /></div>
                )}
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-bold text-brand-900">{title || 'Untitled product'}</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">{getConditionLabel(condition)}</Badge>
                  {selectedSubcat ? <Badge variant="info">{selectedSubcat.name}</Badge> : selectedCategory ? <Badge variant="info">{selectedCategory.name}</Badge> : null}
                  {hasDiscount && <Badge variant="accent">On Sale</Badge>}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-brand-800">{formatCurrency(effectivePrice)}</span>
                  {hasDiscount && <span className="text-sm text-brand-400 line-through">{formatCurrency(parseFloat(price))}</span>}
                </div>
                {description && <p className="text-sm text-brand-600 line-clamp-4">{description}</p>}
                <div className="text-xs text-brand-400 space-y-1">
                  <p>Stock: {parseInt(stock) || 0} units</p>
                  {deliveryOptions.length > 0 && <p>Delivery: {deliveryOptions.map((d) => DELIVERY_OPTIONS.find((o) => o.value === d)?.label ?? d).join(', ')}</p>}
                  {pickupEnabled && <p>Pickup: Available</p>}
                  {specs.filter((s) => s.key.trim()).length > 0 && (
                    <div className="pt-1">
                      <p className="font-medium text-brand-600 mb-0.5">Specifications:</p>
                      {specs.filter((s) => s.key.trim() && s.value.trim()).map((s, i) => <p key={i}>{s.key}: {s.value}</p>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Publish actions */}
          <div className="bg-white rounded-2xl border border-brand-100 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-brand-900">Publish Your Listing</h2>
            <p className="text-sm text-brand-500">Choose how to save your listing. You can save it as a draft to continue later, or publish it to make it visible to buyers.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <button
                onClick={() => handleSave('draft', '/seller/dashboard')}
                disabled={saving}
                className="flex flex-col items-center gap-2 p-4 bg-cream-50 rounded-xl border border-brand-100 hover:border-brand-300 transition-colors text-center"
              >
                <Save className="h-5 w-5 text-brand-600" />
                <div>
                  <p className="text-sm font-semibold text-brand-900">Save as Draft</p>
                  <p className="text-xs text-brand-400">Edit and publish later</p>
                </div>
              </button>
              <button
                onClick={() => handleSave('published', `/product/`)}
                disabled={saving}
                className="flex flex-col items-center gap-2 p-4 bg-brand-50 rounded-xl border border-brand-200 hover:border-brand-400 transition-colors text-center"
              >
                <CheckCircle2 className="h-5 w-5 text-brand-600" />
                <div>
                  <p className="text-sm font-semibold text-brand-900">Publish Now</p>
                  <p className="text-xs text-brand-400">Visible to buyers</p>
                </div>
              </button>
              <button
                onClick={() => handleSave('pending_review', '/seller/dashboard')}
                disabled={saving}
                className="flex flex-col items-center gap-2 p-4 bg-accent-50 rounded-xl border border-accent-200 hover:border-accent-400 transition-colors text-center"
              >
                <Send className="h-5 w-5 text-accent-600" />
                <div>
                  <p className="text-sm font-semibold text-brand-900">Submit for Review</p>
                  <p className="text-xs text-brand-400">Await moderator approval</p>
                </div>
              </button>
            </div>
            {saving && <p className="text-xs text-brand-400 text-center">Saving your listing...</p>}
            <div className="flex justify-between pt-2 border-t border-brand-50">
              <Button variant="ghost" onClick={prevStep}><ArrowLeft className="h-4 w-4" /> Back</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
