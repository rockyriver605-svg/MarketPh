import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { WishlistProvider } from '@/contexts/WishlistContext';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useRouter, matchRoute, navigate } from '@/lib/router';
import { useEffect, type ReactNode } from 'react';
import { Shield } from 'lucide-react';
import type { UserRole } from '@/types';

import { HomePage } from '@/pages/HomePage';
import { BrowsePage } from '@/pages/BrowsePage';
import { SignInPage } from '@/pages/SignInPage';
import { SignUpPage } from '@/pages/SignUpPage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
import { SellerStorefrontPage } from '@/pages/SellerStorefrontPage';
import { SellerSetupPage } from '@/pages/SellerSetupPage';
import { SellerDashboardPage } from '@/pages/SellerDashboardPage';
import { NewProductPage } from '@/pages/NewProductPage';
import { EditProductPage } from '@/pages/EditProductPage';
import { CartPage } from '@/pages/CartPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { SharedWishlistPage } from '@/pages/SharedWishlistPage';
import { MessagesPage } from '@/pages/MessagesPage';
import { CategoriesPage } from '@/pages/CategoriesPage';
import { SellersPage } from '@/pages/SellersPage';
import { AdminPage } from '@/pages/AdminPage';
import { AdminLocationsPage } from '@/pages/AdminLocationsPage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { AdminCategoriesPage } from '@/pages/AdminCategoriesPage';
import { AdminConditionsPage } from '@/pages/AdminConditionsPage';
import { AdminOrderAuditPage } from '@/pages/AdminOrderAuditPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { VerifyEmailPage } from '@/pages/VerifyEmailPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { AddressesPage } from '@/pages/AddressesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { OffersPage } from '@/pages/OffersPage';
import { CheckoutPage } from '@/pages/CheckoutPage';
import { SellerOrdersPage } from '@/pages/SellerOrdersPage';
import { BusinessToolsPage } from '@/pages/BusinessToolsPage';
import { ToolStubPage } from '@/pages/ToolStubPage';
import { SalesCalculatorPage } from '@/pages/SalesCalculatorPage';
import { PosPage } from '@/pages/PosPage';
import { OrderTrackingPage } from '@/pages/OrderTrackingPage';
import { PurchaseDetailPage } from '@/pages/PurchaseDetailPage';
import { MyReviewsPage } from '@/pages/MyReviewsPage';
import { SellerReviewsPage } from '@/pages/SellerReviewsPage';
import { AdminReviewsPage } from '@/pages/AdminReviewsPage';
import { SellerInventoryPage } from '@/pages/SellerInventoryPage';
import { SellerAnalyticsPage } from '@/pages/SellerAnalyticsPage';
import { SellerPromotionsPage } from '@/pages/SellerPromotionsPage';
import { PromotionsPage } from '@/pages/PromotionsPage';
import { RiderHubPage } from '@/rider-network/pages/RiderHubPage';
import { RiderDashboardPage } from '@/rider-network/pages/RiderDashboardPage';
import { HanapRiderPage } from '@/rider-network/pages/HanapRiderPage';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="container-app py-20 text-center text-brand-400">Loading...</div>;
  if (!user) {
    navigate('/signin');
    return null;
  }
  return <>{children}</>;
}

