import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Minus, Plus, ShieldCheck, Truck } from 'lucide-react';
import {
  BrandLogo,
  FoodImage,
  SiteMediaDisplay,
  preloadHeroImage,
} from '../components/BrandLogo';
import { FssaiLicenceSection } from '../components/FssaiLicenceSection';
import { QualityPhilosophySection } from '../components/QualityPhilosophySection';
import { StockNoticeBanner } from '../components/StockNoticeBanner';
import { MobileHomeView } from '../components/mobile/MobileHomeView';
import { useApp } from '../context/AppContext';
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  CAKES_CELEBRATION_IMAGE_URL,
  HERO_IMAGE_URL,
  getDishAuthenticDefaultImage,
} from '../data/catalog';
import { getInventoryStatusMeta, getRemainingAddableQuantity } from '../lib/inventory';
import { formatRupees } from '../lib/pricing';

export function HomePage() {
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

  const heroMedia = resolveSectionMedia('homepage_hero', HERO_IMAGE_URL);
  const cakesBannerMedia = resolveSectionMedia(
    'homepage_cakes_banner',
    CAKES_CELEBRATION_IMAGE_URL
  );
  const promoMedia = siteMedia['promo_banner'];

  useEffect(() => {
    if (heroMedia.mediaType === 'image') {
      preloadHeroImage(heroMedia.derivativeUrl || heroMedia.mediaUrl);
    }
  }, [heroMedia.mediaType, heroMedia.derivativeUrl, heroMedia.mediaUrl]);

  const signatureIds = [
    'chicken-biryani',
    'chicken-tandoori-strips',
    'bangude-fish-tawa-fry',
    'chicken-pizza',
    'loaded-chicken-fries',
    'gajar-ka-halwa',
  ];

  const featuredDishes = signatureIds
    .map((id) => foodMenu.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const getCartQty = (productId: string) =>
    cart.find((c) => c.cartKey === `food:${productId}`)?.quantity ?? 0;

  return (
    <>
      <MobileHomeView />
      <div className="hidden md:block">
      {/* Obsidian Editorial Hero */}
      <section className="bg-[#0A0A0B] text-white border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <BrandLogo className="h-20 w-auto" />
              </div>

              <div className="space-y-4">
                <p className="text-xs font-medium tracking-widest text-[#E88D14]">
                  {BRAND_TAGLINE}
                </p>
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] text-white text-balance max-w-xl">
                  Crafted fresh to order from {BRAND_NAME}.
                </h1>
                <p className="text-base text-zinc-300 leading-relaxed max-w-xl">
                  Order aromatic biryanis, coastal Mangalorean seafood, stone-baked snacks, and handcrafted celebration cakes directly from our kitchen.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to="/menu"
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors whitespace-nowrap"
                >
                  <span>Explore Food Menu</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/cakes"
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-zinc-900 text-white border border-zinc-700 font-semibold text-sm rounded-lg hover:border-[#E88D14] hover:text-[#E88D14] transition-colors whitespace-nowrap"
                >
                  <span>Visit Cakes Page</span>
                </Link>
              </div>

              <div className="pt-4 border-t border-zinc-800/90 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-400">
                <span>Freshly prepared to order</span>
                <span aria-hidden="true">·</span>
                <span>{settings.defaultPrepMinutes} min preparation time</span>
                <span aria-hidden="true">·</span>
                <span>Brigade Eldorado delivery & gate collection</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] lg:min-h-[420px] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
              <SiteMediaDisplay
                mediaUrl={heroMedia.mediaUrl}
                derivativeUrl={heroMedia.derivativeUrl}
                mediaType={heroMedia.mediaType}
                alt={`${BRAND_NAME} signature dishes`}
                className={
                  heroMedia.mediaType === 'video'
                    ? 'w-full h-full object-cover'
                    : 'w-full h-full object-contain'
                }
                priority="high"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Kitchen Standards Strip */}
      <section className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex items-start gap-4">
            <Clock className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">60-Minute Fresh Preparation</h2>
              <p className="text-sm text-zinc-600 mt-1">
                Every dish is prepared fresh upon confirmation with live status updates until handover.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Truck className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Brigade Eldorado & Main Gate</h2>
              <p className="text-sm text-zinc-600 mt-1">
                Delivery within Brigade Eldorado, apartment main gate delivery outside, or Main Gate self-collection.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <ShieldCheck className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Honest Kitchen Pricing</h2>
              <p className="text-sm text-zinc-600 mt-1">
                Direct menu prices with clear order totals and online coupon support at checkout.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Signature Dishes Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="mb-6">
          <StockNoticeBanner />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-medium tracking-widest text-[#D97706] mb-1">
              SIGNATURE SELECTIONS
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              Popular from the Food Menu
            </h2>
          </div>
          <Link
            to="/menu"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:text-[#D97706] transition-colors whitespace-nowrap"
          >
            <span>View Full Menu ({foodMenu.length} items)</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col justify-between hover:border-zinc-300 transition-colors"
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
                      priority={idx < 3 ? 'high' : 'normal'}
                      loading={idx < 3 ? 'eager' : 'lazy'}
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
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1.5">
                      <span>{item.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.quantityLabel}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-zinc-900">{item.name}</h3>
                    {item.description && (
                      <p className="text-sm text-zinc-600 mt-1.5 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3 border-t border-zinc-100 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-lg font-bold font-mono tabular-nums text-zinc-900">
                      {formatRupees(item.originalPrice)}
                    </span>
                  </div>

                  {!canOrder ? (
                    <span
                      className={`text-xs font-bold ${
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
                      Add
                    </button>
                  ) : (
                    <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-zinc-50">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(`food:${item.id}`, qty - 1)}
                        className="p-2 text-zinc-700 hover:text-black"
                        aria-label={`Decrease quantity of ${item.name}`}
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
                        aria-label={`Increase quantity of ${item.name}`}
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

      {/* Optional Kitchen Promotional Media Showcase */}
      {promoMedia?.mediaUrl && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-center">
            <div className="lg:col-span-7 aspect-video lg:aspect-[16/9] bg-zinc-950">
              <SiteMediaDisplay
                mediaUrl={promoMedia.mediaUrl}
                derivativeUrl={promoMedia.derivativeUrl}
                mediaType={promoMedia.mediaType}
                alt={promoMedia.label || `${BRAND_NAME} Kitchen Spotlight`}
                className={
                  promoMedia.mediaType === 'video'
                    ? 'w-full h-full object-cover'
                    : 'w-full h-full object-contain'
                }
              />
            </div>
            <div className="lg:col-span-5 p-8 space-y-3">
              <p className="text-xs font-semibold tracking-widest text-[#D97706]">
                FROM OUR KITCHEN
              </p>
              <h2 className="text-2xl font-bold text-zinc-900">
                {promoMedia.label || 'Freshly Crafted Specialties'}
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Explore authentic small-batch dishes prepared upon your confirmed order at Brigade Eldorado.
              </p>
              <Link
                to="/menu"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black transition-colors"
              >
                <span>Order Fresh Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Homemade Masalas & Premium Quality Section */}
      <QualityPhilosophySection />

      {/* Dedicated Cakes Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <div className="bg-[#0A0A0B] text-white rounded-2xl border border-zinc-800 overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-6 p-8 sm:p-10 flex flex-col justify-center space-y-5">
            <p className="text-xs font-medium tracking-widest text-[#E88D14]">
              SEPARATE CAKES SECTION
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">
              Bento Cakes, Cake Sicles & Custom Party Cakes
            </h2>
            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
              Order fresh 250g Bento Cakes (1-hour notice) and Cake Sicles directly online, or enquire on WhatsApp for custom ₹500/kg Party Cakes with your design references.
            </p>
            <div className="pt-2">
              <Link
                to="/cakes"
                className="inline-flex items-center gap-2 px-5 py-3 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors whitespace-nowrap"
              >
                <span>Open Cakes Page</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
          <div className="lg:col-span-6 min-h-[260px]">
            <SiteMediaDisplay
              mediaUrl={cakesBannerMedia.mediaUrl}
              derivativeUrl={cakesBannerMedia.derivativeUrl}
              mediaType={cakesBannerMedia.mediaType}
              alt="ZAIKORA KITCHENS Bento Cakes and Cake Sicles"
              className={
                cakesBannerMedia.mediaType === 'video'
                  ? 'w-full h-full object-cover'
                  : 'w-full h-full object-contain'
              }
            />
          </div>
        </div>
      </section>

      {/* FSSAI Food Licence (Logo & Number Only) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
        <FssaiLicenceSection
          id="food-licence-home"
          testId="fssai-licence-number-home"
        />
      </section>
      </div>
    </>
  );
}
