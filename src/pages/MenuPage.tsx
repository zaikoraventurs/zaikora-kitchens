import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Minus, Plus, Search, ShoppingBag } from 'lucide-react';
import { FoodImage } from '../components/BrandLogo';
import { FssaiLicenceSection } from '../components/FssaiLicenceSection';
import { StockNoticeBanner } from '../components/StockNoticeBanner';
import { MobileMenuView } from '../components/mobile/MobileMenuView';
import { useApp } from '../context/AppContext';
import { BRAND_NAME, FOOD_CATEGORIES, getDishAuthenticDefaultImage } from '../data/catalog';
import { getInventoryStatusMeta, getRemainingAddableQuantity } from '../lib/inventory';
import { formatRupees } from '../lib/pricing';

export function MenuPage() {
  const {
    foodMenu,
    cart,
    totalCartItems,
    addToCart,
    updateCartQuantity,
    settings,
    resolveCategoryImage,
  } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategoryParam = searchParams.get('category') || 'All';
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryParam);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const param = searchParams.get('category') || 'All';
    setSelectedCategory(param);
  }, [searchParams]);

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    if (cat === 'All') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ category: cat }, { replace: true });
    }
  };

  const categories = useMemo(() => {
    const present = Array.from(new Set(foodMenu.map((i) => i.category)));
    const ordered = FOOD_CATEGORIES.filter((c) => present.includes(c));
    const extras = present.filter((c) => !ordered.includes(c as (typeof FOOD_CATEGORIES)[number]));
    return ['All', ...ordered, ...extras];
  }, [foodMenu]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return foodMenu.filter((item) => {
      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.quantityLabel.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [foodMenu, selectedCategory, searchTerm]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, typeof filteredItems> = {};
    for (const item of filteredItems) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [filteredItems]);

  const getCartQty = (productId: string) =>
    cart.find((c) => c.cartKey === `food:${productId}`)?.quantity ?? 0;

  return (
    <>
      <MobileMenuView
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        groupedByCategory={groupedByCategory}
      />
      <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-zinc-200">
        <div>
          <p className="text-xs font-medium tracking-widest text-[#D97706] mb-1">
            {BRAND_NAME} · FOOD MENU
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900">
            Freshly Prepared Kitchen Menu
          </h1>
          <p className="text-sm text-zinc-600 mt-2 max-w-2xl">
            Freshly cooked to order from our kitchen menu. Looking for Bento Cakes, Cake Sicles, or Party Cakes?{' '}
            <Link to="/cakes" className="font-semibold text-[#D97706] hover:underline">
              Visit our dedicated Cakes page.
            </Link>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search dishes..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:border-[#E88D14]"
            />
          </div>
          {totalCartItems > 0 && (
            <Link
              to="/cart"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0A0A0B] text-white text-sm font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>View Cart ({totalCartItems})</span>
            </Link>
          )}
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => handleSelectCategory(cat)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 border ${
              selectedCategory === cat
                ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {!settings.isAcceptingOrders && (
        <div className="p-4 bg-zinc-900 text-white rounded-xl border border-zinc-800 text-sm">
          ZAIKORA KITCHENS is currently paused for new online orders. Please check back shortly.
        </div>
      )}

      <StockNoticeBanner />

      {/* Menu Sections */}
      {Object.keys(groupedByCategory).length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
          <p className="text-base font-semibold text-zinc-900">No dishes match your search.</p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('All');
              setSearchTerm('');
            }}
            className="mt-4 px-4 py-2 text-sm font-medium bg-zinc-100 rounded-lg hover:bg-zinc-200"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {Object.entries(groupedByCategory).map(([categoryName, items], groupIdx) => (
            <section key={categoryName} className="space-y-5">
              <div className="flex items-baseline justify-between border-b border-zinc-200 pb-2.5">
                <h2 className="text-xl sm:text-2xl font-bold text-zinc-900">{categoryName}</h2>
                <span className="text-xs font-mono tabular-nums text-zinc-500">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                      className="bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className="aspect-[4/3] bg-zinc-100 overflow-hidden relative">
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
                          {stockMeta.code !== 'AVAILABLE' && (
                            <span
                              className={`absolute top-2.5 left-2.5 px-2.5 py-1 rounded-md text-[11px] font-bold shadow-xs ${
                                stockMeta.code === 'SOLD_OUT'
                                  ? 'bg-red-600 text-white'
                                  : stockMeta.code === 'UNAVAILABLE'
                                  ? 'bg-zinc-900 text-white'
                                  : 'bg-amber-400 text-black'
                              }`}
                            >
                              {stockMeta.customerWarning || stockMeta.customerBadge}
                            </span>
                          )}
                        </div>
                        <div className="p-5">
                          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                            <span>{item.quantityLabel}</span>
                            <span
                              className={`font-semibold ${
                                stockMeta.code === 'SOLD_OUT'
                                  ? 'text-red-600'
                                  : stockMeta.code === 'LOW_STOCK'
                                  ? 'text-amber-700'
                                  : stockMeta.code === 'UNAVAILABLE'
                                  ? 'text-zinc-500'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {stockMeta.customerBadge}
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold text-zinc-900">{item.name}</h3>
                          {item.description && (
                            <p className="text-sm text-zinc-600 mt-1.5 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="px-5 pb-5 pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                        <div>
                          <span className="text-lg font-bold font-mono tabular-nums text-zinc-900">
                            {formatRupees(item.originalPrice)}
                          </span>
                          <p className="text-xs text-zinc-500">{item.quantityLabel}</p>
                        </div>

                        {!canOrder ? (
                          <span
                            className={`text-xs font-bold whitespace-nowrap ${
                              stockMeta.code === 'SOLD_OUT' ? 'text-red-600' : 'text-zinc-500'
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
                            className="px-4 py-2 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black transition-colors whitespace-nowrap"
                          >
                            Add to Cart
                          </button>
                        ) : (
                          <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-zinc-50">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(`food:${item.id}`, qty - 1)}
                              className="p-2 text-zinc-700 hover:text-black"
                              aria-label={`Decrease ${item.name}`}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-2.5 text-sm font-mono tabular-nums font-semibold">
                              {qty}
                            </span>
                            <button
                              type="button"
                              disabled={qty >= remainingAddable}
                              onClick={() => updateCartQuantity(`food:${item.id}`, qty + 1)}
                              className="p-2 text-zinc-700 hover:text-black disabled:opacity-35 disabled:cursor-not-allowed"
                              aria-label={`Increase ${item.name}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <FssaiLicenceSection
        id="food-licence-menu"
        testId="fssai-licence-number-menu"
      />
      </div>
    </>
  );
}
