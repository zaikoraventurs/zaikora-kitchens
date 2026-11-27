import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Minus,
  Plus,
  ShieldCheck,
  Tag,
  Trash2,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { StockNoticeBanner } from '../components/StockNoticeBanner';
import { MobileCheckoutView } from '../components/mobile/MobileCheckoutView';
import { useApp } from '../context/AppContext';
import {
  BRAND_NAME,
  COLLECTION_NOTICE,
  DEFAULT_SETTINGS,
  DELIVERY_RULES,
  normalizeCheckoutCharge,
} from '../data/catalog';
import { buildUnexpectedApiResponseError, parseApiResponse } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
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
import type {
  CheckoutChargeRecord,
  CommunityType,
  CouponRecord,
  FulfillmentType,
  RestaurantSettings,
} from '../types';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (res: { error?: { description?: string } }) => void) => void;
    };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const CHECKOUT_IDEMPOTENCY_STORAGE_KEY = 'zaikora_checkout_idempotency_v1';

function getOrCreateCheckoutIdempotencyKey(signature: string): string {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { signature?: string; key?: string };
      if (parsed.signature === signature && parsed.key && /^[a-zA-Z0-9_-]{8,128}$/.test(parsed.key)) {
        return parsed.key;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  const freshKey = `idk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    window.sessionStorage.setItem(
      CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
      JSON.stringify({ signature, key: freshKey })
    );
  } catch {
    // Ignore storage write errors
  }
  return freshKey;
}

function clearStoredCheckoutIdempotencyKey(): void {
  try {
    window.sessionStorage.removeItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY);
  } catch {
    // Ignore storage clear errors
  }
}

async function solveCheckoutChallenge(challenge: {
  challengeId: string;
  nonce: string;
  prefix: string;
}): Promise<string> {
  const encoder = new TextEncoder();
  const subtle = window.crypto?.subtle;
  if (!subtle) return '0';
  for (let i = 0; i < 200000; i += 1) {
    const sol = String(i);
    const digestBuf = await subtle.digest('SHA-256', encoder.encode(`${challenge.nonce}:${sol}`));
    const bytes = new Uint8Array(digestBuf);
    let hex = '';
    for (let j = 0; j < bytes.length; j += 1) {
      hex += bytes[j].toString(16).padStart(2, '0');
    }
    if (hex.startsWith(challenge.prefix)) {
      return sol;
    }
  }
  return '0';
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const {
    user,
    verifiedPhone,
    isCustomerAuthenticated,
    customerProfile,
    addresses,
    cart,
    updateCartQuantity,
    removeFromCart,
    appliedCoupon,
    setAppliedCoupon,
    clearCart,
    settings,
    checkoutCharges,
    foodMenu,
    cakeMenu,
    serverConfig,
    getApiAuthHeaders,
  } = useApp();

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [community, setCommunity] = useState<CommunityType>('brigade_eldorado');
  const [apartmentName, setApartmentName] = useState('Brigade Eldorado');
  const [blockOrTower, setBlockOrTower] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [landmark, setLandmark] = useState('');
  const [saveAddressForFuture, setSaveAddressForFuture] = useState(true);
  const [deliveryRuleAck, setDeliveryRuleAck] = useState(false);

  const [couponInput, setCouponInput] = useState(appliedCoupon?.code || '');
  const [couponMessage, setCouponMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  useEffect(() => {
    if (appliedCoupon?.code && !couponInput) {
      setCouponInput(appliedCoupon.code);
    }
  }, [appliedCoupon?.code, couponInput]);

  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [paymentWarning, setPaymentWarning] = useState<{
    orderId: string;
    message: string;
  } | null>(null);

  const lastSyncedNameRef = useRef('');
  const lastSyncedPhoneRef = useRef('');

  useEffect(() => {
    const profileName = customerProfile?.name || '';
    const profilePhone = verifiedPhone || customerProfile?.phone || '';
    if (profileName && (!customerName || customerName === lastSyncedNameRef.current)) {
      setCustomerName(profileName);
      lastSyncedNameRef.current = profileName;
    }
    if (profilePhone && (!customerPhone || customerPhone === lastSyncedPhoneRef.current)) {
      setCustomerPhone(profilePhone);
      lastSyncedPhoneRef.current = profilePhone;
    }
  }, [customerProfile, verifiedPhone, customerName, customerPhone]);

  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const def = addresses.find((a) => a.isDefault) || addresses[0];
      setSelectedAddressId(def.id);
    }
  }, [addresses, selectedAddressId]);

  const breakdown = calculatePriceBreakdown(
    cart,
    appliedCoupon,
    fulfillmentType,
    settings,
    checkoutCharges
  );

  const deliveryOnlyActiveCharges = checkoutCharges.filter(
    (c) => c.enabled && c.appliesOn === 'delivery_only'
  );
  const deliverySubtitle =
    deliveryOnlyActiveCharges.length === 0
      ? 'No extra delivery fee'
      : deliveryOnlyActiveCharges.every((c) => Number(c.amount) === 0)
        ? 'Delivery charge: FREE (₹0)'
        : `Delivery charge: ${deliveryOnlyActiveCharges
            .map((c) => (c.type === 'percentage' ? `${c.amount}%` : formatRupees(c.amount)))
            .join(' + ')}`;

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
      setCouponMessage({ type: 'ok', text: `Coupon ${coupon.code} applied. (${usesText})` });
    } catch (err) {
      setCouponMessage({
        type: 'err',
        text: err instanceof Error ? `Unable to check coupon: ${err.message}` : 'Unable to check coupon right now.',
      });
    } finally {
      setCheckingCoupon(false);
    }
  };

  const stockConflicts = React.useMemo(() => {
    const conflicts: string[] = [];
    if (!settings.isAcceptingOrders) {
      conflicts.push('ZAIKORA KITCHENS is currently closed and not accepting new orders.');
    }
    const seen = new Set<string>();
    for (const item of cart) {
      const isCake = item.productType === 'cake';
      const liveItem = isCake
        ? cakeMenu.find((c) => c.id === item.productId)
        : foodMenu.find((f) => f.id === item.productId);
      if (!liveItem) continue;
      const pKey = `${item.productType}:${item.productId}`;
      const meta = getInventoryStatusMeta(liveItem, { isCake });
      const norm = normalizeInventoryFields(liveItem, { isCake });
      if (!meta.orderable) {
        if (!seen.has(pKey)) {
          conflicts.push(
            `"${item.name}" is ${meta.code === 'SOLD_OUT' ? 'SOLD OUT' : 'currently unavailable'}.`
          );
          seen.add(pKey);
        }
        continue;
      }
      const maxAllowed = getMaxOrderableForProduct(liveItem, { isCake });
      const totalInCart = getCartQuantityForProduct(cart, item.productType, item.productId);
      if (Number.isFinite(maxAllowed) && totalInCart > maxAllowed) {
        if (!seen.has(pKey)) {
          conflicts.push(
            `Only ${maxAllowed} ${norm.stockUnit.toLowerCase()} remaining for "${item.name}" (you have ${totalInCart} in cart).`
          );
          seen.add(pKey);
        }
      }
    }
    return conflicts;
  }, [cart, cakeMenu, foodMenu, settings.isAcceptingOrders]);

  const hasStockConflict = stockConflicts.length > 0;

  const handlePlaceAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setCheckoutError('');
    setPaymentWarning(null);

    if (!user || !isCustomerAuthenticated) {
      navigate('/login?redirect=/checkout');
      return;
    }
    if (cart.length === 0) {
      setCheckoutError('Your cart is empty.');
      return;
    }
    if (!settings.isAcceptingOrders) {
      setCheckoutError('ZAIKORA KITCHENS is currently not accepting new orders.');
      return;
    }
    if (hasStockConflict) {
      setCheckoutError(
        stockConflicts[0] ||
          'One or more items in your cart exceed available stock. Please update your cart.'
      );
      return;
    }

    const cleanName = customerName.trim();
    const cleanPhone = (customerPhone || verifiedPhone || '').trim();
    if (!cleanName || cleanPhone.length < 10) {
      setCheckoutError('Please provide your name and valid +91 mobile number.');
      return;
    }

    let deliveryCommunity: 'brigade_eldorado' | 'outside_eldorado' | 'collection_gate' =
      'collection_gate';
    let deliveryAddressSummary = COLLECTION_NOTICE;

    if (fulfillmentType === 'delivery') {
      if (selectedAddressId && selectedAddressId !== 'new') {
        const addr = addresses.find((a) => a.id === selectedAddressId);
        if (!addr) {
          setCheckoutError('Please select a valid saved address or enter a new address.');
          return;
        }
        deliveryCommunity = addr.community;
        deliveryAddressSummary = [
          addr.label,
          addr.apartmentName,
          addr.blockOrTower,
          addr.flatNumber,
          addr.landmark,
          addr.community === 'outside_eldorado'
            ? '(Main Gate Delivery Only)'
            : '(Within Brigade Eldorado)',
        ]
          .filter(Boolean)
          .join(', ')
          .slice(0, 350);
      } else {
        if (!apartmentName.trim()) {
          setCheckoutError('Please enter your apartment or building name.');
          return;
        }
        deliveryCommunity = community;
        deliveryAddressSummary = [
          apartmentName.trim(),
          blockOrTower.trim(),
          flatNumber.trim(),
          landmark.trim(),
          community === 'outside_eldorado'
            ? '(Main Gate Delivery Only)'
            : '(Within Brigade Eldorado)',
        ]
          .filter(Boolean)
          .join(', ')
          .slice(0, 350);
      }
    }

    if (!deliveryRuleAck) {
      setCheckoutError('Please acknowledge the delivery and collection rules before proceeding.');
      return;
    }

    setSubmitting(true);

    try {
      // Re-verify applied coupon right before creating order (active, dates, usageLimit, minOrderAmount, latest discount value)
      let verifiedCoupon: CouponRecord | null = null;
      if (appliedCoupon) {
        const couponRef = doc(db, 'coupons', appliedCoupon.code);
        let freshSnap;
        try {
          freshSnap = await getDocFromServer(couponRef);
        } catch {
          freshSnap = await getDoc(couponRef);
        }
        if (!freshSnap.exists()) {
          setAppliedCoupon(null);
          setCheckoutError(
            `Coupon "${appliedCoupon.code}" is no longer available. Please review your order total.`
          );
          setSubmitting(false);
          return;
        }
        const fresh = freshSnap.data() as CouponRecord;
        const freshCheck = validateCouponForSubtotal(fresh, breakdown.effectiveSubtotal);
        if (!freshCheck.valid) {
          setAppliedCoupon(null);
          setCheckoutError(
            `Coupon "${appliedCoupon.code}" cannot be applied: ${freshCheck.reason}`
          );
          setSubmitting(false);
          return;
        }
        verifiedCoupon = fresh;
        setAppliedCoupon(fresh);
      }

      // Fetch latest server restaurant_settings & checkout_charges right before order creation
      let latestSettings: RestaurantSettings = settings;
      try {
        const sRef = doc(db, 'restaurant_settings', 'config');
        let sSnap;
        try {
          sSnap = await getDocFromServer(sRef);
        } catch {
          sSnap = await getDoc(sRef);
        }
        if (sSnap.exists()) {
          latestSettings = {
            ...DEFAULT_SETTINGS,
            ...(sSnap.data() as Partial<RestaurantSettings>),
          };
        }
      } catch {
        // Fallback cleanly to active snapshot settings
      }

      let latestCharges: CheckoutChargeRecord[] | undefined = checkoutCharges;
      try {
        const chargesRef = collection(db, 'checkout_charges');
        let chargesSnap;
        try {
          chargesSnap = await getDocsFromServer(chargesRef);
        } catch {
          chargesSnap = await getDocs(chargesRef);
        }
        if (chargesSnap.docs.length > 0 || latestSettings.checkoutChargesConfigured) {
          latestCharges = chargesSnap.docs
            .map((d, idx) =>
              normalizeCheckoutCharge(
                { ...(d.data() as Record<string, unknown>), id: d.id },
                idx + 1
              )
            )
            .filter((c): c is CheckoutChargeRecord => c !== null)
            .sort((a, b) => a.displayOrder - b.displayOrder);
        } else {
          latestCharges = undefined;
        }
      } catch {
        // Fallback to active snapshot charges
      }

      const finalBreakdown = calculatePriceBreakdown(
        cart,
        verifiedCoupon,
        fulfillmentType,
        latestSettings,
        latestCharges
      );

      const authHeaders = await getApiAuthHeaders();
      const checkoutSignature = JSON.stringify({
        uid: user.uid,
        fulfillmentType,
        deliveryAddressSummary,
        coupon: verifiedCoupon?.code || '',
        total: finalBreakdown.finalAmount,
        items: cart.map((c) => `${c.cartKey}:${c.quantity}`),
      });

      let idempotencyKey = getOrCreateCheckoutIdempotencyKey(checkoutSignature);
      const preparePayloadBase = {
        fulfillmentType,
        addressSummary: deliveryAddressSummary,
        totalItemCount: finalBreakdown.totalItemsCount,
        items: cart.map((c) => ({
          productId: c.productId,
          productType: c.productType,
          quantity: c.quantity,
          selectedFlavour: c.selectedFlavour,
        })),
      };

      // 1. Server-side idempotency, rate-limit / PoW challenge & suspicious-order review check
      const callPrepare = async (
        key: string,
        challengeArgs?: { challengeId: string; challengeSolution: string }
      ) => {
        const res = await fetch('/api/orders/prepare', {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders,
          body: JSON.stringify({
            idempotencyKey: key,
            ...preparePayloadBase,
            ...(challengeArgs || {}),
          }),
        });
        const parsed = await parseApiResponse<{
          ok?: boolean;
          idempotentReplay?: boolean;
          orderId?: string;
          paymentId?: string;
          status?: string;
          reviewFlagged?: boolean;
          reviewFlagReason?: string;
          suspiciousScore?: number;
          requiresChallenge?: boolean;
          challenge?: { challengeId: string; nonce: string; prefix: string };
          error?: string;
        }>(res);
        return { res, parsed };
      };

      let prep = await callPrepare(idempotencyKey);
      if (prep.res.status === 428 && prep.parsed.data?.requiresChallenge && prep.parsed.data?.challenge) {
        const solution = await solveCheckoutChallenge(prep.parsed.data.challenge);
        prep = await callPrepare(idempotencyKey, {
          challengeId: prep.parsed.data.challenge.challengeId,
          challengeSolution: solution,
        });
      }

      if (!prep.parsed.isJson || !prep.parsed.data) {
        setCheckoutError(
          buildUnexpectedApiResponseError(prep.res, 'Order verification server is unreachable')
        );
        setSubmitting(false);
        return;
      }
      if (!prep.res.ok || !prep.parsed.data.ok || !prep.parsed.data.orderId || !prep.parsed.data.paymentId) {
        setCheckoutError(prep.parsed.data.error || 'Unable to prepare your order.');
        setSubmitting(false);
        return;
      }

      let orderId = prep.parsed.data.orderId;
      let paymentId = prep.parsed.data.paymentId;
      let reviewMeta = {
        reviewFlagged: Boolean(prep.parsed.data.reviewFlagged),
        reviewFlagReason: prep.parsed.data.reviewFlagReason || '',
        suspiciousScore: Number(prep.parsed.data.suspiciousScore || 0),
      };

      // Check existing Firestore order if idempotent replay occurred
      let skipFirestoreCreate = false;
      if (prep.parsed.data.idempotentReplay) {
        try {
          const existingSnap = await getDoc(doc(db, 'orders', orderId));
          if (existingSnap.exists()) {
            const existingOrder = existingSnap.data() as {
              status?: string;
              paymentStatus?: string;
              paymentId?: string;
            };
            if (
              existingOrder.paymentStatus === 'successful' ||
              existingOrder.paymentStatus === 'verified'
            ) {
              clearStoredCheckoutIdempotencyKey();
              clearCart();
              navigate(`/track/${orderId}`);
              return;
            }
            if (
              existingOrder.paymentStatus === 'pending' &&
              existingOrder.status === 'PAYMENT PENDING'
            ) {
              skipFirestoreCreate = true;
              if (existingOrder.paymentId) {
                paymentId = existingOrder.paymentId;
              }
            } else {
              // Prior attempt ended in PAYMENT FAILED or closed state -> rotate idempotency key cleanly
              clearStoredCheckoutIdempotencyKey();
              idempotencyKey = getOrCreateCheckoutIdempotencyKey(`${checkoutSignature}:${Date.now()}`);
              const freshPrep = await callPrepare(idempotencyKey);
              if (
                freshPrep.res.ok &&
                freshPrep.parsed.data?.ok &&
                freshPrep.parsed.data.orderId &&
                freshPrep.parsed.data.paymentId
              ) {
                orderId = freshPrep.parsed.data.orderId;
                paymentId = freshPrep.parsed.data.paymentId;
                reviewMeta = {
                  reviewFlagged: Boolean(freshPrep.parsed.data.reviewFlagged),
                  reviewFlagReason: freshPrep.parsed.data.reviewFlagReason || '',
                  suspiciousScore: Number(freshPrep.parsed.data.suspiciousScore || 0),
                };
              }
            }
          }
        } catch {
          // Proceed carefully if lookup failed
        }
      }

      const nowStamp = Date.now();
      const customerEmail = (customerProfile?.email || user.email || '').trim().slice(0, 160);

      // 2. Atomic Firestore Draft Creation (PAYMENT PENDING, awaiting payment + kitchen approval)
      if (!skipFirestoreCreate) {
        const batch = writeBatch(db);
        const itemsPreview = cart
          .map((c) => `${c.quantity}x ${c.name}${c.selectedFlavour ? ` (${c.selectedFlavour})` : ''}`)
          .join(', ')
          .slice(0, 295);

        const orderDocData: Record<string, unknown> = {
          orderId,
          customerId: user.uid,
          customerName: cleanName.slice(0, 100),
          customerPhone: cleanPhone.slice(0, 20),
          idempotencyKey,
          fulfillmentType,
          deliveryCommunity,
          deliveryAddressSummary,
          deliveryRuleAcknowledged: true,
          displayedSubtotal: finalBreakdown.displayedSubtotal,
          autoDiscountTotal: finalBreakdown.autoDiscountTotal,
          couponDiscount: finalBreakdown.couponDiscount,
          deliveryCharge: finalBreakdown.deliveryCharge,
          handlingCharge: finalBreakdown.handlingCharge,
          additionalChargesTotal: finalBreakdown.additionalChargesTotal,
          appliedCharges: finalBreakdown.appliedCharges,
          finalAmount: finalBreakdown.finalAmount,
          totalItemCount: finalBreakdown.totalItemsCount,
          itemsPreview,
          paymentStatus: 'pending',
          paymentId,
          status: 'PAYMENT PENDING',
          estimatedPrepMinutes: settings.defaultPrepMinutes,
          adminAccepted: false,
          adminRejected: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (customerEmail) {
          orderDocData.customerEmail = customerEmail;
        }
        if (verifiedCoupon && finalBreakdown.couponDiscount > 0) {
          orderDocData.couponCode = verifiedCoupon.code;
        }
        if (reviewMeta.reviewFlagged) {
          orderDocData.reviewFlagged = true;
          if (reviewMeta.reviewFlagReason) {
            orderDocData.reviewFlagReason = reviewMeta.reviewFlagReason.slice(0, 300);
          }
          orderDocData.suspiciousScore = Math.min(100, Math.max(0, Math.round(reviewMeta.suspiciousScore)));
        }

        batch.set(doc(db, 'orders', orderId), orderDocData);

        cart.forEach((item, index) => {
          const itemDocId = `item_${index + 1}_${nowStamp}`;
          const autoUnit = item.eligibleForAutoDiscount ? settings.autoDiscountPerItem : 0;
          const displayedUnit = item.originalPrice + autoUnit;
          const itemData: Record<string, unknown> = {
            id: itemDocId,
            orderId,
            customerId: user.uid,
            productId: item.productId,
            productType: item.productType,
            name: item.name.slice(0, 120),
            quantityLabel: item.quantityLabel.slice(0, 60),
            quantity: item.quantity,
            originalPrice: item.originalPrice,
            displayedPrice: displayedUnit,
            autoDiscountPerUnit: autoUnit,
            lineTotal: item.originalPrice * item.quantity,
          };
          if (item.selectedFlavour) {
            itemData.selectedFlavour = item.selectedFlavour.slice(0, 40);
          }
          batch.set(doc(db, 'orders', orderId, 'items', itemDocId), itemData);
        });

        const placedHistoryId = `hist_pending_pay_${nowStamp}`;
        batch.set(doc(db, 'orders', orderId, 'status_history', placedHistoryId), {
          id: placedHistoryId,
          orderId,
          customerId: user.uid,
          status: 'PAYMENT PENDING',
          note: 'Order draft recorded. Awaiting full Razorpay payment completion.',
          updatedBy: user.uid,
          createdAt: serverTimestamp(),
        });

        if (verifiedCoupon && finalBreakdown.couponDiscount > 0) {
          batch.update(doc(db, 'coupons', verifiedCoupon.code), {
            usedCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        }

        if (
          fulfillmentType === 'delivery' &&
          (selectedAddressId === 'new' || addresses.length === 0) &&
          saveAddressForFuture
        ) {
          const newAddrId = `addr_${nowStamp}`;
          batch.set(doc(db, 'customers', user.uid, 'addresses', newAddrId), {
            id: newAddrId,
            customerId: user.uid,
            label: community === 'brigade_eldorado' ? 'Brigade Eldorado' : 'Main Gate Delivery',
            recipientName: cleanName.slice(0, 100),
            phone: cleanPhone.slice(0, 20),
            community,
            apartmentName: apartmentName.trim().slice(0, 120),
            blockOrTower: blockOrTower.trim().slice(0, 60),
            flatNumber: flatNumber.trim().slice(0, 40),
            landmark: landmark.trim().slice(0, 120),
            isDefault: addresses.length === 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `orders/${orderId}`);
        }

        const phoneId = cleanPhone.replace(/\D/g, '');
        if (/^91[6-9]\d{9}$/.test(phoneId)) {
          try {
            const phoneRef = doc(db, 'phone_accounts', phoneId);
            const phoneSnap = await getDoc(phoneRef);
            if (phoneSnap.exists()) {
              const paBatch = writeBatch(db);
              paBatch.update(phoneRef, {
                name: cleanName.slice(0, 100),
                lastUid: user.uid,
                orderCount: increment(1),
                updatedAt: serverTimestamp(),
              });
              await paBatch.commit();
            }
          } catch {
            // Non-blocking counter update
          }
        }

        try {
          const payBatch = writeBatch(db);
          payBatch.set(doc(db, 'payments', paymentId), {
            paymentId,
            orderId,
            customerId: user.uid,
            amount: finalBreakdown.finalAmount,
            currency: 'INR',
            status: 'pending',
            signatureVerified: false,
            verifiedByServer: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await payBatch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `payments/${paymentId}`);
        }
      }

      // 3. Create Razorpay Order on Server (never confirms order)
      const rzpOrderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders,
        body: JSON.stringify({
          orderId,
          amountInRupees: finalBreakdown.finalAmount,
          idempotencyKey,
        }),
      });

      const rzpParsed = await parseApiResponse<{
        configured?: boolean;
        razorpayOrderId?: string;
        amount?: number;
        currency?: string;
        keyId?: string;
        stockConflict?: boolean;
        error?: string;
      }>(rzpOrderRes);
      const rzpOrderData = rzpParsed.data;

      if (!rzpParsed.isJson || !rzpOrderData) {
        setPaymentWarning({
          orderId,
          message: buildUnexpectedApiResponseError(
            rzpOrderRes,
            'Payment server returned an unexpected response'
          ),
        });
        setSubmitting(false);
        return;
      }

      if (!rzpOrderRes.ok || !rzpOrderData.razorpayOrderId || !rzpOrderData.keyId) {
        if (rzpOrderRes.status === 409 || rzpOrderData.stockConflict) {
          setCheckoutError(
            rzpOrderData.error ||
              'One or more items in your order just ran out of stock. Please review your cart.'
          );
          setSubmitting(false);
          return;
        }
        setPaymentWarning({
          orderId,
          message:
            rzpOrderData.error ||
            'Razorpay server credentials are not configured yet. Your order remains in PAYMENT PENDING state and was NOT confirmed.',
        });
        setSubmitting(false);
        return;
      }

      // 4. Open real Razorpay Checkout modal
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setCheckoutError('Unable to load Razorpay Checkout script. Please check your network.');
        setSubmitting(false);
        return;
      }

      const markOrderPaymentFailed = async (
        reason: string,
        razorpayOrderIdVal?: string,
        razorpayPaymentIdVal?: string
      ) => {
        try {
          await fetch('/api/payments/mark-failed', {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders,
            body: JSON.stringify({
              orderId,
              reason: reason.slice(0, 230),
              razorpayOrderId: razorpayOrderIdVal,
              razorpayPaymentId: razorpayPaymentIdVal,
            }),
          });
        } catch {
          // Best-effort status sync
        }
        clearStoredCheckoutIdempotencyKey();
      };

      const rzp = new window.Razorpay({
        key: rzpOrderData.keyId,
        amount: rzpOrderData.amount,
        currency: rzpOrderData.currency || 'INR',
        name: BRAND_NAME,
        description: `Order ${orderId}`,
        order_id: rzpOrderData.razorpayOrderId,
        prefill: {
          name: cleanName,
          contact: cleanPhone,
          ...(customerEmail ? { email: customerEmail } : {}),
        },
        theme: {
          color: '#E88D14',
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              credentials: 'include',
              headers: authHeaders,
              body: JSON.stringify({
                ...response,
                orderId,
              }),
            });
            const verifyParsed = await parseApiResponse<{
              verified?: boolean;
              status?: string;
              stockConflict?: boolean;
              refundInitiated?: boolean;
              refundId?: string | null;
              message?: string;
              error?: string;
            }>(verifyRes);
            const verifyData = verifyParsed.data || {
              verified: false,
              error: buildUnexpectedApiResponseError(
                verifyRes,
                'Payment verification endpoint returned an unexpected response'
              ),
            };

            if (!verifyRes.ok || !verifyData.verified) {
              const failReason = verifyData.error || 'Payment signature verification failed.';
              if (verifyData.stockConflict) {
                clearStoredCheckoutIdempotencyKey();
                setCheckoutError(failReason);
                setSubmitting(false);
                return;
              }
              await markOrderPaymentFailed(
                failReason,
                response.razorpay_order_id,
                response.razorpay_payment_id
              );
              setCheckoutError(failReason);
              setSubmitting(false);
              return;
            }

            // Server verified payment & updated Firestore to PENDING ADMIN APPROVAL
            clearStoredCheckoutIdempotencyKey();
            clearCart();
            navigate(`/track/${orderId}`);
          } catch (err) {
            setCheckoutError(err instanceof Error ? err.message : 'Payment confirmation error.');
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            setPaymentWarning({
              orderId,
              message:
                'Razorpay checkout was closed before payment completed. Your order remains in PAYMENT PENDING state and has not been sent to the kitchen.',
            });
          },
        },
      });

      rzp.on('payment.failed', async (failRes) => {
        const reason = failRes.error?.description || 'Payment failed at Razorpay gateway.';
        await markOrderPaymentFailed(reason, rzpOrderData.razorpayOrderId);
        setCheckoutError(reason);
        setSubmitting(false);
      });

      rzp.open();
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Checkout failed.');
      setSubmitting(false);
    }
  };

  if (paymentWarning) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 space-y-5">
          <BrandLogo className="h-14 w-auto" />
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">
                Order {paymentWarning.orderId} Recorded (PAYMENT PENDING)
              </p>
              <p>{paymentWarning.message}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setPaymentWarning(null)}
              className="px-5 py-2.5 bg-[#E88D14] text-black text-sm font-semibold rounded-lg hover:bg-[#f39c25] transition-colors"
            >
              Return to Checkout &amp; Retry Payment
            </button>
            <Link
              to={`/track/${paymentWarning.orderId}`}
              className="px-5 py-2.5 bg-[#0A0A0B] text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Track Order Status
            </Link>
            <Link
              to="/orders"
              className="px-5 py-2.5 border border-zinc-300 text-zinc-800 text-sm font-semibold rounded-lg hover:border-zinc-500"
            >
              View My Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <MobileCheckoutView
        fulfillmentType={fulfillmentType}
        setFulfillmentType={setFulfillmentType}
        selectedAddressId={selectedAddressId}
        setSelectedAddressId={setSelectedAddressId}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        community={community}
        setCommunity={setCommunity}
        apartmentName={apartmentName}
        setApartmentName={setApartmentName}
        blockOrTower={blockOrTower}
        setBlockOrTower={setBlockOrTower}
        flatNumber={flatNumber}
        setFlatNumber={setFlatNumber}
        landmark={landmark}
        setLandmark={setLandmark}
        saveAddressForFuture={saveAddressForFuture}
        setSaveAddressForFuture={setSaveAddressForFuture}
        deliveryRuleAck={deliveryRuleAck}
        setDeliveryRuleAck={setDeliveryRuleAck}
        couponInput={couponInput}
        setCouponInput={setCouponInput}
        couponMessage={couponMessage}
        checkingCoupon={checkingCoupon}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={() => {
          setAppliedCoupon(null);
          setCouponInput('');
          setCouponMessage(null);
        }}
        appliedCoupon={appliedCoupon}
        breakdown={breakdown}
        submitting={submitting}
        hasStockConflict={hasStockConflict}
        stockConflicts={stockConflicts}
        checkoutError={checkoutError}
        onSubmitOrder={handlePlaceAndPay}
      />
      <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex items-center gap-4 pb-6 border-b border-zinc-200">
        <BrandLogo className="h-14 w-auto rounded-lg" />
        <div>
          <p className="text-xs font-medium tracking-widest text-[#D97706]">{BRAND_NAME}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Checkout & Payment
          </h1>
        </div>
      </div>

      <StockNoticeBanner />

      {!isCustomerAuthenticated ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-4">
          <ShieldCheck className="w-10 h-10 text-[#D97706] mx-auto" />
          <h2 className="text-xl font-bold text-zinc-900">Customer Account Required</h2>
          <p className="text-sm text-zinc-600">
            Sign in or create an account with your name, +91 mobile number, email address, and 4-digit password to place orders, manage saved addresses, and track deliveries.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <Link
              to="/login?redirect=/checkout"
              className="inline-block px-6 py-3 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/login?mode=register&redirect=/checkout"
              className="inline-block px-6 py-3 border border-zinc-300 bg-white text-zinc-900 font-semibold text-sm rounded-lg hover:bg-zinc-50 transition-colors"
            >
              Create Account
            </Link>
          </div>
          <p className="text-xs text-zinc-500">
            Review our{' '}
            <Link to="/terms" className="text-[#D97706] font-medium underline">
              Terms &amp; Conditions
            </Link>{' '}
            and{' '}
            <Link to="/refund-policy" className="text-[#D97706] font-medium underline">
              Refund &amp; Cancellation Policy
            </Link>
            .
          </p>
        </div>
      ) : cart.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-4">
          <h2 className="text-xl font-semibold text-zinc-900">Your cart is empty</h2>
          <Link
            to="/menu"
            className="inline-block px-5 py-2.5 bg-[#0A0A0B] text-white text-sm font-semibold rounded-lg"
          >
            Return to Food Menu
          </Link>
        </div>
      ) : (
        <form onSubmit={handlePlaceAndPay} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Cart Review, Delivery/Collection, Customer Info */}
          <div className="lg:col-span-7 space-y-6">
            {checkoutError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Cart Items Quick Review */}
            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-zinc-900">1. Cart Review</h2>
              <div className="divide-y divide-zinc-100">
                {cart.map((item) => {
                  const isCake = item.productType === 'cake';
                  const liveItem = isCake
                    ? cakeMenu.find((c) => c.id === item.productId)
                    : foodMenu.find((f) => f.id === item.productId);
                  const stockMeta = liveItem ? getInventoryStatusMeta(liveItem, { isCake }) : null;
                  const stockNorm = liveItem ? normalizeInventoryFields(liveItem, { isCake }) : null;
                  const remainingForKey = liveItem
                    ? getRemainingAddableQuantity(cart, liveItem, item.productType, item.cartKey)
                    : Number.POSITIVE_INFINITY;
                  const overStock =
                    Boolean(stockMeta && !stockMeta.orderable) ||
                    (Number.isFinite(remainingForKey) && item.quantity > remainingForKey);
                  const plusDisabled =
                    Boolean(stockMeta && !stockMeta.orderable) ||
                    (Number.isFinite(remainingForKey) && item.quantity >= remainingForKey);

                  return (
                    <div key={item.cartKey} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900">{item.name}</p>
                        <p className="text-xs text-zinc-500">
                          {item.quantityLabel}
                          {item.selectedFlavour ? ` · Flavour: ${item.selectedFlavour}` : ''}
                        </p>
                        <p className="text-xs font-mono tabular-nums text-zinc-500">
                          {formatRupees(item.originalPrice)} / unit
                        </p>
                        {overStock ? (
                          <p className="text-[11px] font-semibold text-red-700 mt-1">
                            {stockMeta && !stockMeta.orderable
                              ? stockMeta.code === 'SOLD_OUT'
                                ? 'SOLD OUT — Please remove this item.'
                                : 'Currently Unavailable — Please remove this item.'
                              : `Only ${stockNorm?.stockQuantity ?? 0} ${(stockNorm?.stockUnit || 'units').toLowerCase()} remaining. Reduce quantity.`}
                          </p>
                        ) : stockMeta?.code === 'LOW_STOCK' && stockMeta.customerWarning ? (
                          <p className="text-[11px] font-semibold text-amber-700 mt-1">
                            {stockMeta.customerWarning}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="inline-flex items-center border border-zinc-300 rounded-lg">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.cartKey, item.quantity - 1)}
                            className="p-1.5 text-zinc-700 hover:text-black"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2.5 text-xs font-mono tabular-nums font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={plusDisabled}
                            onClick={() => updateCartQuantity(item.cartKey, item.quantity + 1)}
                            className="p-1.5 text-zinc-700 hover:text-black disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-mono tabular-nums font-semibold min-w-[56px] text-right">
                          {formatRupees(item.originalPrice * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.cartKey)}
                          className="text-zinc-400 hover:text-red-600"
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Fulfillment Mode: Delivery or Collection */}
            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
              <h2 className="text-lg font-bold text-zinc-900">2. Delivery or Collection</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFulfillmentType('delivery')}
                  className={`p-4 rounded-xl border text-left transition-colors ${
                    fulfillmentType === 'delivery'
                      ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                      : 'bg-zinc-50 text-zinc-800 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  <p className="text-sm font-semibold">Doorstep / Main Gate Delivery</p>
                  <p
                    className={`text-xs mt-1 ${
                      fulfillmentType === 'delivery' ? 'text-zinc-300' : 'text-zinc-500'
                    }`}
                  >
                    {deliverySubtitle}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFulfillmentType('collection')}
                  className={`p-4 rounded-xl border text-left transition-colors ${
                    fulfillmentType === 'collection'
                      ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                      : 'bg-zinc-50 text-zinc-800 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  <p className="text-sm font-semibold">Takeaway / Collection</p>
                  <p
                    className={`text-xs mt-1 ${
                      fulfillmentType === 'collection' ? 'text-zinc-300' : 'text-zinc-500'
                    }`}
                  >
                    Brigade Eldorado Main Gate (₹0 delivery)
                  </p>
                </button>
              </div>

              {fulfillmentType === 'collection' ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-950 font-medium">
                  {COLLECTION_NOTICE}
                </div>
              ) : (
                <div className="space-y-4">
                  {addresses.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-zinc-700">
                        Saved Addresses
                      </label>
                      <div className="space-y-2">
                        {addresses.map((addr) => (
                          <label
                            key={addr.id}
                            className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer ${
                              selectedAddressId === addr.id
                                ? 'border-[#E88D14] bg-amber-50/40'
                                : 'border-zinc-200'
                            }`}
                          >
                            <input
                              type="radio"
                              name="savedAddress"
                              checked={selectedAddressId === addr.id}
                              onChange={() => setSelectedAddressId(addr.id)}
                              className="mt-1"
                            />
                            <div className="text-sm">
                              <p className="font-semibold text-zinc-900">
                                {addr.label} ·{' '}
                                {addr.community === 'brigade_eldorado'
                                  ? 'Within Brigade Eldorado'
                                  : 'Outside Brigade Eldorado (Main Gate Only)'}
                              </p>
                              <p className="text-xs text-zinc-600 mt-0.5">
                                {addr.apartmentName}
                                {addr.blockOrTower ? `, ${addr.blockOrTower}` : ''}
                                {addr.flatNumber ? `, Flat ${addr.flatNumber}` : ''}
                                {addr.landmark ? ` (${addr.landmark})` : ''}
                              </p>
                            </div>
                          </label>
                        ))}
                        <label
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                            selectedAddressId === 'new'
                              ? 'border-[#E88D14] bg-amber-50/40'
                              : 'border-zinc-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name="savedAddress"
                            checked={selectedAddressId === 'new'}
                            onChange={() => setSelectedAddressId('new')}
                          />
                          <span className="text-sm font-medium text-zinc-900">
                            Enter a new delivery address
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {(addresses.length === 0 || selectedAddressId === 'new') && (
                    <div className="space-y-4 pt-2">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                          Delivery Location Zone
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setCommunity('brigade_eldorado');
                              setApartmentName('Brigade Eldorado');
                            }}
                            className={`p-3 rounded-lg border text-xs font-semibold text-left ${
                              community === 'brigade_eldorado'
                                ? 'border-[#0A0A0B] bg-zinc-900 text-white'
                                : 'border-zinc-300 text-zinc-700'
                            }`}
                          >
                            Within Brigade Eldorado
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCommunity('outside_eldorado');
                              if (apartmentName === 'Brigade Eldorado') setApartmentName('');
                            }}
                            className={`p-3 rounded-lg border text-xs font-semibold text-left ${
                              community === 'outside_eldorado'
                                ? 'border-[#0A0A0B] bg-zinc-900 text-white'
                                : 'border-zinc-300 text-zinc-700'
                            }`}
                          >
                            Outside Brigade Eldorado (Main Gate Only)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Apartment / Community Name *
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={120}
                            value={apartmentName}
                            onChange={(e) => setApartmentName(e.target.value)}
                            placeholder="e.g. Brigade Eldorado / Apartment Name"
                            className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Tower / Block
                          </label>
                          <input
                            type="text"
                            maxLength={60}
                            value={blockOrTower}
                            onChange={(e) => setBlockOrTower(e.target.value)}
                            placeholder="e.g. Jasper Tower"
                            className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Flat / House Number
                          </label>
                          <input
                            type="text"
                            maxLength={40}
                            value={flatNumber}
                            onChange={(e) => setFlatNumber(e.target.value)}
                            placeholder="e.g. 402"
                            className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Landmark / Gate Instructions
                          </label>
                          <input
                            type="text"
                            maxLength={120}
                            value={landmark}
                            onChange={(e) => setLandmark(e.target.value)}
                            placeholder="Optional landmark or main gate instruction"
                            className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-zinc-700">
                        <input
                          type="checkbox"
                          checked={saveAddressForFuture}
                          onChange={(e) => setSaveAddressForFuture(e.target.checked)}
                        />
                        <span>Save this address to my account</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Customer Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-100">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Mobile Number (+91) *
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={20}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              {/* Mandatory Delivery & Collection Rules Display */}
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2.5">
                <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                  Delivery & Collection Rules
                </p>
                <ul className="space-y-1 text-xs text-zinc-700">
                  {DELIVERY_RULES.map((rule) => (
                    <li key={rule}>• {rule}</li>
                  ))}
                </ul>
                <label className="flex items-start gap-2.5 pt-2 border-t border-zinc-200 text-xs font-medium text-zinc-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deliveryRuleAck}
                    onChange={(e) => setDeliveryRuleAck(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I understand and accept the Brigade Eldorado delivery and main-gate collection rules.
                  </span>
                </label>
              </div>
            </section>
          </div>

          {/* Right Column: Coupon, Preparation Time, Full Price Breakdown, Razorpay */}
          <div className="lg:col-span-5 space-y-6">
            {/* Coupon Code */}
            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#D97706]" />
                <h2 className="text-base font-bold text-zinc-900">Apply Coupon Code</h2>
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
                  placeholder="Enter coupon code"
                  className="flex-1 px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm font-mono uppercase"
                />
                <button
                  type="button"
                  disabled={checkingCoupon}
                  onClick={handleApplyCoupon}
                  className="px-4 py-2.5 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black transition-colors whitespace-nowrap"
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
                      Active: {appliedCoupon.code} (
                      {appliedCoupon.discountType === 'percentage'
                        ? `${appliedCoupon.discountValue}% off`
                        : `${formatRupees(appliedCoupon.discountValue)} off`}
                      )
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
                    className="underline font-medium shrink-0"
                  >
                    Remove
                  </button>
                </div>
              )}
            </section>

            {/* Full Price Breakdown & Pay */}
            <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
              <h2 className="text-lg font-bold text-zinc-900 border-b border-zinc-100 pb-3">
                Price Breakdown
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-zinc-900 font-semibold">
                  <span>Item Subtotal ({breakdown.totalItemsCount} items)</span>
                  <span className="font-mono tabular-nums">
                    {formatRupees(breakdown.effectiveSubtotal)}
                  </span>
                </div>
                {appliedCoupon && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>
                      Coupon Discount ({appliedCoupon.code})
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
                <span className="text-base font-bold text-zinc-900">Final Payable Amount</span>
                <span className="text-2xl font-bold font-mono tabular-nums text-zinc-900">
                  {formatRupees(breakdown.finalAmount)}
                </span>
              </div>

              <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-lg flex items-start gap-2.5 text-xs text-zinc-700">
                <Clock className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                <span>
                  Standard estimated preparation time: <strong>{settings.defaultPrepMinutes} minutes</strong> for every order. If ready sooner, you will be notified immediately.
                </span>
              </div>

              {!serverConfig.razorpayConfigured && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    Razorpay keys (<code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code>) are not configured on the server yet. Placing the order will record it as Pending payment without simulating a fake payment.
                  </span>
                </div>
              )}

              {hasStockConflict && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
                  <p className="font-semibold">Cart requires update before payment:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {stockConflicts.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || hasStockConflict}
                className="w-full py-3.5 px-5 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Processing Order...'
                    : hasStockConflict
                      ? 'Update Cart Stock to Pay'
                      : `Place Order & Pay ${formatRupees(breakdown.finalAmount)}`}
                </span>
              </button>

              <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Secured by Razorpay Server-Side Signature Verification</span>
              </div>
              <p className="text-xs text-zinc-500 text-center">
                By placing your order, you agree to the{' '}
                <Link to="/terms" className="text-[#D97706] font-medium underline">
                  Terms &amp; Conditions
                </Link>{' '}
                and{' '}
                <Link to="/refund-policy" className="text-[#D97706] font-medium underline">
                  Refund &amp; Cancellation Policy
                </Link>
                .
              </p>
            </section>
          </div>
        </form>
      )}
      </div>
    </>
  );
}
