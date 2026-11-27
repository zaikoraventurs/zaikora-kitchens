import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, ShoppingBag, User, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BRAND_NAME, BRAND_TAGLINE } from '../data/catalog';
import { BrandLogo } from './BrandLogo';
import { MobileBottomNav } from './mobile/MobileBottomNav';
import { MobileHeader } from './mobile/MobileHeader';
import { MobileStickyCartBar } from './mobile/MobileStickyCartBar';

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col items-center justify-center p-6">
      <BrandLogo className="h-28 w-auto mb-6" />
      <div className="w-40 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className="w-1/2 h-full bg-[#E88D14] animate-pulse rounded-full" />
      </div>
      <p className="mt-4 text-xs tracking-widest text-zinc-400">{BRAND_TAGLINE}</p>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { totalCartItems, isCustomerAuthenticated, notifications, customerName } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = pathname.startsWith('/admin');
  const footerTapCountRef = useRef(0);
  const footerTapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (footerTapTimerRef.current !== null) {
        window.clearTimeout(footerTapTimerRef.current);
      }
    };
  }, []);

  const handleFooterLogoTap = () => {
    footerTapCountRef.current += 1;
    if (footerTapTimerRef.current !== null) {
      window.clearTimeout(footerTapTimerRef.current);
    }
    if (footerTapCountRef.current >= 10) {
      footerTapCountRef.current = 0;
      footerTapTimerRef.current = null;
      navigate('/admin');
      return;
    }
    footerTapTimerRef.current = window.setTimeout(() => {
      footerTapCountRef.current = 0;
      footerTapTimerRef.current = null;
    }, 2500);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap shrink-0 text-sm font-medium transition-colors pb-1 border-b-2 ${
      isActive
        ? 'text-[#E88D14] border-[#E88D14]'
        : 'text-zinc-300 border-transparent hover:text-white hover:border-zinc-600'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-[#111113]">
      {/* Compact Mobile App Header (< 768px) */}
      <MobileHeader />

      {/* 3-Zone Top Navigation Bar (Tablet & Desktop >= 768px — untouched) */}
      <header className="hidden md:block sticky top-0 z-40 bg-[#0A0A0B] border-b border-zinc-800/90 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 lg:gap-8">
          {/* Zone 1: Official Brand Logo */}
          <Link to="/" className="shrink-0 flex items-center" aria-label={BRAND_NAME}>
            <BrandLogo className="h-12 w-auto" />
          </Link>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-4 lg:gap-7" aria-label="Primary navigation">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/menu" className={navLinkClass}>
              Food Menu
            </NavLink>
            <NavLink to="/cakes" className={navLinkClass}>
              Cakes
            </NavLink>
            <NavLink to="/track" className={navLinkClass}>
              Track Order
            </NavLink>
            <NavLink to="/contact" className={navLinkClass}>
              Contact Us
            </NavLink>
          </nav>

          {/* Zone 3: Primary Action + Mobile Trigger */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to={isCustomerAuthenticated ? '/account' : '/login'}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-200 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <User className="w-4 h-4 text-[#E88D14]" />
              <span>
                {isCustomerAuthenticated ? customerName || 'My Account' : 'Login'}
              </span>
              {unreadCount > 0 && (
                <span className="text-xs font-mono tabular-nums text-[#E88D14]">({unreadCount})</span>
              )}
            </Link>

            <Link
              to="/cart"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Cart</span>
              <span className="font-mono tabular-nums">({totalCartItems})</span>
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-zinc-800 text-zinc-200 hover:text-white"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0A0A0B] border-t border-zinc-800 px-5 py-6 space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <BrandLogo className="h-14 w-auto" />
              <span className="text-xs tracking-wider text-zinc-400">{BRAND_TAGLINE}</span>
            </div>
            <nav className="grid grid-cols-1 gap-2">
              {[
                { to: '/', label: 'Home' },
                { to: '/menu', label: 'Food Menu' },
                { to: '/cakes', label: 'Cakes' },
                { to: '/cart', label: `Cart (${totalCartItems})` },
                { to: '/orders', label: 'My Orders' },
                { to: '/track', label: 'Order Tracking' },
                {
                  to: isCustomerAuthenticated ? '/account' : '/login',
                  label: isCustomerAuthenticated
                    ? `My Account (${customerName || 'Profile'})`
                    : 'Sign In / Create Account',
                },
                { to: '/terms', label: 'Terms & Conditions' },
                { to: '/refund-policy', label: 'Refund & Cancellation Policy' },
                { to: '/contact', label: 'Contact Us' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2.5 px-3 rounded-lg text-sm font-medium text-zinc-200 hover:bg-zinc-900 hover:text-[#E88D14] transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer
        className={`bg-[#0A0A0B] text-zinc-300 border-t border-zinc-800 mt-8 md:mt-16 ${
          isAdminRoute ? '' : 'pb-32 md:pb-0'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1 space-y-4">
            <div
              onClick={handleFooterLogoTap}
              data-testid="footer-brand-logo"
              className="inline-block select-none"
            >
              <BrandLogo className="h-20 w-auto" />
            </div>
            <p className="text-xs tracking-widest text-[#E88D14] font-medium">{BRAND_TAGLINE}</p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Freshly prepared Indian mains, coastal seafood, pizzas, snacks, and celebration cakes from {BRAND_NAME}.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Order & Explore</h3>
            <ul className="space-y-2.5 text-sm text-zinc-400">
              <li><Link to="/menu" className="hover:text-[#E88D14] transition-colors">Food Menu</Link></li>
              <li><Link to="/cakes" className="hover:text-[#E88D14] transition-colors">Cakes & Party Enquiries</Link></li>
              <li><Link to="/cart" className="hover:text-[#E88D14] transition-colors">Shopping Cart</Link></li>
              <li><Link to="/track" className="hover:text-[#E88D14] transition-colors">Live Order Tracking</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Customer & Portal</h3>
            <ul className="space-y-2.5 text-sm text-zinc-400">
              <li><Link to="/login" className="hover:text-[#E88D14] transition-colors">Sign In</Link></li>
              <li><Link to="/login?mode=register" className="hover:text-[#E88D14] transition-colors">Create Account</Link></li>
              <li><Link to="/account" className="hover:text-[#E88D14] transition-colors">My Account &amp; Addresses</Link></li>
              <li><Link to="/orders" className="hover:text-[#E88D14] transition-colors">My Orders</Link></li>
              <li><Link to="/terms" className="hover:text-[#E88D14] transition-colors">Terms &amp; Conditions</Link></li>
              <li><Link to="/refund-policy" className="hover:text-[#E88D14] transition-colors">Refund &amp; Cancellation Policy</Link></li>
              <li><Link to="/contact" className="hover:text-[#E88D14] transition-colors">Contact Us</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Delivery & Collection</h3>
            <ul className="space-y-2 text-sm text-zinc-400 leading-relaxed">
              <li>Deliveries within Brigade Eldorado.</li>
              <li>Outside Brigade Eldorado: apartment main gate delivery only.</li>
              <li>Self-collection at Brigade Eldorado Main Gate.</li>
              <li className="text-zinc-300 font-medium pt-1">Standard preparation time: 60 minutes.</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-zinc-800/80 py-5 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
            <span>© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</span>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link to="/terms" className="hover:text-[#E88D14] transition-colors">
                Terms &amp; Conditions
              </Link>
              <span aria-hidden="true">·</span>
              <Link to="/refund-policy" className="hover:text-[#E88D14] transition-colors">
                Refund Policy
              </Link>
              <span aria-hidden="true">·</span>
              <Link
                to="/crafted-by-pixel-craft-studio"
                className="text-zinc-300 hover:text-[#E88D14] transition-colors font-medium"
              >
                Crafted by Pixel Craft Studio
              </Link>
              <span aria-hidden="true">·</span>
              <span>{BRAND_TAGLINE}</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile Sticky Cart Bar & Permanent 5-Tab Bottom Navigation (< 768px) */}
      <MobileStickyCartBar />
      <MobileBottomNav />
    </div>
  );
}
