import { useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2 } from 'lucide-react';
import { BrandLogo, FoodImage } from '../components/BrandLogo';
import { StockNoticeBanner } from '../components/StockNoticeBanner';
import { MobileCartView } from '../components/mobile/MobileCartView';
import { useApp } from '../context/AppContext';
import {
  BRAND_NAME,
  getCakeAuthenticDefaultImage,
  getDishAuthenticDefaultImage,
} from '../data/catalog';
import { db } from '../lib/firebase';
import {
  getCartQuantityForProduct,
  getInventoryStatusMeta,
  getMaxOrderableForProduct,
  getRemainingAddableQuantity,
  normalizeInventoryFields,
} from '../lib/inventory';
import {
  calculatePriceBreakdown,
  formatRupees,
  sanitizeCouponCode,
  validateCouponForSubtotal,
} from '../lib/pricing';
import type { CouponRecord } from '../types';

export function CartPage() {
  const {
    cart,
    foodMenu,
    cakeMenu,
    updateCartQuantity,
    removeFromCart,
    appliedCoupon,
    setAppliedCoupon,
    settings,
    checkoutCharges,
    isCustomerAuthenticated,
    customerName,
    verifiedPhone,
  } = useApp();

  const [couponInput, setCouponInput] = useState('');
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [couponMessage, setCouponMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

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

  const handleApplyCoupon = async () => {
    setCouponMessage(null);
    const code = sanitizeCouponCode(couponInput);
    if (code.length < 2) {
      setCouponMessage({ type: 'err', text: 'Enter a valid coupon code (at least 2 characters).' });
      return;
    }

    setCheckingCoupon(true);
    try {
      const couponRef = doc(db, 'coupons', code);
      let snap;
      try {
        snap = await getDocFromServer(couponRef);
      } catch {
        snap = await getDoc(couponRef);
      }
      if (!snap.exists()) {
        setCouponMessage({ type: 'err', text: `Coupon "${code}" was not found.` });
        return;
      }
      const coupon = snap.data() as CouponRecord;
      const check = validateCouponForSubtotal(coupon, breakdown.effectiveSubtotal);
      if (!check.valid) {
        setCouponMessage({ type: 'err', text: check.reason });
        return;
      }

      setAppliedCoupon(coupon);
      const usesText =
        coupon.usageLimit === 0
          ? `Used ${coupon.usedCount} times · Unlimited uses`
          : `Used ${coupon.usedCount} of ${coupon.usageLimit} times · ${Math.max(0, coupon.usageLimit - coupon.usedCount)} times left`;
      setCouponMessage({
        type: 'ok',
        text: `Coupon ${coupon.code} applied! (${usesText})`,
      });
    } catch (err) {
      setCouponMessage({
        type: 'err',
        text: err instanceof Error ? `Unable to check coupon: ${err.message}` : 'Unable to check coupon right now.',
      });
    } finally {
      setCheckingCoupon(false);
    }
  };

  return (
    <>
      <MobileCartView
        couponInput={couponInput}
        onCouponInputChange={setCouponInput}
        checkingCoupon={checkingCoupon}
        couponMessage={couponMessage}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={() => {
          setAppliedCoupon(null);
          setCouponInput('');
          setCouponMessage(null);
        }}
        appliedCoupon={appliedCoupon}
      />
      <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200">
        <div className="flex items-center gap-4">
          <BrandLogo className="h-14 w-auto rounded-lg" />
          <div>
            <p className="text-xs font-medium tracking-widest text-[#D97706]">{BRAND_NAME}</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              Your Order Cart
            </h1>
            {isCustomerAuthenticated && (
              <p className="text-xs text-zinc-600 mt-0.5">
                Customer: <strong className="text-zinc-900">{customerName || 'Customer'}</strong> ·{' '}
                <span className="font-mono">{verifiedPhone}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/menu"
            className="px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-300 rounded-lg hover:border-zinc-500"
          >
            Add Food Items
          </Link>
          <Link
            to="/cakes"
            className="px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-300 rounded-lg hover:border-zinc-500"
          >
            Add Cakes
          </Link>
        </div>
      </div>

      <StockNoticeBanner />

      {cart.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-4">
          <ShoppingBag className="w-10 h-10 text-zinc-400 mx-auto" />
          <h2 className="text-xl font-semibold text-zinc-900">Your cart is empty</h2>
          <p className="text-sm text-zinc-600 max-w-md mx-auto">
            Browse our freshly prepared Food Menu or visit our separate Cakes page to add Bento Cakes and Cake Sicles.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Link
              to="/menu"
              className="px-5 py-2.5 bg-[#0A0A0B] text-white text-sm font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black transition-colors"
            >
              Browse Food Menu
            </Link>
            <Link
              to="/cakes"
              className="px-5 py-2.5 bg-zinc-100 text-zinc-900 text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Browse Cakes
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Cart Items */}
          <div className="lg:col-span-7 space-y-4">
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
                  className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-zinc-100 shrink-0">
                      <FoodImage
                        src={resolvedCartImg}
                        fallbackSrc={authenticFallback}
                        alt={item.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-base font-semibold text-zinc-900">{item.name}</h2>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span>{item.quantityLabel}</span>
                        {item.selectedFlavour && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-zinc-800">
                              Flavour: {item.selectedFlavour}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-zinc-600 pt-0.5">
                        {formatRupees(item.originalPrice)} / unit
                      </div>
                      {stockMeta && stockNorm?.stockMode === 'limited' && (
                        <p
                          className={`text-[11px] font-semibold ${
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
                            ? `Max available stock reached (${stockNorm.stockQuantity} ${stockNorm.stockUnit.toLowerCase()})`
                            : stockMeta.customerWarning || stockMeta.customerBadge}
                        </p>
                      )}
                      {stockMeta && !stockMeta.orderable && stockNorm?.stockMode !== 'limited' && (
                        <p className="text-[11px] font-semibold text-red-600">
                          {stockMeta.customerBadge}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                    <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-zinc-50">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.cartKey, item.quantity - 1)}
                        className="p-2 text-zinc-700 hover:text-black"
                        aria-label={`Decrease quantity of ${item.name}`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-3 text-sm font-mono tabular-nums font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={!stockMeta?.orderable || item.quantity >= maxAllowedForLine}
                        onClick={() => updateCartQuantity(item.cartKey, item.quantity + 1)}
                        className="p-2 text-zinc-700 hover:text-black disabled:opacity-35 disabled:cursor-not-allowed"
                        aria-label={`Increase quantity of ${item.name}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-right min-w-[72px]">
                      <p className="text-sm font-bold font-mono tabular-nums text-zinc-900">
                        {formatRupees(item.originalPrice * item.quantity)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.cartKey)}
                      className="p-2 text-zinc-400 hover:text-red-600 transition-colors"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary Panel + Small Coupon Box */}
          <div className="lg:col-span-5 space-y-5">
            {/* Small Coupon Code Box */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-2.5">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#D97706]" />
                <h2 className="text-sm font-bold text-zinc-900">Have a Coupon Code?</h2>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(sanitizeCouponCode(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyCoupon();
                    }
                  }}
                  placeholder="Type coupon code"
                  aria-label="Coupon code"
                  className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:border-[#E88D14]"
                />
                <button
                  type="button"
                  disabled={checkingCoupon}
                  onClick={handleApplyCoupon}
                  className="px-4 py-2 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black transition-colors whitespace-nowrap disabled:opacity-60"
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
                  <div>
                    <p className="font-mono font-semibold">
                      {appliedCoupon.code} ·{' '}
                      {appliedCoupon.discountType === 'percentage'
                        ? `${appliedCoupon.discountValue}% off`
                        : `${formatRupees(appliedCoupon.discountValue)} off`}
                    </p>
                    <p className="text-[11px] text-emerald-800">
                      {appliedCoupon.usageLimit === 0
                        ? `Used ${appliedCoupon.usedCount} times · Unlimited uses`
                        : `Used ${appliedCoupon.usedCount} of ${appliedCoupon.usageLimit} times (${Math.max(0, appliedCoupon.usageLimit - appliedCoupon.usedCount)} times left)`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponInput('');
                      setCouponMessage(null);
                    }}
                    className="underline font-semibold shrink-0"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
              <h2 className="text-lg font-bold text-zinc-900 border-b border-zinc-100 pb-3">
                Price Summary
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-zinc-900 font-semibold">
                  <span>Item Subtotal ({breakdown.totalItemsCount} items)</span>
                  <span className="font-mono tabular-nums">
                    {formatRupees(breakdown.effectiveSubtotal)}
                  </span>
                </div>

                {appliedCoupon && (
                  <div className="flex justify-between items-center text-emerald-700 font-medium">
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
                  <div key={charge.id} className="flex justify-between text-zinc-600 gap-2">
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

              <div className="pt-4 border-t border-zinc-200 flex items-center justify-between">
                <span className="text-base font-bold text-zinc-900">Estimated Total (Delivery)</span>
                <span className="text-xl font-bold font-mono tabular-nums text-zinc-900">
                  {formatRupees(breakdown.finalAmount)}
                </span>
              </div>

              <p className="text-xs text-zinc-500">
                No minimum order threshold. Standard preparation time: {settings.defaultPrepMinutes} minutes.
              </p>

              {hasStockConflict ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-red-700">
                    Update unavailable/sold-out items before proceeding to checkout.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="w-full py-3.5 px-5 bg-zinc-300 text-zinc-600 font-semibold text-sm rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <span>Checkout Unavailable</span>
                  </button>
                </div>
              ) : (
                <Link
                  to="/checkout"
                  className="w-full py-3.5 px-5 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors flex items-center justify-center gap-2"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
