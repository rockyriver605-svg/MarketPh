import { Store, MapPin, Mail, Phone } from 'lucide-react';
import { navigate } from '@/lib/router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Municipality } from '@/types';

export function Footer() {
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);

  useEffect(() => {
    supabase.from('municipalities').select('*').order('name').then(({ data }) => {
      setMunicipalities((data as Municipality[]) ?? []);
    });
  }, []);
  return (
    <footer className="mt-auto bg-brand-900 text-cream-100">
      <div className="container-app py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                <Store className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold font-display text-white">
                Mari<span className="text-accent-400">Market</span>
              </span>
            </div>
            <p className="text-sm text-brand-300 leading-relaxed">
              The community-powered marketplace for Marinduque. Buy and sell locally across all six municipalities.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Marketplace</h4>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => navigate('/browse')} className="text-brand-300 hover:text-white transition-colors">Browse Products</button></li>
              <li><button onClick={() => navigate('/sellers')} className="text-brand-300 hover:text-white transition-colors">Find Sellers</button></li>
              <li><button onClick={() => navigate('/categories')} className="text-brand-300 hover:text-white transition-colors">Categories</button></li>
              <li><button onClick={() => navigate('/seller/setup')} className="text-brand-300 hover:text-white transition-colors">Become a Seller</button></li>
            </ul>
          </div>

          {/* Municipalities */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Municipalities</h4>
            <ul className="space-y-2 text-sm text-brand-300">
              {municipalities.map((m) => (
                <li key={m.id}>
                  <button onClick={() => navigate(`/browse?muni=${m.id}`)} className="hover:text-white transition-colors">
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Contact</h4>
            <ul className="space-y-2 text-sm text-brand-300">
              <li className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" /> Marinduque, MIMAROPA, Philippines</li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0" /> support@marimarket.ph</li>
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" /> +63 (0)42 332 0000</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-brand-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-brand-400">
            © {new Date().getFullYear()} MariMarket. Built for the people of Marinduque.
          </p>
          <div className="flex gap-4 text-xs text-brand-400">
            <button className="hover:text-white transition-colors">Privacy Policy</button>
            <button className="hover:text-white transition-colors">Terms of Service</button>
            <button className="hover:text-white transition-colors">Community Guidelines</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
