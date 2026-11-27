import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Cake, Clock, MapPin, Minus, Plus, Search, X } from 'lucide-react';
import { FoodImage, SiteMediaDisplay } from '../BrandLogo';
import { FssaiLicenceSection } from '../FssaiLicenceSection';
import { QualityPhilosophySection } from '../QualityPhilosophySection';
import { StockNoticeBanner } from '../StockNoticeBanner';
import { useApp } from '../../context/AppContext';
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  CAKES_CELEBRATION_IMAGE_URL,
  HERO_IMAGE_URL,
  getDishAuthenticDefaultImage,
} from '../../data/catalog';
import { getInventoryStatusMeta, getRemainingAddableQuantity } from '../../lib/inventory';
import { formatRupees } from '../../lib/pricing';

const MOBILE_CATEGORY_DEFS: Array<{
  label: string;
  to: string;
  categoryKey?: string;
  sectionKey?: 'homepage_hero' | 'homepage_cakes_banner';
  fallbackUrl?: string;
}> = [
  { label: 'All', to: '/menu', sectionKey: 'homepage_hero', fallbackUrl: HERO_IMAGE_URL },
  {
    label: 'Starters',
    to: `/menu?category=${encodeURIComponent('Starters')}`,
    categoryKey: 'Starters',
  },
  {
    label: 'Main Course',
    to: `/menu?category=${encodeURIComponent('Main Course – Lunch & Dinner')}`,
    categoryKey: 'Main Course – Lunch & Dinner',
  },
  {
    label: 'Seafood Specials',
    to: `/menu?category=${encodeURIComponent('Seafood Specials')}`,
    categoryKey: 'Seafood Specials',
  },
  {
    label: 'Pizza Corner',
    to: `/menu?category=${encodeURIComponent('Evening Snacks – Pizza Corner')}`,
    categoryKey: 'Evening Snacks – Pizza Corner',
  },
  {
    label: 'Burger Corner',
    to: `/menu?category=${encodeURIComponent('Burger Corner')}`,
    categoryKey: 'Burger Corner',
  },
  {
    label: 'Fries Corner',
    to: `/menu?category=${encodeURIComponent('Fries Corner')}`,
    categoryKey: 'Fries Corner',
  },
  {
    label: 'Pasta Corner',
    to: `/menu?category=${encodeURIComponent('Pasta Corner')}`,
    categoryKey: 'Pasta Corner',
  },
  {
    label: 'Additional Snacks',
    to: `/menu?category=${encodeURIComponent('Additional Snacks')}`,
    categoryKey: 'Additional Snacks',
  },
  {
    label: 'Desserts',
    to: `/menu?category=${encodeURIComponent('Desserts')}`,
    categoryKey: 'Desserts',
  },
  {
    label: 'Cakes',
    to: '/cakes',
    sectionKey: 'homepage_cakes_banner',
    fallbackUrl: CAKES_CELEBRATION_IMAGE_URL,
  },
];

