import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout, LoadingScreen } from './components/Layout';
import { ScrollToTop } from './components/ScrollToTop';
import { WatermarkShield } from './components/WatermarkShield';
import { AppProvider, useApp } from './context/AppContext';
import { AccountPage } from './pages/AccountPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { CakesPage } from './pages/CakesPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ContactPage } from './pages/ContactPage';
import { FoodLicencePage } from './pages/FoodLicencePage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';
import { OrdersPage } from './pages/OrdersPage';
import { PixelCraftStudioPage } from './pages/PixelCraftStudioPage';
import { RefundPolicyPage } from './pages/RefundPolicyPage';
import { SecurityCentrePage } from './pages/SecurityCentrePage';
import { TermsAndConditionsPage } from './pages/TermsAndConditionsPage';
import { TrackOrderPage } from './pages/TrackOrderPage';

function AppRoutes() {
  const { initialLoading } = useApp();

  if (initialLoading) {
    return <LoadingScreen />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/menu" element={<MenuPage />} />
        <Route path="/cakes" element={<CakesPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/track" element={<TrackOrderPage />} />
        <Route path="/track/:orderId" element={<TrackOrderPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/terms" element={<TermsAndConditionsPage />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditionsPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/cancellation-policy" element={<RefundPolicyPage />} />
        <Route path="/food-licence" element={<FoodLicencePage />} />
        <Route path="/crafted-by-pixel-craft-studio" element={<PixelCraftStudioPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/security" element={<SecurityCentrePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WatermarkShield />
      <AppProvider>
        <BrowserRouter>
          <ScrollToTop />
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
