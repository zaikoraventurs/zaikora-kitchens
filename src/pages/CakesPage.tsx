import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Clock, MessageCircle, Minus, Plus, ShoppingBag } from 'lucide-react';
import { BrandLogo, FoodImage, SiteMediaDisplay } from '../components/BrandLogo';
import { FssaiLicenceSection } from '../components/FssaiLicenceSection';
import { StockNoticeBanner } from '../components/StockNoticeBanner';
import { MobileCakesView } from '../components/mobile/MobileCakesView';
import { useApp } from '../context/AppContext';
import {
  BENTO_CAKE_IMAGE_URL,
  BRAND_NAME,
  CAKES_CELEBRATION_IMAGE_URL,
  CAKE_SICLES_IMAGE_URL,
  CUSTOM_PARTY_CAKE_IMAGE_URL,
  PARTY_CAKE_WHATSAPP_MESSAGE,
} from '../data/catalog';
import { getInventoryStatusMeta, getRemainingAddableQuantity } from '../lib/inventory';
import { buildPartyCakeWhatsAppUrl, formatRupees } from '../lib/pricing';

export function CakesPage() {
  const { cakeMenu, cart, addToCart, updateCartQuantity, settings, resolveSectionMedia } =
    useApp();
  const [selectedFlavours, setSelectedFlavours] = useState<Record<string, string>>({
    'bento-cake': 'Chocolate',
  });
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const cakesHeroMedia = resolveSectionMedia('cakes_hero', CAKES_CELEBRATION_IMAGE_URL);
  const bentoCakes = cakeMenu.filter((c) => c.cakeType === 'bento');
  const cakeSicles = cakeMenu.filter((c) => c.cakeType === 'sicle');
  const partyCakes = cakeMenu.filter((c) => c.cakeType === 'party');

  const whatsappUrl = buildPartyCakeWhatsAppUrl(settings.whatsappNumber || '');

  const getCartQty = (cartKey: string) =>
    cart.find((c) => c.cartKey === cartKey)?.quantity ?? 0;

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(PARTY_CAKE_WHATSAPP_MESSAGE);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <>
      <MobileCakesView
        bentoCakes={bentoCakes}
        cakeSicles={cakeSicles}
        partyCakes={partyCakes}
        selectedFlavours={selectedFlavours}
        onSelectFlavour={(cakeId, flav) =>
          setSelectedFlavours((prev) => ({ ...prev, [cakeId]: flav }))
        }
        whatsappUrl={whatsappUrl}
        copiedPrompt={copiedPrompt}
        onCopyMessage={handleCopyMessage}
      />
      <div className="hidden md:block space-y-12 pb-12">
      {/* Cakes Header Banner */}
      <section className="bg-[#0A0A0B] text-white border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-3">
              <BrandLogo className="h-14 w-auto" />
            </div>
            <p className="text-xs font-medium tracking-widest text-[#E88D14]">
              {BRAND_NAME} · ARTISAN CAKES
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
              Handcrafted Bento Cakes, Cake Sicles & Custom Party Cakes
            </h1>
            <p className="text-sm sm:text-base text-zinc-300 max-w-2xl leading-relaxed">
              Freshly baked small-batch cakes prepared separately from our savoury kitchen. Order Bento Cakes and Cake Sicles online, or enquire on WhatsApp for bespoke party cakes.
            </p>
            <div className="pt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-400">
              <span>Bento cakes: order minimum 1 hour before</span>
              <span aria-hidden="true">·</span>
              <span>Party & birthday cakes: order 1 day before</span>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="aspect-[4/3] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
              <SiteMediaDisplay
                mediaUrl={cakesHeroMedia.mediaUrl}
                derivativeUrl={cakesHeroMedia.derivativeUrl}
                mediaType={cakesHeroMedia.mediaType}
                alt="ZAIKORA KITCHENS Bento Cake and Cake Sicles"
                className={
                  cakesHeroMedia.mediaType === 'video'
                    ? 'w-full h-full object-cover'
                    : 'w-full h-full object-contain'
                }
                priority="high"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Ordering Notices */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 flex items-start gap-3">
            <Clock className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Bento Cakes Notice</h2>
              <p className="text-sm text-zinc-600 mt-1">
                Minimum ordering notice: one hour before. Choose your preferred flavour below and order directly online.
              </p>
            </div>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-5 flex items-start gap-3">
            <Clock className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Party & Birthday Cakes Notice</h2>
              <p className="text-sm text-zinc-600 mt-1">
                Party cakes and birthday cakes: order one day before. Discussed and confirmed exclusively via WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Online Orderable Cakes: Bento Cake & Cake Sicles */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <StockNoticeBanner />
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-200 pb-3">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">Order Online — Bento Cakes & Cake Sicles</h2>
            <p className="text-sm text-zinc-600 mt-1">
              Freshly prepared to order and available for direct online checkout.
            </p>
          </div>
          {cart.length > 0 && (
            <Link
              to="/cart"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A0A0B] text-white text-sm font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black transition-colors whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Go to Cart</span>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Bento Cake Cards */}
          {bentoCakes.map((cake) => {
            const flavours = cake.flavours?.length
              ? cake.flavours
              : ['Red Velvet', 'Chocolate', 'Pineapple', 'Vanilla'];
            const activeFlavour = selectedFlavours[cake.id] || flavours[0];
            const cartKey = `cake:${cake.id}:${activeFlavour}`;
            const qty = getCartQty(cartKey);
            const stockMeta = getInventoryStatusMeta(cake, { isCake: true });
            const remainingForSelected = getRemainingAddableQuantity(
              cart,
              cake,
              'cake',
              cartKey
            );
            const canOrder = stockMeta.orderable && settings.isAcceptingOrders;

            return (
              <div
                key={cake.id}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/3] bg-zinc-100 relative overflow-hidden">
                    <FoodImage
                      src={cake.imageUrl || BENTO_CAKE_IMAGE_URL}
                      derivativeSrc={cake.imageDerivativeUrl}
                      fallbackSrc={BENTO_CAKE_IMAGE_URL}
                      alt={cake.name}
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
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{cake.quantityLabel}</span>
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
                        {stockMeta.customerBadge} · 1 hr notice
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900">{cake.name}</h3>
                      <p className="text-sm text-zinc-600 mt-1">
                        {cake.description || '250g handcrafted celebration bento cake.'}
                      </p>
                    </div>

                    {/* Flavour Selector */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-zinc-800">
                        Select Flavour:
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {flavours.map((flav) => (
                          <button
                            key={flav}
                            type="button"
                            onClick={() =>
                              setSelectedFlavours((prev) => ({ ...prev, [cake.id]: flav }))
                            }
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                              activeFlavour === flav
                                ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                                : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-400'
                            }`}
                          >
                            {flav}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xl font-bold font-mono tabular-nums text-zinc-900">
                      {formatRupees(cake.originalPrice)}
                    </span>
                    <p className="text-xs text-zinc-500">{cake.quantityLabel}</p>
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
                    remainingForSelected <= 0 ? (
                      <span className="text-xs font-semibold text-amber-800">
                        Max stock in cart
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          addToCart({
                            cartKey,
                            productId: cake.id,
                            productType: 'cake',
                            name: cake.name,
                            quantityLabel: cake.quantityLabel,
                            selectedFlavour: activeFlavour,
                            originalPrice: cake.originalPrice,
                            eligibleForAutoDiscount: cake.eligibleForAutoDiscount,
                            imageUrl: cake.imageUrl || BENTO_CAKE_IMAGE_URL,
                          })
                        }
                        className="px-5 py-2.5 bg-[#E88D14] text-black text-sm font-semibold rounded-lg hover:bg-[#f39c25] transition-colors whitespace-nowrap"
                      >
                        Add {activeFlavour}
                      </button>
                    )
                  ) : (
                    <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-white">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(cartKey, qty - 1)}
                        className="p-2.5 text-zinc-700 hover:text-black"
                        aria-label={`Decrease ${cake.name}`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="px-3 text-sm font-mono tabular-nums font-semibold">
                        {qty}
                      </span>
                      <button
                        type="button"
                        disabled={qty >= remainingForSelected}
                        onClick={() => updateCartQuantity(cartKey, qty + 1)}
                        className="p-2.5 text-zinc-700 hover:text-black disabled:opacity-35 disabled:cursor-not-allowed"
                        aria-label={`Increase ${cake.name}`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Cake Sicles Cards */}
          {cakeSicles.map((cake) => {
            const cartKey = `cake:${cake.id}`;
            const qty = getCartQty(cartKey);
            const stockMeta = getInventoryStatusMeta(cake, { isCake: true });
            const remainingAddable = getRemainingAddableQuantity(
              cart,
              cake,
              'cake',
              cartKey
            );
            const canOrder = stockMeta.orderable && settings.isAcceptingOrders;

            return (
              <div
                key={cake.id}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/3] bg-zinc-100 relative overflow-hidden">
                    <FoodImage
                      src={cake.imageUrl || CAKE_SICLES_IMAGE_URL}
                      derivativeSrc={cake.imageDerivativeUrl}
                      fallbackSrc={CAKE_SICLES_IMAGE_URL}
                      alt={cake.name}
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
                  <div className="p-6 space-y-3">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{cake.quantityLabel}</span>
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
                    <h3 className="text-xl font-bold text-zinc-900">{cake.name}</h3>
                    <p className="text-sm text-zinc-600">
                      {cake.description || 'Chocolate-coated artisan cake sicle prepared fresh.'}
                    </p>
                  </div>
                </div>

                <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xl font-bold font-mono tabular-nums text-zinc-900">
                      {formatRupees(cake.originalPrice)}
                    </span>
                    <p className="text-xs text-zinc-500">{cake.quantityLabel}</p>
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
                          cartKey,
                          productId: cake.id,
                          productType: 'cake',
                          name: cake.name,
                          quantityLabel: cake.quantityLabel,
                          originalPrice: cake.originalPrice,
                          eligibleForAutoDiscount: cake.eligibleForAutoDiscount,
                          imageUrl: cake.imageUrl || CAKE_SICLES_IMAGE_URL,
                        })
                      }
                      className="px-5 py-2.5 bg-[#E88D14] text-black text-sm font-semibold rounded-lg hover:bg-[#f39c25] transition-colors whitespace-nowrap"
                    >
                      Add to Cart
                    </button>
                  ) : (
                    <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-white">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(cartKey, qty - 1)}
                        className="p-2.5 text-zinc-700 hover:text-black"
                        aria-label={`Decrease ${cake.name}`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="px-3 text-sm font-mono tabular-nums font-semibold">
                        {qty}
                      </span>
                      <button
                        type="button"
                        disabled={qty >= remainingAddable}
                        onClick={() => updateCartQuantity(cartKey, qty + 1)}
                        className="p-2.5 text-zinc-700 hover:text-black disabled:opacity-35 disabled:cursor-not-allowed"
                        aria-label={`Increase ${cake.name}`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Customizable Party Cakes — Informational Only + WhatsApp Enquiry */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        {partyCakes.map((partyCake) => (
          <div
            key={partyCake.id}
            className="bg-[#0A0A0B] text-white border border-zinc-800 rounded-2xl p-8 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            <div className="lg:col-span-7 space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <span className="text-[#E88D14] font-semibold tracking-wider">
                  WHATSAPP ENQUIRY ONLY
                </span>
                <span aria-hidden="true">·</span>
                <span>No online checkout or payment</span>
                <span aria-hidden="true">·</span>
                <span>Order 1 day before</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {partyCake.name} — {formatRupees(partyCake.originalPrice)} {partyCake.priceUnit || 'per kg'}
              </h2>

              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
                {partyCake.description}
              </p>

              <ul className="space-y-2 text-sm text-zinc-300">
                <li>• Party cakes and birthday cakes must be ordered at least one day before.</li>
                <li>• Custom designs, themes, flavours, and weights are finalized directly on WhatsApp.</li>
                <li>• Share your cake reference photographs and occasion details directly in WhatsApp chat.</li>
                <li>• Displayed for information only — custom orders are confirmed directly via WhatsApp.</li>
              </ul>

              <div className="pt-3 flex flex-wrap items-center gap-4">
                {whatsappUrl ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span>Contact on WhatsApp</span>
                  </a>
                ) : (
                  <div className="w-full p-4 bg-zinc-900 border border-zinc-700 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-[#E88D14] shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold text-white">
                        WhatsApp number not configured yet
                      </p>
                      <p className="text-zinc-400 mt-1">
                        Restaurant administrator must configure the official WhatsApp number in{' '}
                        <span className="text-[#E88D14] font-semibold">
                          Admin Dashboard → Settings
                        </span>{' '}
                        to activate direct WhatsApp cake enquiries.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="px-4 py-3 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm font-medium rounded-lg hover:border-zinc-500 transition-colors"
                >
                  {copiedPrompt ? 'Enquiry Message Copied' : 'Copy Enquiry Template'}
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="aspect-[4/3] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                <FoodImage
                  src={partyCake.imageUrl || CUSTOM_PARTY_CAKE_IMAGE_URL}
                  derivativeSrc={partyCake.imageDerivativeUrl}
                  fallbackSrc={CUSTOM_PARTY_CAKE_IMAGE_URL}
                  alt={partyCake.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="bg-[#141416] border border-zinc-800 rounded-xl p-6 space-y-3">
                <p className="text-xs font-semibold tracking-wider text-[#E88D14]">
                  PRE-FILLED WHATSAPP ENQUIRY MESSAGE
                </p>
                <pre className="text-xs text-zinc-300 font-sans whitespace-pre-wrap leading-relaxed bg-black/50 p-4 rounded-lg border border-zinc-800">
                  {PARTY_CAKE_WHATSAPP_MESSAGE}
                </pre>
              </div>
            </div>
          </div>
        ))}
      </section>
      {/* Dedicated Food Licence Section — Compact Black Logo & Number Only */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <FssaiLicenceSection
          id="food-licence"
          testId="fssai-licence-number"
        />
      </section>
      </div>
    </>
  );
}
