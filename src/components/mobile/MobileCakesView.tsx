import { Link } from 'react-router-dom';
import { AlertCircle, Clock, MessageCircle, Minus, Plus } from 'lucide-react';
import { FoodImage, SiteMediaDisplay } from '../BrandLogo';
import { FssaiLicenceSection } from '../FssaiLicenceSection';
import { StockNoticeBanner } from '../StockNoticeBanner';
import { useApp } from '../../context/AppContext';
import {
  BENTO_CAKE_IMAGE_URL,
  CAKES_CELEBRATION_IMAGE_URL,
  CAKE_SICLES_IMAGE_URL,
  CUSTOM_PARTY_CAKE_IMAGE_URL,
  PARTY_CAKE_WHATSAPP_MESSAGE,
} from '../../data/catalog';
import { getInventoryStatusMeta, getRemainingAddableQuantity } from '../../lib/inventory';
import { formatRupees } from '../../lib/pricing';
import type { CakeMenuItem } from '../../types';

interface MobileCakesViewProps {
  bentoCakes: CakeMenuItem[];
  cakeSicles: CakeMenuItem[];
  partyCakes: CakeMenuItem[];
  selectedFlavours: Record<string, string>;
  onSelectFlavour: (cakeId: string, flavour: string) => void;
  whatsappUrl: string | null;
  copiedPrompt: boolean;
  onCopyMessage: () => void;
}

