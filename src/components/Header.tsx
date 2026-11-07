import { useEffect, useState } from 'react';
import { Search, ShoppingCart, MessageCircle, Store, Menu, X, User, LogOut, Package, LayoutDashboard, Heart, MapPinned, Settings, AlertCircle, Tag, Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

export function Header() {
  const { user, profile, role, availableRoles, switchActiveRole, signOut, suspended } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user) {
      setCartCount(0);
      return;
    }
    (async () => {
      const { data: cart } = await supabase
        .from('carts')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cart) {
        const { count } = await supabase
          .from('cart_items')
          .select('*', { count: 'exact', head: true })
          .eq('cart_id', cart.id);
        setCartCount(count ?? 0);
      }
    })();
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/browse?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/browse');
    }
    setMobileMenuOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    setUserMenuOpen(false);
    navigate('/');
  };

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Products', path: '/browse' },
    { label: 'Categories', path: '/categories' },
    { label: 'Stores', path: '/sellers' },
    { label: 'Riders', path: '/riders' },
    { label: 'Deals', path: '/promotions' },
    { label: 'Business Tools', path: '/seller/tools' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-brand-100 shadow-sm">
      {suspended && user && (
        <div className="bg-red-600 text-white text-xs">
          <div className="container-app flex items-center gap-2 h-8">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Your account is suspended. Some features are unavailable.</span>
          </div>
        </div>
      )}
      <div className="bg-brand-800 text-cream-100 text-xs">
        <div className="container-app flex items-center justify-between h-8">
          <span className="hidden sm:block">Marinduque's Community Marketplace</span>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block">Delivering across all 6 municipalities</span>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="container-app">
        <div className="flex items-center gap-4 h-16">
          {/* Logo */}
          <button onClick={() => navigate('/')} className="flex items-center gap-2 shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Store className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold font-display text-brand-800 hidden sm:block">
              Mari<span className="text-accent-500">Market</span>
            </span>
          </button>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-xl hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products in Marinduque..."
                className="w-full h-10 pl-10 pr-4 rounded-lg border border-brand-200 bg-cream-50 text-sm text-brand-950 placeholder:text-brand-400 focus:border-brand-500 focus:bg-white transition-colors"
              />
            </div>
          </form>

          {/* Right actions */}
          <div className="flex items-center gap-1 ml-auto">
            {user && (
              <>
                <IconButton icon={<MessageCircle className="h-5 w-5" />} label="Messages" onClick={() => navigate('/messages')} />
                <IconButton icon={<Tag className="h-5 w-5" />} label="Offers" onClick={() => navigate('/offers')} />
                <IconButton icon={<Heart className="h-5 w-5" />} label="Favorites" onClick={() => navigate('/favorites')} />
                <IconButton
                  icon={<ShoppingCart className="h-5 w-5" />}
                  label="Cart"
                  badge={cartCount}
                  onClick={() => navigate('/cart')}
                />
              </>
            )}

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 h-10 px-2 rounded-lg hover:bg-brand-50 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
                    {profile?.display_name?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-brand-800 max-w-[100px] truncate">
                    {profile?.display_name ?? 'User'}
                  </span>
                </button>
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-12 z-50 w-56 bg-white rounded-xl shadow-lg border border-brand-100 py-2 animate-slide-down">
                      <div className="px-4 py-2 border-b border-brand-50">
                        <p className="text-sm font-semibold text-brand-900 truncate">{profile?.display_name}</p>
                        <p className="text-xs text-brand-500 capitalize">{role}</p>
                        {availableRoles.length > 1 && (
                          <div className="mt-2">
                            <p className="text-xs text-brand-400 mb-1">Switch to:</p>
                            <div className="flex gap-1">
                              {availableRoles.map((r: UserRole) => (
                                <button
                                  key={r}
                                  onClick={() => { switchActiveRole(r); setUserMenuOpen(false); }}
                                  className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${r === role ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <MenuItem icon={<User className="h-4 w-4" />} label="My Profile" onClick={() => { navigate('/profile'); setUserMenuOpen(false); }} />
                      <MenuItem icon={<MapPinned className="h-4 w-4" />} label="Addresses" onClick={() => { navigate('/addresses'); setUserMenuOpen(false); }} />
                      <MenuItem icon={<Settings className="h-4 w-4" />} label="Account Settings" onClick={() => { navigate('/settings'); setUserMenuOpen(false); }} />
                      <MenuItem icon={<Package className="h-4 w-4" />} label="My Orders" onClick={() => { navigate('/orders'); setUserMenuOpen(false); }} />
                      <MenuItem icon={<Star className="h-4 w-4" />} label="My Reviews" onClick={() => { navigate('/my-reviews'); setUserMenuOpen(false); }} />
                      <MenuItem icon={<Heart className="h-4 w-4" />} label="Favorites" onClick={() => { navigate('/favorites'); setUserMenuOpen(false); }} />
                      <MenuItem icon={<Tag className="h-4 w-4" />} label="My Offers" onClick={() => { navigate('/offers'); setUserMenuOpen(false); }} />
                      {(role === 'seller' || role === 'administrator' || role === 'super_admin') && (
                        <MenuItem icon={<LayoutDashboard className="h-4 w-4" />} label="Seller Dashboard" onClick={() => { navigate('/seller/dashboard'); setUserMenuOpen(false); }} />
                      )}
                      {(role === 'moderator' || role === 'administrator' || role === 'super_admin') && (
                        <MenuItem icon={<LayoutDashboard className="h-4 w-4" />} label="Admin Panel" onClick={() => { navigate('/admin'); setUserMenuOpen(false); }} />
                      )}
                      <div className="border-t border-brand-50 mt-1 pt-1">
                        <MenuItem icon={<LogOut className="h-4 w-4" />} label="Sign Out" onClick={handleSignOut} danger />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/signin')}
                  className="text-sm font-medium text-brand-700 hover:text-brand-800 px-3 h-9 rounded-lg hover:bg-brand-50 transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigate('/signup')}
                  className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 px-4 h-9 rounded-lg transition-colors"
                >
                  Sign Up
                </button>
              </div>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-brand-50 transition-colors"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        <form onSubmit={handleSearch} className="md:hidden pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-brand-200 bg-cream-50 text-sm focus:border-brand-500 focus:bg-white"
            />
          </div>
        </form>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1 h-11 -mt-1">
          {navLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="text-sm font-medium text-brand-600 hover:text-brand-800 hover:bg-brand-50 px-3 h-8 rounded-lg transition-colors"
            >
              {link.label}
            </button>
          ))}
          {(role === 'seller' || availableRoles.includes('seller')) && (
            <button
              onClick={() => navigate('/seller/dashboard')}
              className="text-sm font-medium text-accent-600 hover:text-accent-700 hover:bg-accent-50 px-3 h-8 rounded-lg transition-colors ml-auto"
            >
              Seller Dashboard
            </button>
          )}
          {user && role === 'buyer' && !availableRoles.includes('seller') && (
            <button
              onClick={() => navigate('/seller/setup')}
              className="text-sm font-medium text-accent-600 hover:text-accent-700 hover:bg-accent-50 px-3 h-8 rounded-lg transition-colors ml-auto"
            >
              Sell on MariMarket
            </button>
          )}
          {!user && (
            <button
              onClick={() => navigate('/signup')}
              className="text-sm font-medium text-accent-600 hover:text-accent-700 hover:bg-accent-50 px-3 h-8 rounded-lg transition-colors ml-auto"
            >
              Sell on MariMarket
            </button>
          )}
        </nav>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-brand-100 bg-white animate-slide-down">
          <div className="container-app py-3 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => { navigate(link.path); setMobileMenuOpen(false); }}
                className="block w-full text-left text-sm font-medium text-brand-700 hover:bg-brand-50 px-3 py-2.5 rounded-lg transition-colors"
              >
                {link.label}
              </button>
            ))}
            {user && role === 'buyer' && !availableRoles.includes('seller') && (
              <button
                onClick={() => { navigate('/seller/setup'); setMobileMenuOpen(false); }}
                className="block w-full text-left text-sm font-medium text-accent-600 hover:bg-accent-50 px-3 py-2.5 rounded-lg"
              >
                Sell on MariMarket
              </button>
            )}
            {!user && (
              <button
                onClick={() => { navigate('/signup'); setMobileMenuOpen(false); }}
                className="block w-full text-left text-sm font-medium text-accent-600 hover:bg-accent-50 px-3 py-2.5 rounded-lg"
              >
                Sell on MariMarket
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function IconButton({ icon, label, badge, onClick }: { icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative p-2.5 rounded-lg text-brand-600 hover:text-brand-800 hover:bg-brand-50 transition-colors"
    >
      {icon}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-500 text-white text-[10px] font-semibold px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-2 text-sm font-medium transition-colors rounded-lg mx-1 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-brand-700 hover:bg-brand-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
