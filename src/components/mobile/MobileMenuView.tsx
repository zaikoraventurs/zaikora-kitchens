import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Cake, Minus, Plus, Search, X } from 'lucide-react';
import { FoodImage } from '../BrandLogo';
import { FssaiLicenceSection } from '../FssaiLicenceSection';
import { StockNoticeBanner } from '../StockNoticeBanner';
import { useApp } from '../../context/AppContext';
import { getDishAuthenticDefaultImage } from '../../data/catalog';
import { getInventoryStatusMeta, getRemainingAddableQuantity } from '../../lib/inventory';
import { formatRupees } from '../../lib/pricing';

interface MobileMenuViewProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  searchTerm: string;
  onSearchTermChange: (val: string) => void;
  groupedByCategory: Record<string, ReturnType<typeof useApp>['foodMenu']>;
}

export function MobileMenuView({
  categories,
  selectedCategory,
  onSelectCategory,
  searchTerm,
  onSearchTermChange,
  groupedByCategory,
}: MobileMenuViewProps) {
  const { cart, addToCart, updateCartQuantity, settings, resolveCategoryImage } = useApp();

  const getCartQty = (productId: string) =>
    cart.find((c) => c.cartKey === `food:${productId}`)?.quantity ?? 0;

  const groupEntries = useMemo(() => Object.entries(groupedByCategory), [groupedByCategory]);

  return (
    <div className="md:hidden pb-6">
      {/* Sticky Search + Horizontal Category Navigation */}
      <div className="sticky top-14 z-30 bg-[#FAFAFA]/95 backdrop-blur-md border-b border-zinc-200 px-3.5 pt-2.5 pb-2.5 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            placeholder="Search for food, dishes and more..."
            aria-label="Search dishes in food menu"
            className="w-full min-h-[44px] pl-10 pr-10 py-2 bg-white border border-zinc-300 rounded-xl text-base text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:outline-none focus:border-[#E88D14]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchTermChange('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-3.5 px-3.5">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectCategory(cat)}
                className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 border ${
                  active
                    ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                    : 'bg-white text-zinc-700 border-zinc-200 active:border-zinc-400'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3.5 pt-4 space-y-5">
        {!settings.isAcceptingOrders && (
          <div className="p-3.5 bg-zinc-900 text-white rounded-xl border border-zinc-800 text-xs">
            ZAIKORA KITCHENS is currently paused for new online orders. Please check back shortly.
          </div>
        )}

        <StockNoticeBanner compact />

        {groupEntries.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-zinc-900">No dishes match your search.</p>
            <button
              type="button"
              onClick={() => {
                onSelectCategory('All');
                onSearchTermChange('');
              }}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold bg-zinc-100 text-zinc-900 rounded-lg active:bg-zinc-200"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {groupEntries.map(([categoryName, items], groupIdx) => (
              <section key={categoryName} className="space-y-3 scroll-mt-44">
                <div className="flex items-baseline justify-between border-b border-zinc-200 pb-2">
                  <h2 className="text-base font-bold text-zinc-900">{categoryName}</h2>
                  <span className="text-xs font-mono tabular-nums text-zinc-500">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {items.map((item, itemIdx) => {
                    const qty = getCartQty(item.id);
                    const stockMeta = getInventoryStatusMeta(item);
                    const remainingAddable = getRemainingAddableQuantity(
                      cart,
                      item,
                      'food',
                      `food:${item.id}`
                    );
                    const canOrder = stockMeta.orderable && settings.isAcceptingOrders;
                    const catFallback = resolveCategoryImage(item.category);
                    const resolvedSrc = item.imageUrl || catFallback.src;
                    const resolvedDerivative =
                      item.imageDerivativeUrl ||
                      (!item.imageUrl ? catFallback.derivativeSrc : undefined);
                    const isPriority = groupIdx === 0 && itemIdx < 3;
                    return (
                      <div
                        key={item.id}
                        className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center gap-3"
                      >
                        <div className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-100 shrink-0">
                          <FoodImage
                            src={resolvedSrc}
                            derivativeSrc={resolvedDerivative}
                            fallbackSrc={
                              getDishAuthenticDefaultImage(item.id, item.name, item.category) ||
                              catFallback.src
                            }
                            alt={item.name}
                            priority={isPriority ? 'high' : 'normal'}
                            loading={isPriority ? 'eager' : 'lazy'}
                            className="w-full h-full object-contain"
                          />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                          <div>
                            <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                              <span className="truncate">{item.quantityLabel}</span>
                              {stockMeta.code !== 'AVAILABLE' && (
                                <span
                                  className={`font-bold shrink-0 ${
                                    stockMeta.code === 'SOLD_OUT'
                                      ? 'text-red-600'
                                      : stockMeta.code === 'LOW_STOCK'
                                      ? 'text-amber-700'
                                      : 'text-zinc-500'
                                  }`}
                                >
                                  {stockMeta.customerBadge}
                                </span>
                              )}
                            </div>
                            <h3 className="text-sm font-bold text-zinc-900 mt-0.5 leading-snug">
                              {item.name}
                            </h3>
                            {item.description && (
                              <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold font-mono tabular-nums text-zinc-900">
                              {formatRupees(item.originalPrice)}
                            </span>

                            {!canOrder ? (
                              <span
                                className={`text-[11px] font-bold ${
                                  stockMeta.code === 'SOLD_OUT' ? 'text-red-600' : 'text-zinc-400'
                                }`}
                              >
                                {!settings.isAcceptingOrders ? 'Paused' : stockMeta.customerBadge}
                              </span>
                            ) : qty === 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  addToCart({
                                    cartKey: `food:${item.id}`,
                                    productId: item.id,
                                    productType: 'food',
                                    name: item.name,
                                    quantityLabel: item.quantityLabel,
                                    originalPrice: item.originalPrice,
                                    eligibleForAutoDiscount: true,
                                    imageUrl: resolvedSrc,
                                  })
                                }
                                className="min-h-[38px] px-4 bg-[#0A0A0B] text-white text-xs font-bold rounded-lg active:bg-[#E88D14] active:text-black transition-colors whitespace-nowrap"
                              >
                                ADD
                              </button>
                            ) : (
                              <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-zinc-50">
                                <button
                                  type="button"
                                  onClick={() => updateCartQuantity(`food:${item.id}`, qty - 1)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-800"
                                  aria-label={`Decrease ${item.name}`}
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="px-2 text-xs font-mono tabular-nums font-bold">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  disabled={qty >= remainingAddable}
                                  onClick={() => updateCartQuantity(`food:${item.id}`, qty + 1)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-800 disabled:opacity-35"
                                  aria-label={`Increase ${item.name}`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Separate Cakes Link Notice */}
        <Link
          to="/cakes"
          className="block bg-[#0A0A0B] text-white rounded-xl p-4 border border-zinc-800"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Cake className="w-5 h-5 text-[#E88D14] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-white">Looking for Cakes?</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Visit our separate Cakes page for Bento Cakes, Cake Sicles &amp; Party Cakes.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#E88D14] shrink-0" />
          </div>
        </Link>

        <FssaiLicenceSection
          id="food-licence-menu-mobile"
          testId="fssai-licence-number-menu-mobile"
        />
      </div>
    </div>
  );
}