function RoleProtectedRoute({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="container-app py-20 text-center text-brand-400">Loading...</div>;
  if (!user) {
    navigate('/signin');
    return null;
  }
  if (!role || !roles.includes(role)) {
    return (
      <div className="container-app py-16">
        <div className="max-w-md mx-auto text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-100 text-brand-500 mx-auto mb-4">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-brand-900 mb-2">Access denied</h1>
          <p className="text-sm text-brand-500 mb-6">You need {roles.join(' or ')} permissions to view this page.</p>
          <button onClick={() => navigate('/')} className="text-brand-600 font-semibold hover:text-brand-800">Go home</button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

const ONBOARDING_EXEMPT_PATHS = ['/onboarding', '/reset-password', '/verify-email', '/seller/tools'];
const RESERVED_SELLER_SLUGS = ['setup', 'dashboard', 'products', 'orders', 'tools', 'reviews', 'inventory', 'analytics', 'promotions'];

function Routes() {
  const { route } = useRouter();
  const path = route.path;

  // Public routes
  if (path === '/' || path === '') return <HomePage />;
  if (path === '/browse') return <BrowsePage />;
  if (path === '/categories') return <CategoriesPage />;
  if (path === '/sellers') return <SellersPage />;
  if (path === '/signin') return <SignInPage />;
  if (path === '/signup') return <SignUpPage />;
  if (path === '/forgot-password') return <ForgotPasswordPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;
  if (path === '/verify-email') return <VerifyEmailPage email={route.query.email ?? ''} />;

  // Product detail
  const productMatch = matchRoute(path, '/product/:id');
  if (productMatch) return <ProductDetailPage productId={productMatch.id} />;

  // Seller storefront
  const sellerMatch = matchRoute(path, '/seller/:slug');
  if (sellerMatch && !RESERVED_SELLER_SLUGS.includes(sellerMatch.slug)) {
    return <SellerStorefrontPage slug={sellerMatch.slug} />;
  }

  // Protected routes
  if (path === '/seller/setup') return <ProtectedRoute><SellerSetupPage /></ProtectedRoute>;
  if (path === '/seller/dashboard') return <RoleProtectedRoute roles={['seller', 'administrator', 'super_admin']}><SellerDashboardPage /></RoleProtectedRoute>;
  if (path === '/seller/orders') return <RoleProtectedRoute roles={['seller', 'administrator', 'super_admin']}><SellerOrdersPage /></RoleProtectedRoute>;
  if (path === '/seller/reviews') return <RoleProtectedRoute roles={['seller', 'administrator', 'super_admin']}><SellerReviewsPage /></RoleProtectedRoute>;
  if (path === '/seller/inventory') return <RoleProtectedRoute roles={['seller', 'administrator', 'super_admin']}><SellerInventoryPage /></RoleProtectedRoute>;
  if (path === '/seller/analytics') return <RoleProtectedRoute roles={['seller', 'administrator', 'super_admin']}><SellerAnalyticsPage /></RoleProtectedRoute>;
  if (path === '/seller/promotions') return <RoleProtectedRoute roles={['seller', 'administrator', 'super_admin']}><SellerPromotionsPage /></RoleProtectedRoute>;
  if (path === '/seller/tools') return <BusinessToolsPage />;
  if (path === '/seller/tools/sales-calculator') return <SalesCalculatorPage />;
  if (path === '/seller/tools/pos') return <PosPage />;
  const toolMatch = matchRoute(path, '/seller/tools/:toolId');
  if (toolMatch) return <ToolStubPage toolId={toolMatch.toolId} />;
  if (path === '/seller/products/new') return <RoleProtectedRoute roles={['seller', 'administrator', 'super_admin']}><NewProductPage /></RoleProtectedRoute>;
  const editProductMatch = matchRoute(path, '/seller/products/:id/edit');
  if (editProductMatch) return <RoleProtectedRoute roles={['seller', 'administrator', 'super_admin']}><EditProductPage productId={editProductMatch.id} /></RoleProtectedRoute>;
  if (path === '/cart') return <ProtectedRoute><CartPage /></ProtectedRoute>;
  if (path === '/checkout') return <ProtectedRoute><CheckoutPage /></ProtectedRoute>;
  if (path === '/orders') return <ProtectedRoute><OrdersPage /></ProtectedRoute>;
  const orderTrackMatch = matchRoute(path, '/orders/:orderId/track');
  if (orderTrackMatch) return <ProtectedRoute><OrderTrackingPage orderId={orderTrackMatch.orderId} /></ProtectedRoute>;
  const orderDetailMatch = matchRoute(path, '/orders/:orderId');
  if (orderDetailMatch) return <ProtectedRoute><PurchaseDetailPage orderId={orderDetailMatch.orderId} /></ProtectedRoute>;
  if (path === '/profile') return <ProtectedRoute><ProfilePage /></ProtectedRoute>;
  if (path === '/favorites') return <ProtectedRoute><FavoritesPage /></ProtectedRoute>;
  const sharedWishlistMatch = matchRoute(path, '/wishlist/shared/:token');
  if (sharedWishlistMatch) return <SharedWishlistPage token={sharedWishlistMatch.token} />;
  if (path === '/messages') return <ProtectedRoute><MessagesPage /></ProtectedRoute>;
  if (path === '/offers') return <ProtectedRoute><OffersPage /></ProtectedRoute>;
  if (path === '/admin') return <RoleProtectedRoute roles={['moderator', 'administrator', 'super_admin']}><AdminPage /></RoleProtectedRoute>;
  if (path === '/admin/locations') return <RoleProtectedRoute roles={['administrator', 'super_admin']}><AdminLocationsPage /></RoleProtectedRoute>;
  if (path === '/admin/users') return <RoleProtectedRoute roles={['administrator', 'super_admin']}><AdminUsersPage /></RoleProtectedRoute>;
  if (path === '/admin/categories') return <RoleProtectedRoute roles={['administrator', 'super_admin', 'moderator']}><AdminCategoriesPage /></RoleProtectedRoute>;
  if (path === '/admin/conditions') return <RoleProtectedRoute roles={['administrator', 'super_admin']}><AdminConditionsPage /></RoleProtectedRoute>;
  if (path === '/admin/audit') return <RoleProtectedRoute roles={['administrator', 'super_admin']}><AdminOrderAuditPage /></RoleProtectedRoute>;
  if (path === '/admin/reviews') return <RoleProtectedRoute roles={['moderator', 'administrator', 'super_admin']}><AdminReviewsPage /></RoleProtectedRoute>;
  if (path === '/onboarding') return <ProtectedRoute><OnboardingPage /></ProtectedRoute>;
  if (path === '/addresses') return <ProtectedRoute><AddressesPage /></ProtectedRoute>;
  if (path === '/settings') return <ProtectedRoute><SettingsPage /></ProtectedRoute>;
  if (path === '/my-reviews') return <ProtectedRoute><MyReviewsPage /></ProtectedRoute>;

  // Rider Network
  if (path === '/promotions') return <PromotionsPage />;
  if (path === '/riders') return <RiderHubPage />;
  if (path === '/riders/dashboard') return <ProtectedRoute><RiderDashboardPage /></ProtectedRoute>;
  if (path === '/riders/hanap') return <HanapRiderPage />;

  // 404
  return (
    <div className="container-app py-20 text-center">
      <h1 className="text-4xl font-bold text-brand-300 mb-2">404</h1>
      <p className="text-brand-500 mb-6">Page not found</p>
      <button onClick={() => navigate('/')} className="text-brand-600 font-semibold hover:text-brand-800">
        Go home
      </button>
    </div>
  );
}

function AppContent() {
  const { route } = useRouter();
  const { user, profile, loading } = useAuth();
  const needsOnboarding = !loading && !!user && !!profile && !profile.onboarding_completed_at;

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = '/';
    }
  }, []);

  useEffect(() => {
    if (needsOnboarding && !ONBOARDING_EXEMPT_PATHS.includes(route.path)) navigate('/onboarding');
  }, [needsOnboarding, route.path]);

  return (
    <div className="min-h-screen flex flex-col bg-cream-50">
      <Header />
      <main className="flex-1">
        <Routes key={route.path + JSON.stringify(route.query)} />
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <WishlistProvider>
        <AppContent />
      </WishlistProvider>
    </AuthProvider>
  );
}

export default App;