export function MobileHomeView() {
  const {
    foodMenu,
    cart,
    addToCart,
    updateCartQuantity,
    settings,
    siteMedia,
    resolveSectionMedia,
    resolveCategoryImage,
  } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const heroMedia = resolveSectionMedia('homepage_hero', HERO_IMAGE_URL);
  const cakesBannerMedia = resolveSectionMedia(
    'homepage_cakes_banner',
    CAKES_CELEBRATION_IMAGE_URL
  );
  const promoMedia = siteMedia['promo_banner'];

  const signatureIds = [
    'chicken-biryani',
    'chicken-tandoori-strips',
    'bangude-fish-tawa-fry',
    'chicken-pizza',
    'loaded-chicken-fries',
    'gajar-ka-halwa',
  ];

  const featuredDishes = useMemo(
    () =>
      signatureIds
        .map((id) => foodMenu.find((item) => item.id === id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [foodMenu]
  );

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!trimmedQuery) return [];
    return foodMenu.filter(
      (item) =>
        item.name.toLowerCase().includes(trimmedQuery) ||
        item.category.toLowerCase().includes(trimmedQuery) ||
        item.quantityLabel.toLowerCase().includes(trimmedQuery) ||
        (item.description || '').toLowerCase().includes(trimmedQuery)
    );
  }, [foodMenu, trimmedQuery]);

  const getCartQty = (productId: string) =>
    cart.find((c) => c.cartKey === `food:${productId}`)?.quantity ?? 0;

  return (
    <div className="md:hidden px-3.5 pt-3 pb-6 space-y-5">
      <StockNoticeBanner compact />
      {/* B. Compact Brigade Eldorado Delivery & Collection Strip */}
      <section
        aria-label="Delivery and collection rules"
        className="bg-white border border-zinc-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <MapPin className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-zinc-900 truncate">
              Brigade Eldorado Delivery &amp; Gate Collection
            </p>
            <p className="text-[11px] text-zinc-600 truncate">
              Inside Brigade Eldorado · Outside: Main Gate only
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-zinc-700 bg-zinc-100 px-2 py-1 rounded-md">
          <Clock className="w-3.5 h-3.5 text-[#D97706]" />
          <span className="font-mono tabular-nums">{settings.defaultPrepMinutes}m</span>
        </div>
      </section>

      {/* C. Instant Food Search Bar */}
      <section aria-label="Search food menu" className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for food, dishes and more..."
            aria-label="Search for food, dishes and more"
            className="w-full min-h-[46px] pl-10 pr-10 py-2.5 bg-white border border-zinc-300 rounded-xl text-base text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:outline-none focus:border-[#E88D14]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[38px] min-h-[38px] flex items-center justify-center text-zinc-500 hover:text-zinc-900"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Instant Search Results */}
        {trimmedQuery && (
          <div className="bg-white border border-zinc-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                Search results for <strong className="text-zinc-900">&ldquo;{searchQuery.trim()}&rdquo;</strong>
              </span>
              <span className="font-mono tabular-nums">{searchResults.length} found</span>
            </div>

            {searchResults.length === 0 ? (
              <div className="py-4 text-center space-y-2">
                <p className="text-sm font-medium text-zinc-700">No dishes match your search.</p>
                <Link
                  to="/menu"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#D97706]"
                >
                  <span>Browse full food menu</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {searchResults.map((item) => {
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
                  return (
                    <div key={item.id} className="py-2.5 first:pt-1 last:pb-1 flex items-center gap-3">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 shrink-0">
                        <FoodImage
                          src={resolvedSrc}
                          derivativeSrc={resolvedDerivative}
                          fallbackSrc={
                            getDishAuthenticDefaultImage(item.id, item.name, item.category) ||
                            catFallback.src
                          }
                          alt={item.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate">{item.name}</p>
                        <p className="text-xs text-zinc-500 truncate">
                          {item.category} · {item.quantityLabel}
                        </p>
                        {stockMeta.code !== 'AVAILABLE' && (
                          <p
                            className={`text-[10px] font-bold truncate ${
                              stockMeta.code === 'SOLD_OUT'
                                ? 'text-red-600'
                                : stockMeta.code === 'LOW_STOCK'
                                ? 'text-amber-700'
                                : 'text-zinc-500'
                            }`}
                          >
                            {stockMeta.customerBadge}
                          </p>
                        )}
                        <p className="text-sm font-bold font-mono tabular-nums text-zinc-900 mt-0.5">
                          {formatRupees(item.originalPrice)}
                        </p>
                      </div>
                      <div className="shrink-0">
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
                            className="min-h-[38px] px-3.5 bg-[#0A0A0B] text-white text-xs font-bold rounded-lg active:bg-[#E88D14] active:text-black transition-colors"
                          >
                            ADD
                          </button>
                        ) : (
                          <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-zinc-50">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(`food:${item.id}`, qty - 1)}
                              aria-label={`Decrease quantity of ${item.name}`}
                              className="min-w-[34px] min-h-[36px] flex items-center justify-center text-zinc-800"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-1.5 text-xs font-mono tabular-nums font-bold">
                              {qty}
                            </span>
                            <button
                              type="button"
                              disabled={qty >= remainingAddable}
                              onClick={() => updateCartQuantity(`food:${item.id}`, qty + 1)}
                              aria-label={`Increase quantity of ${item.name}`}
                              className="min-w-[34px] min-h-[36px] flex items-center justify-center text-zinc-800 disabled:opacity-35"
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
            )}
          </div>
        )}
      </section>

      {/* D. Compact Hero Banner with Primary "ORDER NOW" CTA */}
      <section className="bg-[#0A0A0B] text-white rounded-2xl overflow-hidden border border-zinc-800">
        {heroMedia.mediaType === 'video' ? (
          <>
            <div className="aspect-video bg-zinc-950 overflow-hidden">
              <SiteMediaDisplay
                mediaUrl={heroMedia.mediaUrl}
                derivativeUrl={heroMedia.derivativeUrl}
                mediaType="video"
                alt={`${BRAND_NAME} freshly cooked dishes`}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="px-4 pt-3">
              <p className="text-[11px] font-semibold tracking-widest text-[#E88D14]">
                {BRAND_TAGLINE}
              </p>
              <h1 className="text-xl font-bold tracking-tight text-white leading-snug mt-0.5">
                Freshly prepared to order.
              </h1>
            </div>
          </>
        ) : (
          <div className="relative h-40 bg-zinc-900 overflow-hidden">
            <FoodImage
              src={heroMedia.mediaUrl}
              derivativeSrc={heroMedia.derivativeUrl}
              alt={`${BRAND_NAME} freshly cooked dishes`}
              priority="high"
              loading="eager"
              className="w-full h-full object-contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B]/35 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
              <p className="text-[11px] font-semibold tracking-widest text-[#E88D14]">
                {BRAND_TAGLINE}
              </p>
              <h1 className="text-xl font-bold tracking-tight text-white leading-snug mt-0.5">
                Freshly prepared to order.
              </h1>
            </div>
          </div>
        )}
        <div className="p-4 pt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-300 leading-relaxed">
            Biryanis, coastal seafood, pizzas, snacks &amp; homestyle mains.
          </p>
          <Link
            to="/menu"
            className="shrink-0 min-h-[44px] px-4 py-2.5 bg-[#E88D14] text-black text-xs font-bold tracking-wide rounded-lg inline-flex items-center gap-1.5 active:bg-[#f39c25] whitespace-nowrap"
          >
            <span>ORDER NOW</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* E. Horizontally Scrollable Categories (plus separate Cakes button) */}
      <section aria-label="Food categories" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900">Browse Categories</h2>
          <Link to="/menu" className="text-xs font-semibold text-[#D97706]">
            See all
          </Link>
        </div>
        <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-3.5 px-3.5">
          {MOBILE_CATEGORY_DEFS.map((cat) => {
            let imgSrc = HERO_IMAGE_URL;
            let derivSrc: string | undefined;
            if (cat.categoryKey) {
              const resolved = resolveCategoryImage(cat.categoryKey);
              imgSrc = resolved.src;
              derivSrc = resolved.derivativeSrc;
            } else if (cat.sectionKey && cat.fallbackUrl) {
              const sec = resolveSectionMedia(cat.sectionKey, cat.fallbackUrl);
              if (sec.mediaType === 'image') {
                imgSrc = sec.mediaUrl;
                derivSrc = sec.derivativeUrl;
              } else {
                imgSrc = cat.fallbackUrl;
              }
            }
            return (
              <Link
                key={cat.label}
                to={cat.to}
                className="shrink-0 w-[84px] bg-white border border-zinc-200 rounded-xl p-1.5 flex flex-col items-center text-center gap-1.5 active:border-[#E88D14]"
              >
                <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-zinc-100">
                  <FoodImage
                    src={imgSrc}
                    derivativeSrc={derivSrc}
                    alt={cat.label}
                    priority="high"
                    loading="eager"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-[11px] font-semibold text-zinc-800 leading-tight line-clamp-2 pb-0.5">
                  {cat.label}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* F. Popular Food Section */}
      <section aria-label="Popular food dishes" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-[#D97706]">
              SIGNATURE SELECTIONS
            </p>
            <h2 className="text-lg font-bold text-zinc-900">Popular Dishes</h2>
          </div>
          <Link
            to="/menu"
            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 min-h-[36px]"
          >
            <span>Full Menu ({foodMenu.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-3">
          {featuredDishes.map((item, idx) => {
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
              item.imageDerivativeUrl || (!item.imageUrl ? catFallback.derivativeSrc : undefined);
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
                    priority={idx < 2 ? 'high' : 'normal'}
                    loading={idx < 2 ? 'eager' : 'lazy'}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {item.category} · {item.quantityLabel}
                    </p>
                    <h3 className="text-sm font-bold text-zinc-900 truncate mt-0.5">
                      {item.name}
                    </h3>
                    {stockMeta.code !== 'AVAILABLE' && (
                      <p
                        className={`text-[11px] font-bold mt-0.5 truncate ${
                          stockMeta.code === 'SOLD_OUT'
                            ? 'text-red-600'
                            : stockMeta.code === 'LOW_STOCK'
                            ? 'text-amber-700'
                            : 'text-zinc-500'
                        }`}
                      >
                        {stockMeta.customerWarning || stockMeta.customerBadge}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-xs text-zinc-600 line-clamp-1 mt-0.5">
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
                        className="min-h-[38px] px-4 bg-[#0A0A0B] text-white text-xs font-bold rounded-lg active:bg-[#E88D14] active:text-black transition-colors"
                      >
                        ADD
                      </button>
                    ) : (
                      <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-zinc-50">
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(`food:${item.id}`, qty - 1)}
                          aria-label={`Decrease quantity of ${item.name}`}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-800"
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
                          aria-label={`Increase quantity of ${item.name}`}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-800 disabled:opacity-35"
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

      {/* Optional Kitchen Promotional Media Spotlight */}
      {promoMedia?.mediaUrl && (
        <section aria-label="Kitchen spotlight">
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
            <div className="aspect-video bg-zinc-950">
              <SiteMediaDisplay
                mediaUrl={promoMedia.mediaUrl}
                derivativeUrl={promoMedia.derivativeUrl}
                mediaType={promoMedia.mediaType}
                alt={promoMedia.label || `${BRAND_NAME} Kitchen Spotlight`}
                className="w-full h-full object-cover"
              />
            </div>
            {promoMedia.label && (
              <div className="px-4 py-2.5 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-zinc-900 truncate">{promoMedia.label}</p>
                <Link to="/menu" className="text-xs font-semibold text-[#D97706] shrink-0">
                  Order Now
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Homemade Masalas & Premium Quality Section */}
      <QualityPhilosophySection compact />

      {/* G. Compact Separate Cakes Banner */}
      <section aria-label="Cakes page showcase">
        <Link
          to="/cakes"
          className="block bg-[#0A0A0B] text-white border border-zinc-800 rounded-2xl overflow-hidden active:border-[#E88D14] transition-colors"
        >
          <div className="flex items-stretch gap-3 p-3.5">
            <div className="w-24 h-24 rounded-xl overflow-hidden bg-zinc-900 shrink-0">
              <FoodImage
                src={
                  cakesBannerMedia.mediaType === 'image'
                    ? cakesBannerMedia.mediaUrl
                    : CAKES_CELEBRATION_IMAGE_URL
                }
                derivativeSrc={cakesBannerMedia.derivativeUrl}
                alt="Bento Cakes, Cake Sicles & Custom Party Cakes"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[#E88D14]">
                  <Cake className="w-3.5 h-3.5" />
                  <span>SEPARATE CAKES SECTION</span>
                </div>
                <h2 className="text-sm font-bold text-white mt-0.5">
                  Bento Cakes, Cake Sicles &amp; Party Cakes
                </h2>
                <p className="text-xs text-zinc-300 mt-1 line-clamp-2">
                  250g Bento Cakes (₹130), Cake Sicles (₹40), and WhatsApp Custom Party Cakes (₹500/kg).
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#E88D14] mt-2">
                <span>Open Cakes Page</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </Link>
      </section>

      {/* FSSAI Food Licence (Logo & Number Only) */}
      <section aria-label="Food Licence">
        <FssaiLicenceSection
          id="food-licence-home-mobile"
          testId="fssai-licence-number-home-mobile"
        />
      </section>
    </div>
  );
}
