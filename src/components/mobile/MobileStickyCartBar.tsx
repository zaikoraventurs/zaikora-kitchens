import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { calculatePriceBreakdown, formatRupees } from '../../lib/pricing';

export function MobileStickyCartBar() {
  const { cart, totalCartItems, appliedCoupon, settings, checkoutCharges } = useApp();
  const { pathname } = useLocation();

  if (
    totalCartItems === 0 ||
    cart.length === 0 ||
    pathname === '/cart' ||
    pathname === '/checkout' ||
    pathname.startsWith('/admin')
  ) {
    return null;
  }

  const breakdown = calculatePriceBreakdown(
    cart,
    appliedCoupon,
    'delivery',
    settings,
    checkoutCharges
  );
  const itemsLabel = totalCartItems === 1 ? '1 ITEM' : `${totalCartItems} ITEMS`;

  return (
    <div className="md:hidden fixed inset-x-3 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 pointer-events-none">
      <Link
        to="/cart"
        className="pointer-events-auto w-full bg-[#0A0A0B] text-white border border-zinc-700/90 shadow-lg rounded-xl px-4 py-3 flex items-center justify-between gap-3 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-[#E88D14] text-black flex items-center justify-center shrink-0">
            <ShoppingBag className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide font-mono tabular-nums text-white truncate">
              {itemsLabel} <span className="text-zinc-500 mx-1">|</span> {formatRupees(breakdown.effectiveSubtotal)}
            </p>
            <p className="text-[11px] text-zinc-400 truncate">Ready for checkout</p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#E88D14] shrink-0">
          <span>VIEW CART</span>
          <ArrowRight className="w-4 h-4" />
        </span>
      </Link>
    </div>
  );
}
