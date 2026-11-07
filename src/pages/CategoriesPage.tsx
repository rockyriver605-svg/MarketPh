import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Package, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { navigate } from '@/lib/router';
import type { Category } from '@/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { getCategoryIcon } from '@/lib/categoryIcons';

interface CategoryWithChildren extends Category {
  children: Category[];
  product_count: number;
}

export function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('categories').select('*').order('sort_order');
      const all = (data as Category[]) ?? [];
      const productCounts = await Promise.all(
        all.map(async (cat) => {
          const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('category_id', cat.id).eq('status', 'published');
          return { id: cat.id, count: count ?? 0 };
        }),
      );
      const countMap = new Map(productCounts.map((p) => [p.id, p.count]));
      const buildTree = (parentId: string | null): CategoryWithChildren[] =>
        all
          .filter((c) => c.parent_id === parentId && c.is_active)
          .map((c) => ({ ...c, children: buildTree(c.id), product_count: countMap.get(c.id) ?? 0 }))
          .sort((a, b) => a.sort_order - b.sort_order);
      setCategories(buildTree(null));
      setLoading(false);
    })();
  }, []);

  const filtered = search.trim()
    ? categories.filter((cat) =>
        cat.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        cat.children.some((sub) => sub.name.toLowerCase().includes(search.trim().toLowerCase())),
      )
    : categories;

  return (
    <div className="container-app py-8 animate-fade-in">
      <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </button>
      <h1 className="text-2xl font-bold text-brand-900 mb-2">Categories</h1>
      <p className="text-sm text-brand-500 mb-6">Browse products by category across Marinduque</p>

      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories..."
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 bg-cream-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((cat) => {
            const Icon = getCategoryIcon(cat.icon_name);
            return (
              <div key={cat.id} className="bg-white rounded-xl border border-brand-100 overflow-hidden hover:shadow-md transition-all">
                <button
                  onClick={() => navigate(`/browse?category=${cat.slug}`)}
                  className="w-full flex items-start gap-3 p-5 text-left group"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-100 transition-colors shrink-0">
                    {cat.image_url ? <img src={cat.image_url} alt={cat.name} className="h-full w-full rounded-xl object-cover" /> : <Icon className="h-6 w-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-brand-900 group-hover:text-brand-600 transition-colors">{cat.name}</h3>
                    {cat.description && <p className="text-xs text-brand-500 mt-1 line-clamp-2">{cat.description}</p>}
                    <p className="text-xs text-brand-400 mt-1">{cat.product_count} listing{cat.product_count === 1 ? '' : 's'}</p>
                  </div>
                </button>
                {cat.children.length > 0 && (
                  <div className="border-t border-brand-50 px-5 py-3">
                    <p className="text-xs font-medium text-brand-400 mb-2">Subcategories</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.children.slice(0, 6).map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => navigate(`/browse?category=${sub.slug}`)}
                          className="flex items-center gap-0.5 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded-md transition-colors"
                        >
                          {sub.name}
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      ))}
                      {cat.children.length > 6 && (
                        <span className="text-xs text-brand-400 px-2 py-1">+{cat.children.length - 6} more</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title={search ? 'No matching categories' : 'No categories yet'}
          description={search ? 'Try a different search term.' : 'Categories will appear here once they are set up.'}
        />
      )}
    </div>
  );
}
