import { Link } from 'react-router-dom';
import { ShoppingBag, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BRAND_NAME } from '../../data/catalog';
import { BrandLogo } from '../BrandLogo';

export function MobileHeader() {
  const { totalCartItems, isCustomerAuthenticated, notifications, customerName } = useApp();

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="md:hidden sticky top-0 z-40 bg-[#0A0A0B] border-b border-zinc-800/90 text-white pt-[env(safe-area-inset-top)]">
      <div className="px-3.5 h-14 flex items-center justify-between gap-3">
        <Link
          to="/"
          className="shrink-0 flex items-center min-h-[44px]"
          aria-label={BRAND_NAME}
        >
          <BrandLogo className="h-9 w-auto" />
        </Link>

        <div className="flex items-center gap-1.5 shrink-0">
          <Link
            to={isCustomerAuthenticated ? '/account' : '/login'}
            aria-label={isCustomerAuthenticated ? `Account: ${customerName || 'Profile'}` : 'Login'}
            className="relative inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-zinc-200 hover:text-white active:bg-zinc-900 transition-colors"
          >
            <User className="w-5 h-5 text-[#E88D14]" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#E88D14]" />
            )}
          </Link>

          <Link
            to="/cart"
            aria-label={`Cart with ${totalCartItems} items`}
            className="relative inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg bg-[#E88D14] text-black active:bg-[#f39c25] transition-colors px-2.5 gap-1.5"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold font-mono tabular-nums">{totalCartItems}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
