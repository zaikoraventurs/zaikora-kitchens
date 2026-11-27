import {
  AUTO_DISCOUNT_PER_ITEM,
  PARTY_CAKE_WHATSAPP_MESSAGE,
  buildFallbackCheckoutCharges,
  normalizeCheckoutCharge,
} from '../data/catalog.ts';
import type {
  AppliedOrderCharge,
  CartItem,
  CheckoutChargeRecord,
  CouponRecord,
  FulfillmentType,
  RestaurantSettings,
} from '../types/index.ts';

export function getDisplayedPrice(originalPrice: number, eligibleForAutoDiscount: boolean): number {
  const base = Math.round(originalPrice);
  return eligibleForAutoDiscount ? base + AUTO_DISCOUNT_PER_ITEM : base;
}

export interface CheckoutChargesSummary {
  appliedCharges: AppliedOrderCharge[];
  deliveryCharge: number;
  handlingCharge: number;
  additionalChargesTotal: number;
  chargesTotal: number;
}

export interface PriceBreakdown {
  displayedSubtotal: number;
  autoDiscountTotal: number;
  effectiveSubtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  handlingCharge: number;
  additionalChargesTotal: number;
  chargesTotal: number;
  appliedCharges: AppliedOrderCharge[];
  finalAmount: number;
  totalEligibleUnits: number;
  totalItemsCount: number;
}

export function sanitizeCouponCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32);
}