export function MobileCakesView({
  bentoCakes,
  cakeSicles,
  partyCakes,
  selectedFlavours,
  onSelectFlavour,
  whatsappUrl,
  copiedPrompt,
  onCopyMessage,
}: MobileCakesViewProps) {
  const { cart, addToCart, updateCartQuantity, settings, resolveSectionMedia } = useApp();
  const cakesHeroMedia = resolveSectionMedia('cakes_hero', CAKES_CELEBRATION_IMAGE_URL);

  const getCartQty = (cartKey: string) =>
    cart.find((c) => c.cartKey === cartKey)?.quantity ?? 0;

  return (
    <div className="md:hidden px-3.5 pt-3 pb-8 space-y-5">
      {/* Compact Hero Card */}
      <section className="bg-[#0A0A0B] text-white rounded-2xl overflow-hidden border border-zinc-800">
        {cakesHeroMedia.mediaType === 'video' ? (
          <>
            <div className="aspect-video bg-zinc-950 overflow-hidden">
              <SiteMediaDisplay
                mediaUrl={cakesHeroMedia.mediaUrl}
                derivativeUrl={cakesHeroMedia.derivativeUrl}
                mediaType="video"
                alt="ZAIKORA KITCHENS Bento Cake and Cake Sicles"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="px-4 pt-3">
              <p className="text-[11px] font-semibold tracking-widest text-[#E88D14]">
                ARTISAN CAKES SECTION
              </p>
              <h1 className="text-lg font-bold text-white leading-snug mt-0.5">
                Bento Cakes, Cake Sicles &amp; Party Cakes
              </h1>
            </div>
          </>
        ) : (
          <div className="relative h-36 bg-zinc-900 overflow-hidden">
            <FoodImage
              src={cakesHeroMedia.mediaUrl}
              derivativeSrc={cakesHeroMedia.derivativeUrl}
              alt="ZAIKORA KITCHENS Bento Cake and Cake Sicles"
              priority="high"
              loading="eager"
              className="w-full h-full object-contain"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B]/40 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
              <p className="text-[11px] font-semibold tracking-widest text-[#E88D14]">
                ARTISAN CAKES SECTION
              </p>
              <h1 className="text-lg font-bold text-white leading-snug mt-0.5">
                Bento Cakes, Cake Sicles &amp; Party Cakes
              </h1>
            </div>
          </div>
        )}
        <div className="px-4 py-3 text-xs text-zinc-300 space-y-1">
          <p className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#E88D14] shrink-0" />
            <span>Bento Cakes: minimum 1 hour notice</span>
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#E88D14] shrink-0" />
            <span>Party &amp; Birthday Cakes: order 1 day before (WhatsApp only)</span>
          </p>
        </div>
      </section>

      <StockNoticeBanner compact />

      {/* Online Orderable Cakes */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-zinc-900">Order Online</h2>

        {/* Bento Cakes */}
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
              className="bg-white border border-zinc-200 rounded-xl p-3.5 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-100 shrink-0">
                  <FoodImage
                    src={cake.imageUrl || BENTO_CAKE_IMAGE_URL}
                    derivativeSrc={cake.imageDerivativeUrl}
                    fallbackSrc={BENTO_CAKE_IMAGE_URL}
                    alt={cake.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-zinc-500">
                    {cake.quantityLabel} · 1 hr notice
                  </p>
                  <h3 className="text-base font-bold text-zinc-900 mt-0.5">{cake.name}</h3>
                  {stockMeta.code !== 'AVAILABLE' && (
                    <p
                      className={`text-[11px] font-bold mt-0.5 ${
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
                  <p className="text-xs text-zinc-600 mt-1 line-clamp-2">
                    {cake.description || '250g handcrafted celebration bento cake.'}
                  </p>
                  <p className="text-base font-bold font-mono tabular-nums text-zinc-900 mt-1.5">
                    {formatRupees(cake.originalPrice)}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-zinc-800">Select Flavour:</p>
                <div className="grid grid-cols-2 gap-2">
                  {flavours.map((flav) => (
                    <button
                      key={flav}
                      type="button"
                      onClick={() => onSelectFlavour(cake.id, flav)}
                      className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        activeFlavour === flav
                          ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      {flav}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-500">Flavour: {activeFlavour}</span>

                {!canOrder ? (
                  <span
                    className={`text-xs font-bold ${
                      stockMeta.code === 'SOLD_OUT' ? 'text-red-600' : 'text-zinc-400'
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
                      className="min-h-[42px] px-4 bg-[#E88D14] text-black text-xs font-bold rounded-lg active:bg-[#f39c25] whitespace-nowrap"
                    >
                      Add {activeFlavour}
                    </button>
                  )
                ) : (
                  <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-zinc-50">
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(cartKey, qty - 1)}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center text-zinc-800"
                      aria-label={`Decrease ${cake.name}`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2.5 text-xs font-mono tabular-nums font-bold">{qty}</span>
                    <button
                      type="button"
                      disabled={qty >= remainingForSelected}
                      onClick={() => updateCartQuantity(cartKey, qty + 1)}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center text-zinc-800 disabled:opacity-35"
                      aria-label={`Increase ${cake.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Cake Sicles */}
        {cakeSicles.map((cake) => {
          const cartKey = `cake:${cake.id}`;
          const qty = getCartQty(cartKey);
          const stockMeta = getInventoryStatusMeta(cake, { isCake: true });
          const remainingAddable = getRemainingAddableQuantity(cart, cake, 'cake', cartKey);
          const canOrder = stockMeta.orderable && settings.isAcceptingOrders;

          return (
            <div
              key={cake.id}
              className="bg-white border border-zinc-200 rounded-xl p-3.5 flex items-center gap-3"
            >
              <div className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-100 shrink-0">
                <FoodImage
                  src={cake.imageUrl || CAKE_SICLES_IMAGE_URL}
                  derivativeSrc={cake.imageDerivativeUrl}
                  fallbackSrc={CAKE_SICLES_IMAGE_URL}
                  alt={cake.name}
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                    <span>{cake.quantityLabel}</span>
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
                  <h3 className="text-base font-bold text-zinc-900 mt-0.5">{cake.name}</h3>
                  <p className="text-xs text-zinc-600 mt-0.5 line-clamp-2">
                    {cake.description || 'Chocolate-coated artisan cake sicle.'}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-bold font-mono tabular-nums text-zinc-900">
                    {formatRupees(cake.originalPrice)}
                  </span>

                  {!canOrder ? (
                    <span
                      className={`text-xs font-bold ${
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
                      className="min-h-[40px] px-4 bg-[#E88D14] text-black text-xs font-bold rounded-lg active:bg-[#f39c25]"
                    >
                      ADD
                    </button>
                  ) : (
                    <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-zinc-50">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(cartKey, qty - 1)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-800"
                        aria-label={`Decrease ${cake.name}`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2 text-xs font-mono tabular-nums font-bold">{qty}</span>
                      <button
                        type="button"
                        disabled={qty >= remainingAddable}
                        onClick={() => updateCartQuantity(cartKey, qty + 1)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-800 disabled:opacity-35"
                        aria-label={`Increase ${cake.name}`}
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
      </section>

      {/* Customizable Party Cakes — WhatsApp Enquiry Only */}
      <section className="space-y-3">
        {partyCakes.map((partyCake) => (
          <div
            key={partyCake.id}
            className="bg-[#0A0A0B] text-white border border-zinc-800 rounded-2xl p-4 space-y-4"
          >
            <div className="aspect-[4/3] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
              <FoodImage
                src={partyCake.imageUrl || CUSTOM_PARTY_CAKE_IMAGE_URL}
                derivativeSrc={partyCake.imageDerivativeUrl}
                fallbackSrc={CUSTOM_PARTY_CAKE_IMAGE_URL}
                alt={partyCake.name}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold tracking-wider text-[#E88D14]">
                WHATSAPP ENQUIRY ONLY · ORDER 1 DAY BEFORE
              </p>
              <h2 className="text-lg font-bold text-white">
                {partyCake.name} — {formatRupees(partyCake.originalPrice)}{' '}
                {partyCake.priceUnit || 'per kg'}
              </h2>
              <p className="text-xs text-zinc-300 leading-relaxed">{partyCake.description}</p>
            </div>

            <ul className="space-y-1 text-xs text-zinc-300">
              <li>• Order at least 1 day in advance.</li>
              <li>• Share design references &amp; occasion details on WhatsApp.</li>
              <li>• No online cart/checkout for custom party cakes.</li>
            </ul>

            <div className="space-y-2.5">
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[46px] px-4 py-3 bg-[#E88D14] text-black font-bold text-sm rounded-xl flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Contact on WhatsApp</span>
                </a>
              ) : (
                <div className="p-3 bg-zinc-900 border border-zinc-700 rounded-xl flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 text-[#E88D14] shrink-0 mt-0.5" />
                  <p className="text-zinc-300">
                    WhatsApp number not configured yet in{' '}
                    <span className="text-[#E88D14] font-semibold">Admin Settings</span>
                    .
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={onCopyMessage}
                className="w-full min-h-[42px] px-4 py-2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl"
              >
                {copiedPrompt ? 'Enquiry Message Copied' : 'Copy Enquiry Template'}
              </button>
            </div>

            <pre className="text-[11px] text-zinc-300 font-sans whitespace-pre-wrap leading-relaxed bg-black/50 p-3 rounded-lg border border-zinc-800">
              {PARTY_CAKE_WHATSAPP_MESSAGE}
            </pre>
          </div>
        ))}
      </section>
      {/* Dedicated Food Licence Section — Compact Black Logo & Number Only */}
      <FssaiLicenceSection
        id="food-licence-mobile"
        testId="fssai-licence-number-mobile"
      />
    </div>
  );
}
