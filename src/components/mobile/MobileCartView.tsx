import { Link } from 'react-router-dom';
import { ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import { FoodImage } from '../BrandLogo';
import { StockNoticeBanner } from '../StockNoticeBanner';
import { useApp } from '../../context/AppContext';
import {
  getCakeAuthenticDefaultImage,
  getDishAuthenticDefaultImage,
} from '../../data/catalog';
import {
  getCartQuantityForProduct,
  getInventoryStatusMeta,
  getMaxOrderableForProduct,
  getRemainingAddableQuantity,
  normalizeInventoryFields,
} from '../../lib/inventory';
import { calculatePriceBreakdown, formatRupees, sanitizeCouponCode } from '../../lib/pricing';
import type { CouponRecord } from '../../types';

interface MobileCartViewProps {
  couponInput: string;
  onCouponInputChange: (val: string) => void;
  checkingCoupon: boolean;
  couponMessage: { type: 'ok' | 'err'; text: string } | null;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  appliedCoupon: CouponRecord | null;
}

export function MobileCartView({
  couponInput,
  onCouponInputChange,
  checkingCoupon,
  couponMessage,
  onApplyCoupon,
  onRemoveCoupon,
  appliedCoupon,
}: MobileCartViewProps) {
  const {
    cart,
    foodMenu,
    cakeMenu,
    updateCartQuantity,
    removeFromCart,
    settings,
    checkoutCharges,
    isCustomerAuthenticated,
    customerName,
    verifiedPhone,
  } = useApp();

  const breakdown = calculatePriceBreakdown(
    cart,
    appliedCoupon,
    'delivery',
    settings,
    checkoutCharges
  );

  const hasStockConflict =
    !settings.isAcceptingOrders ||
    cart.some((item) => {
      const liveProduct =
        item.productType === 'cake'
          ? cakeMenu.find((c) => c.id === item.productId)
          : foodMenu.find((f) => f.id === item.productId);
      if (!liveProduct) return false;
      const meta = getInventoryStatusMeta(liveProduct, { isCake: item.productType === 'cake' });
      const totalForProd = getCartQuantityForProduct(cart, item.productType, item.productId);
      const maxForProd = getMaxOrderableForProduct(liveProduct, {
        isCake: item.productType === 'cake',
      });
      return !meta.orderable || totalForProd > maxForProd;
    });

  return (
    <div className="md:hidden px-3.5 pt-4 pb-8 space-y-5">
      <StockNoticeBanner compact />
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Your Cart</h1>
          {isCustomerAuthenticated ? (
            <p className="text-xs text-zinc-500 mt-0.5 truncate">
              {customerName || 'Customer'} · <span className="font-mono">{verifiedPhone}</span>
            </p>
          ) : (
            <p className="text-xs text-zinc-500 mt-0.5">Review items &amp; apply coupons</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/menu"
            className="min-h-[36px] px-3 py-1.5 bg-white border border-zinc-300 text-xs font-semibold text-zinc-800 rounded-lg inline-flex items-center"
          >
            + Food
          </Link>
          <Link
            to="/cakes"
            className="min-h-[36px] px-3 py-1.5 bg-white border border-zinc-300 text-xs font-semibold text-zinc-800 rounded-lg inline-flex items-center"
          >
            + Cakes
          </Link>
        </div>
      </div>

      {cart.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center space-y-4">
          <ShoppingBag className="w-10 h-10 text-zinc-400 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-zinc-900">Your cart is empty.</h2>
            <p className="text-xs text-zinc-600">
              Explore freshly prepared dishes on our Food Menu or visit the Cakes page.
            </p>
          </div>
          <div className="pt-1 flex flex-col gap-2.5">
            <Link
              to="/menu"
              className="w-full min-h-[46px] bg-[#E88D14] text-black text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2"
            >
              <span>EXPLORE MENU</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/cakes"
              className="w-full min-h-[44px] bg-zinc-100 text-zinc-900 text-xs font-semibold rounded-xl inline-flex items-center justify-center"
            >
              Browse Cakes
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Single-column item cards */}
          <div className="space-y-2.5">
            {cart.map((item) => {
              const liveProduct =
                item.productType === 'cake'
                  ? cakeMenu.find((c) => c.id === item.productId)
                  : foodMenu.find((f) => f.id === item.productId);
              const stockMeta = liveProduct
                ? getInventoryStatusMeta(liveProduct, { isCake: item.productType === 'cake' })
                : null;
              const stockNorm = liveProduct
                ? normalizeInventoryFields(liveProduct, { isCake: item.productType === 'cake' })
                : null;
              const maxAllowedForLine = liveProduct
                ? getRemainingAddableQuantity(cart, liveProduct, item.productType, item.cartKey)
                : Number.POSITIVE_INFINITY;
              const authenticFallback =
                item.productType === 'cake'
                  ? getCakeAuthenticDefaultImage(item.productId, item.name)
                  : getDishAuthenticDefaultImage(item.productId, item.name, '') || undefined;
              const resolvedCartImg = liveProduct?.imageUrl || authenticFallback || item.imageUrl;
              return (
              <div
                key={item.cartKey}
                className="bg-white border border-zinc-200 rounded-xl p-3 flex items-start gap-3"
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 shrink-0">
                  <FoodImage
                    src={resolvedCartImg}
                    fallbackSrc={authenticFallback}
                    alt={item.name}
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-zinc-900 leading-snug">
                        {item.name}
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {item.quantityLabel}
                        {item.selectedFlavour ? ` · ${item.selectedFlavour}` : ''}
                      </p>
                      <p className="text-xs font-mono tabular-nums text-zinc-500">
                        {formatRupees(item.originalPrice)} / unit
                      </p>
                      {stockMeta && stockNorm?.stockMode === 'limited' && (
                        <p
                          className={`text-[11px] font-semibold mt-0.5 ${
                            !stockMeta.orderable
                              ? 'text-red-600'
                              : item.quantity >= maxAllowedForLine
                              ? 'text-amber-800'
                              : stockMeta.code === 'LOW_STOCK'
                              ? 'text-amber-700'
                              : 'text-zinc-500'
                          }`}
                        >
                          {!stockMeta.orderable
                            ? stockMeta.customerBadge
                            : item.quantity >= maxAllowedForLine
                            ? `Max available (${stockNorm.stockQuantity} ${stockNorm.stockUnit.toLowerCase()})`
                            : stockMeta.customerWarning || stockMeta.customerBadge}
                        </p>
                      )}
                      {stockMeta && !stockMeta.orderable && stockNorm?.stockMode !== 'limited' && (
                        <p className="text-[11px] font-semibold text-red-600 mt-0.5">
                          {stockMeta.customerBadge}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.cartKey)}
                      aria-label={`Remove ${item.name}`}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-400 active:text-red-600 -mr-1 -mt-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-zinc-50">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.cartKey, item.quantity - 1)}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-800"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2.5 text-xs font-mono tabular-nums font-bold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={!stockMeta?.orderable || item.quantity >= maxAllowedForLine}
                        onClick={() => updateCartQuantity(item.cartKey, item.quantity + 1)}
                        aria-label={`Increase quantity of ${item.name}`}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-800 disabled:opacity-35"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="text-sm font-bold font-mono tabular-nums text-zinc-900">
                      {formatRupees(item.originalPrice * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {/* Coupon Box */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#D97706]" />
              <h2 className="text-sm font-bold text-zinc-900">Apply Coupon Code</h2>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => onCouponInputChange(sanitizeCouponCode(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onApplyCoupon();
                  }
                }}
                placeholder="Type coupon code"
                aria-label="Coupon code"
                className="flex-1 min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base font-mono uppercase focus:outline-none focus:border-[#E88D14]"
              />
              <button
                type="button"
                disabled={checkingCoupon}
                onClick={onApplyCoupon}
                className="min-h-[44px] px-4 py-2 bg-[#0A0A0B] text-white text-xs font-bold rounded-lg active:bg-[#E88D14] active:text-black transition-colors whitespace-nowrap disabled:opacity-60"
              >
                {checkingCoupon ? 'Checking...' : 'Apply'}
              </button>
            </div>
            {couponMessage && (
              <p
                className={`text-xs font-medium ${
                  couponMessage.type === 'ok' ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {couponMessage.text}
              </p>
            )}
            {appliedCoupon && (
              <div className="flex items-center justify-between gap-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2 rounded-lg">
                <div className="min-w-0">
                  <p className="font-mono font-semibold truncate">
                    {appliedCoupon.code} ·{' '}
                    {appliedCoupon.discountType === 'percentage'
                      ? `${appliedCoupon.discountValue}% off`
                      : `${formatRupees(appliedCoupon.discountValue)} off`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onRemoveCoupon}
                  className="underline font-semibold shrink-0 min-h-[32px] px-1"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Price Summary */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-4">
            <h2 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-2.5">
              Price Summary
            </h2>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-zinc-900 font-semibold">
                <span>Item Subtotal ({breakdown.totalItemsCount} items)</span>
                <span className="font-mono tabular-nums">
                  {formatRupees(breakdown.effectiveSubtotal)}
                </span>
              </div>

              {appliedCoupon && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>
                    Coupon ({appliedCoupon.code})
                    {appliedCoupon.minOrderAmount > 0 && breakdown.couponDiscount === 0
                      ? ` · Min ${formatRupees(appliedCoupon.minOrderAmount)}`
                      : ''}
                  </span>
                  <span className="font-mono tabular-nums">
                    {breakdown.couponDiscount > 0
                      ? `−${formatRupees(breakdown.couponDiscount)}`
                      : '₹0'}
                  </span>
                </div>
              )}

              {breakdown.appliedCharges.map((charge) => (
                <div key={charge.id} className="flex justify-between text-zinc-600 text-xs gap-2">
                  <span>
                    {charge.name}
                    {charge.type === 'percentage' ? ` (${charge.rate}%)` : ''}
                    {charge.appliesOn === 'delivery_only' ? ' (₹0 on collection)' : ''}
                  </span>
                  {charge.isFree ? (
                    <span className="font-mono font-bold text-emerald-700">FREE (₹0)</span>
                  ) : (
                    <span className="font-mono tabular-nums text-zinc-900">
                      {formatRupees(charge.calculatedAmount)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-zinc-200 flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-900">Estimated Total (Delivery)</span>
              <span className="text-lg font-bold font-mono tabular-nums text-zinc-900">
                {formatRupees(breakdown.finalAmount)}
              </span>
            </div>

            <p className="text-[11px] text-zinc-500">
              Standard preparation time: {settings.defaultPrepMinutes} minutes.
            </p>

            {hasStockConflict ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-red-700">
                  Update unavailable/sold-out items before proceeding to checkout.
                </p>
                <button
                  type="button"
                  disabled
                  className="w-full min-h-[48px] py-3 px-4 bg-zinc-300 text-zinc-600 font-bold text-sm rounded-xl cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>CHECKOUT UNAVAILABLE</span>
                </button>
              </div>
            ) : (
              <Link
                to="/checkout"
                className="w-full min-h-[48px] py-3 px-4 bg-[#E88D14] text-black font-bold text-sm rounded-xl active:bg-[#f39c25] transition-colors flex items-center justify-center gap-2"
              >
                <span>PROCEED TO CHECKOUT</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
