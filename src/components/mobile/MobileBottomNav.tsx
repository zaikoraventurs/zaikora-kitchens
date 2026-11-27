import { Link, useLocation } from 'react-router-dom';
import { ClipboardList, Home, ShoppingBag, User, UtensilsCrossed } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function MobileBottomNav() {
  const { totalCartItems, isCustomerAuthenticated } = useApp();
  const { pathname } = useLocation();

  if (pathname.startsWith('/admin')) {
    return null;
  }

  const tabs = [
    {
      label: 'Home',
      to: '/',
      icon: Home,
      active: pathname === '/',
    },
    {
      label: 'Menu',
      to: '/menu',
      icon: UtensilsCrossed,
      active: pathname === '/menu' || pathname === '/cakes',
    },
    {
      label: 'Cart',
      to: '/cart',
      icon: ShoppingBag,
      active: pathname === '/cart' || pathname === '/checkout',
      badge: totalCartItems,
    },
    {
      label: 'Orders',
      to: '/orders',
      icon: ClipboardList,
      active: pathname === '/orders' || pathname.startsWith('/track'),
    },
    {
      label: 'Account',
      to: isCustomerAuthenticated ? '/account' : '/login',
      icon: User,
      active: pathname === '/account' || pathname === '/login',
    },
  ];

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0A0A0B]/95 backdrop-blur-md border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 h-[60px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              to={tab.to}
              aria-current={tab.active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition-colors ${
                tab.active ? 'text-[#E88D14]' : 'text-zinc-400 active:text-white'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#E88D14] text-black text-[10px] font-bold font-mono tabular-nums flex items-center justify-center leading-none">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