export function formatRupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    const parsed = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    typeof (value as { seconds: unknown }).seconds === 'number'
  ) {
    const parsed = new Date((value as { seconds: number }).seconds * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export type CouponValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateCouponForSubtotal(
  coupon: CouponRecord | null,
  effectiveSubtotal: number,
  now: Date = new Date()
): CouponValidationResult {
  if (!coupon) {
    return { valid: false, reason: 'No coupon selected.' };
  }
  if (!coupon.active) {
    return { valid: false, reason: 'This coupon is currently inactive.' };
  }
  if (!Number.isFinite(coupon.discountValue) || coupon.discountValue <= 0) {
    return { valid: false, reason: 'This coupon has an invalid discount value.' };
  }
  if (coupon.discountType === 'percentage' && coupon.discountValue > 100) {
    return { valid: false, reason: 'This percentage coupon exceeds 100%.' };
  }
  const from = toDateSafe(coupon.validFrom);
  const until = toDateSafe(coupon.validUntil);
  if (from && now < from) {
    return { valid: false, reason: 'This coupon is not valid yet.' };
  }
  if (until && now > until) {
    return { valid: false, reason: 'This coupon has expired.' };
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return {
      valid: false,
      reason: `This coupon has already been used ${coupon.usedCount} of ${coupon.usageLimit} times.`,
    };
  }
  if (coupon.minOrderAmount > 0 && effectiveSubtotal < coupon.minOrderAmount) {
    return {
      valid: false,
      reason: `Minimum order value for this coupon is ${formatRupees(coupon.minOrderAmount)} (current menu subtotal: ${formatRupees(effectiveSubtotal)}).`,
    };
  }
  return { valid: true };
}

export function computeCouponDiscount(
  effectiveSubtotal: number,
  coupon: CouponRecord | null,
  now: Date = new Date()
): number {
  if (!coupon || effectiveSubtotal <= 0) {
    return 0;
  }
  const check = validateCouponForSubtotal(coupon, effectiveSubtotal, now);
  if (!check.valid) {
    return 0;
  }
  let discount = 0;
  if (coupon.discountType === 'percentage') {
    const pct = Math.min(100, Math.max(0, coupon.discountValue));
    discount = Math.round((effectiveSubtotal * pct) / 100);
  } else {
    discount = Math.round(coupon.discountValue);
  }
  return Math.max(0, Math.min(discount, effectiveSubtotal));
}

export function computeCheckoutChargesSummary(params: {
  effectiveSubtotal: number;
  couponDiscount: number;
  fulfillmentType: FulfillmentType;
  checkoutCharges?: CheckoutChargeRecord[] | null;
  settings?: Partial<RestaurantSettings>;
  chargesConfigured?: boolean;
}): CheckoutChargesSummary {
  const {
    effectiveSubtotal,
    couponDiscount,
    fulfillmentType,
    checkoutCharges,
    settings,
    chargesConfigured,
  } = params;

  const isConfigured =
    Boolean(chargesConfigured) || Boolean(settings?.checkoutChargesConfigured);

  const normalizedInput = Array.isArray(checkoutCharges)
    ? checkoutCharges
        .map((c, idx) => normalizeCheckoutCharge(c, idx + 1))
        .filter((c): c is CheckoutChargeRecord => c !== null)
    : [];

  const sourceList =
    normalizedInput.length > 0 || isConfigured
      ? normalizedInput
      : buildFallbackCheckoutCharges(settings);

  const sortedCharges = [...sourceList].sort((a, b) => a.displayOrder - b.displayOrder);
  const netOrderSubtotal = Math.max(0, Math.round(effectiveSubtotal) - Math.round(couponDiscount));

  const appliedCharges: AppliedOrderCharge[] = [];
  let deliveryCharge = 0;
  let handlingCharge = 0;
  let additionalChargesTotal = 0;

  for (const charge of sortedCharges) {
    if (!charge.enabled) continue;
    if (charge.appliesOn === 'delivery_only' && fulfillmentType !== 'delivery') {
      continue;
    }

    const calculatedAmount =
      charge.type === 'percentage'
        ? effectiveSubtotal > 0
          ? Math.max(0, Math.round((netOrderSubtotal * charge.amount) / 100))
          : 0
        : Math.max(0, Math.round(charge.amount));

    const entry: AppliedOrderCharge = {
      id: charge.id,
      name: charge.name,
      type: charge.type,
      appliesOn: charge.appliesOn,
      rate: charge.amount,
      calculatedAmount,
      isFree: calculatedAmount === 0,
    };

    appliedCharges.push(entry);

    if (charge.id === 'delivery') {
      deliveryCharge += calculatedAmount;
    } else if (charge.id === 'handling') {
      handlingCharge += calculatedAmount;
    } else {
      additionalChargesTotal += calculatedAmount;
    }
  }

  return {
    appliedCharges,
    deliveryCharge,
    handlingCharge,
    additionalChargesTotal,
    chargesTotal: deliveryCharge + handlingCharge + additionalChargesTotal,
  };
}

export function calculatePriceBreakdown(
  items: CartItem[],
  coupon: CouponRecord | null,
  fulfillmentType: FulfillmentType,
  settings?: RestaurantSettings,
  checkoutCharges?: CheckoutChargeRecord[] | null
): PriceBreakdown {
  const autoDiscountUnit = settings?.autoDiscountPerItem ?? AUTO_DISCOUNT_PER_ITEM;

  let displayedSubtotal = 0;
  let autoDiscountTotal = 0;
  let effectiveSubtotal = 0;
  let totalEligibleUnits = 0;
  let totalItemsCount = 0;

  for (const item of items) {
    const qty = Math.max(1, Math.round(item.quantity));
    const original = Math.round(item.originalPrice);
    const unitAutoDiscount = item.eligibleForAutoDiscount ? autoDiscountUnit : 0;
    const unitDisplayed = original + unitAutoDiscount;

    displayedSubtotal += unitDisplayed * qty;
    autoDiscountTotal += unitAutoDiscount * qty;
    effectiveSubtotal += original * qty;
    if (item.eligibleForAutoDiscount) {
      totalEligibleUnits += qty;
    }
    totalItemsCount += qty;
  }

  const couponDiscount = computeCouponDiscount(effectiveSubtotal, coupon);
  const chargeSummary =
    items.length > 0
      ? computeCheckoutChargesSummary({
          effectiveSubtotal,
          couponDiscount,
          fulfillmentType,
          checkoutCharges,
          settings,
        })
      : {
          appliedCharges: [],
          deliveryCharge: 0,
          handlingCharge: 0,
          additionalChargesTotal: 0,
          chargesTotal: 0,
        };

  const finalAmount = Math.max(
    items.length > 0 ? 1 : 0,
    effectiveSubtotal - couponDiscount + chargeSummary.chargesTotal
  );

  return {
    displayedSubtotal,
    autoDiscountTotal,
    effectiveSubtotal,
    couponDiscount,
    deliveryCharge: chargeSummary.deliveryCharge,
    handlingCharge: chargeSummary.handlingCharge,
    additionalChargesTotal: chargeSummary.additionalChargesTotal,
    chargesTotal: chargeSummary.chargesTotal,
    appliedCharges: chargeSummary.appliedCharges,
    finalAmount,
    totalEligibleUnits,
    totalItemsCount,
  };
}

export function buildPartyCakeWhatsAppUrl(whatsappNumber: string): string | null {
  const digits = whatsappNumber.replace(/\D/g, '');
  if (digits.length < 10) {
    return null;
  }
  const formatted = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${formatted}?text=${encodeURIComponent(PARTY_CAKE_WHATSAPP_MESSAGE)}`;
}

export function formatDateTime(value: unknown): string {
  const date = toDateSafe(value);
  if (!date) return 'Just now';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
