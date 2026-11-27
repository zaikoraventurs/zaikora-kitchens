import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Minus,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Tag,
  Trash2,
  User,
} from 'lucide-react';
import { StockNoticeBanner } from '../StockNoticeBanner';
import { useApp } from '../../context/AppContext';
import { COLLECTION_NOTICE, DELIVERY_RULES } from '../../data/catalog';
import { auth, db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  getInventoryStatusMeta,
  getRemainingAddableQuantity,
  normalizeInventoryFields,
} from '../../lib/inventory';
import { formatRupees, sanitizeCouponCode } from '../../lib/pricing';
import type { PriceBreakdown } from '../../lib/pricing';
import type { CommunityType, CouponRecord, CustomerAddress, FulfillmentType } from '../../types';

interface MobileCheckoutViewProps {
  fulfillmentType: FulfillmentType;
  setFulfillmentType: (val: FulfillmentType) => void;
  selectedAddressId: string;
  setSelectedAddressId: (id: string) => void;
  customerName: string;
  setCustomerName: (val: string) => void;
  customerPhone: string;
  setCustomerPhone: (val: string) => void;
  community: CommunityType;
  setCommunity: (val: CommunityType) => void;
  apartmentName: string;
  setApartmentName: (val: string) => void;
  blockOrTower: string;
  setBlockOrTower: (val: string) => void;
  flatNumber: string;
  setFlatNumber: (val: string) => void;
  landmark: string;
  setLandmark: (val: string) => void;
  saveAddressForFuture: boolean;
  setSaveAddressForFuture: (val: boolean) => void;
  deliveryRuleAck: boolean;
  setDeliveryRuleAck: (val: boolean) => void;
  couponInput: string;
  setCouponInput: (val: string) => void;
  couponMessage: { type: 'ok' | 'err'; text: string } | null;
  checkingCoupon: boolean;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  appliedCoupon: CouponRecord | null;
  breakdown: PriceBreakdown;
  submitting: boolean;
  hasStockConflict: boolean;
  stockConflicts: string[];
  checkoutError: string;
  onSubmitOrder: (e: React.FormEvent) => void;
}

export function MobileCheckoutView({
  fulfillmentType,
  setFulfillmentType,
  selectedAddressId,
  setSelectedAddressId,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  community,
  setCommunity,
  apartmentName,
  setApartmentName,
  blockOrTower,
  setBlockOrTower,
  flatNumber,
  setFlatNumber,
  landmark,
  setLandmark,
  saveAddressForFuture,
  setSaveAddressForFuture,
  deliveryRuleAck,
  setDeliveryRuleAck,
  couponInput,
  setCouponInput,
  couponMessage,
  checkingCoupon,
  onApplyCoupon,
  onRemoveCoupon,
  appliedCoupon,
  breakdown,
  submitting,
  hasStockConflict,
  stockConflicts,
  checkoutError,
  onSubmitOrder,
}: MobileCheckoutViewProps) {
  const {
    user,
    verifiedPhone,
    isCustomerAuthenticated,
    addresses,
    cart,
    updateCartQuantity,
    removeFromCart,
    settings,
    checkoutCharges,
    foodMenu,
    cakeMenu,
    serverConfig,
    setDltPhoneSession,
    ensureCustomerProfile,
  } = useApp();

  const deliveryOnlyActiveCharges = checkoutCharges.filter(
    (c) => c.enabled && c.appliesOn === 'delivery_only'
  );
  const deliverySubtitle =
    deliveryOnlyActiveCharges.length === 0
      ? 'No extra delivery fee'
      : deliveryOnlyActiveCharges.every((c) => Number(c.amount) === 0)
        ? 'FREE delivery (₹0)'
        : deliveryOnlyActiveCharges
            .map((c) =>
              c.type === 'percentage' ? `${c.amount}%` : formatRupees(c.amount)
            )
            .join(' + ');

  // Inline Step 1 Sign-In / Create Account state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginName, setLoginName] = useState('');
  const [loginMobile, setLoginMobile] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [showPin, setShowPin] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Edit Saved Address state
  const [editingAddr, setEditingAddr] = useState<CustomerAddress | null>(null);
  const [editLabel, setEditLabel] = useState('Home');
  const [editCommunity, setEditCommunity] = useState<CommunityType>('brigade_eldorado');
  const [editApartment, setEditApartment] = useState('');
  const [editTower, setEditTower] = useState('');
  const [editFlat, setEditFlat] = useState('');
  const [editLandmark, setEditLandmark] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Add Saved Address immediately helper
  const [addingInlineAddr, setAddingInlineAddr] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');

  const handleInlineSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const cleanedName = loginName.trim();
    const cleanedMobile = loginMobile.replace(/\D/g, '');
    const cleanedEmail = loginEmail.trim().toLowerCase();
    const cleanedPin = loginPin.replace(/\D/g, '');

    if (authMode === 'register' && !cleanedName) {
      setLoginError('Please enter your full name.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
      setLoginError('Enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }
    if (authMode === 'register' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanedEmail)) {
      setLoginError('Please enter a valid email address.');
      return;
    }
    if (!/^\d{4}$/.test(cleanedPin)) {
      setLoginError('Enter a 4-digit numeric account password.');
      return;
    }

    setSigningIn(true);
    try {
      const fbUser = auth.currentUser || (await signInAnonymously(auth)).user;
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/auth/pin-login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          mode: authMode,
          name: cleanedName,
          mobile: `+91${cleanedMobile}`,
          email: cleanedEmail,
          marketingConsent: authMode === 'register' ? marketingConsent : undefined,
          pin: cleanedPin,
        }),
      });
      const raw = await res.text();
      let data: {
        verified?: boolean;
        phone?: string;
        name?: string;
        email?: string;
        marketingConsent?: boolean;
        sessionToken?: string;
        error?: string;
      } = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          setLoginError(`Unexpected server response (HTTP ${res.status}).`);
          return;
        }
      }
      if (!res.ok || !data.verified || !data.phone || !data.sessionToken) {
        setLoginError(data.error || 'Unable to sign in. Check your mobile and password.');
        return;
      }
      const resolvedName = data.name || cleanedName || 'Customer';
      const resolvedEmail = data.email ?? cleanedEmail;
      setDltPhoneSession({
        phone: data.phone,
        name: resolvedName,
        email: resolvedEmail || undefined,
        marketingConsent: data.marketingConsent,
        sessionToken: data.sessionToken,
      });
      setCustomerName(resolvedName);
      setCustomerPhone(data.phone);
      try {
        await ensureCustomerProfile(
          fbUser,
          resolvedName,
          data.phone,
          resolvedEmail,
          data.marketingConsent
        );
      } catch {
        // Non-blocking profile sync
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Unable to reach login server.');
    } finally {
      setSigningIn(false);
    }
  };

  const startEditAddress = (addr: CustomerAddress) => {
    setEditingAddr(addr);
    setEditLabel(addr.label || 'Home');
    setEditCommunity(addr.community);
    setEditApartment(addr.apartmentName || '');
    setEditTower(addr.blockOrTower || '');
    setEditFlat(addr.flatNumber || '');
    setEditLandmark(addr.landmark || '');
  };

  const handleSaveEditedAddress = async () => {
    if (!user || !editingAddr || !editApartment.trim()) return;
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, 'customers', user.uid, 'addresses', editingAddr.id), {
        label: editLabel.trim().slice(0, 40) || 'Home',
        recipientName: (customerName || 'Customer').slice(0, 100),
        phone: (customerPhone || verifiedPhone || '').slice(0, 20),
        community: editCommunity,
        apartmentName: editApartment.trim().slice(0, 120),
        blockOrTower: editTower.trim().slice(0, 60),
        flatNumber: editFlat.trim().slice(0, 40),
        landmark: editLandmark.trim().slice(0, 120),
        isDefault: Boolean(editingAddr.isDefault),
        updatedAt: serverTimestamp(),
      });
      setSelectedAddressId(editingAddr.id);
      setEditingAddr(null);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `customers/${user.uid}/addresses/${editingAddr.id}`
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveNewAddressNow = async () => {
    if (!user || !apartmentName.trim()) return;
    setAddingInlineAddr(true);
    const id = `addr_${Date.now()}`;
    try {
      await setDoc(doc(db, 'customers', user.uid, 'addresses', id), {
        id,
        customerId: user.uid,
        label:
          newLabel.trim().slice(0, 40) ||
          (community === 'brigade_eldorado' ? 'Brigade Eldorado' : 'Main Gate Delivery'),
        recipientName: (customerName || 'Customer').slice(0, 100),
        phone: (customerPhone || verifiedPhone || '').slice(0, 20),
        community,
        apartmentName: apartmentName.trim().slice(0, 120),
        blockOrTower: blockOrTower.trim().slice(0, 60),
        flatNumber: flatNumber.trim().slice(0, 40),
        landmark: landmark.trim().slice(0, 120),
        isDefault: addresses.length === 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSelectedAddressId(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `customers/${user.uid}/addresses/${id}`);
    } finally {
      setAddingInlineAddr(false);
    }
  };

  return (
    <div className="md:hidden px-3.5 pt-4 pb-8 space-y-5">
      <div className="border-b border-zinc-200 pb-3">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">Checkout &amp; Payment</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Complete your delivery details and pay securely via Razorpay
        </p>
      </div>

      <StockNoticeBanner compact />

      {cart.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center space-y-3">
          <h2 className="text-base font-bold text-zinc-900">Your cart is empty</h2>
          <Link
            to="/menu"
            className="inline-flex items-center justify-center min-h-[44px] px-5 bg-[#0A0A0B] text-white text-xs font-bold rounded-xl"
          >
            Return to Food Menu
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Step 1: Inline Customer Sign-In / Create Account OR Signed-In Customer Badge */}
          {!isCustomerAuthenticated ? (
            <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#D97706] shrink-0" />
                <h2 className="text-sm font-bold text-zinc-900">
                  1. {authMode === 'register' ? 'Create Account to Order' : 'Sign In to Order'}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-1.5 bg-zinc-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setLoginError('');
                  }}
                  className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                    authMode === 'login' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setLoginError('');
                  }}
                  className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                    authMode === 'register' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {loginError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleInlineSignIn} className="space-y-3">
                {authMode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Full Name *
                    </label>
                    <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                      <span className="pl-3 text-zinc-400">
                        <User className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        required
                        maxLength={100}
                        value={loginName}
                        onChange={(e) => setLoginName(e.target.value)}
                        placeholder="Enter your full name"
                        className="flex-1 min-h-[44px] px-3 py-2 text-base focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Mobile Number (+91) *
                  </label>
                  <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                    <span className="px-3 min-h-[44px] bg-zinc-100 text-zinc-700 font-mono text-sm border-r border-zinc-300 inline-flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-zinc-500" />
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      required
                      value={loginMobile}
                      onChange={(e) => setLoginMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="98XXXXXXXX"
                      className="flex-1 min-h-[44px] px-3 py-2 text-base font-mono tabular-nums focus:outline-none"
                    />
                  </div>
                </div>

                {authMode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Email Address *
                    </label>
                    <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                      <span className="pl-3 text-zinc-400">
                        <Mail className="w-4 h-4" />
                      </span>
                      <input
                        type="email"
                        required
                        maxLength={160}
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="flex-1 min-h-[44px] px-3 py-2 text-base focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-zinc-700">
                      4-Digit Account Password *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPin((p) => !p)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D97706]"
                    >
                      {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPin ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                    <span className="pl-3 text-zinc-400">
                      <KeyRound className="w-4 h-4" />
                    </span>
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={4}
                      required
                      value={loginPin}
                      onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="4-digit password"
                      className="flex-1 min-h-[44px] px-3 py-2 text-base font-mono tracking-[0.3em] tabular-nums focus:outline-none"
                    />
                  </div>
                </div>

                {authMode === 'register' && (
                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marketingConsent}
                      onChange={(e) => setMarketingConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#E88D14] shrink-0"
                    />
                    <span>
                      Optional: I agree to receive promotional offers and menu updates via WhatsApp, phone calls, or email.
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full min-h-[46px] bg-[#E88D14] text-black text-sm font-bold rounded-xl disabled:opacity-60"
                >
                  {signingIn
                    ? authMode === 'register'
                      ? 'Creating Account...'
                      : 'Signing In...'
                    : authMode === 'register'
                    ? 'Create Account & Continue'
                    : 'Sign In & Continue Checkout'}
                </button>

                <p className="text-[11px] text-zinc-500 text-center">
                  By continuing, you agree to our{' '}
                  <Link to="/terms" className="text-[#D97706] font-semibold underline">
                    Terms &amp; Conditions
                  </Link>{' '}
                  and{' '}
                  <Link to="/refund-policy" className="text-[#D97706] font-semibold underline">
                    Refund &amp; Cancellation Policy
                  </Link>
                  .
                </p>
              </form>
            </section>
          ) : (
            <form onSubmit={onSubmitOrder} className="space-y-4">
              {checkoutError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Signed-In Customer Contact */}
              <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-zinc-900">1. Customer Details</h2>
                  <span className="text-[11px] font-semibold text-emerald-700">Signed In</span>
                </div>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base"
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
                      className="w-full min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base font-mono tabular-nums"
                    />
                  </div>
                </div>
              </section>

              {/* Step 2 & 3: Delivery vs Collection + Saved Addresses (Select / Add / Edit) */}
              <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3.5">
                <h2 className="text-sm font-bold text-zinc-900">2. Delivery or Collection</h2>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('delivery')}
                    className={`min-h-[64px] p-3 rounded-xl border text-left transition-colors ${
                      fulfillmentType === 'delivery'
                        ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                        : 'bg-zinc-50 text-zinc-800 border-zinc-200'
                    }`}
                  >
                    <p className="text-xs font-bold">Delivery</p>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        fulfillmentType === 'delivery' ? 'text-zinc-300' : 'text-zinc-500'
                      }`}
                    >
                      Fee: {deliverySubtitle}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentType('collection')}
                    className={`min-h-[64px] p-3 rounded-xl border text-left transition-colors ${
                      fulfillmentType === 'collection'
                        ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                        : 'bg-zinc-50 text-zinc-800 border-zinc-200'
                    }`}
                  >
                    <p className="text-xs font-bold">Main Gate Pickup</p>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        fulfillmentType === 'collection' ? 'text-zinc-300' : 'text-zinc-500'
                      }`}
                    >
                      ₹0 delivery
                    </p>
                  </button>
                </div>

                {fulfillmentType === 'collection' ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 font-medium">
                    {COLLECTION_NOTICE}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {addresses.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-zinc-700">Saved Addresses</p>
                        {addresses.map((addr) => (
                          <div
                            key={addr.id}
                            className={`rounded-xl border p-3 ${
                              selectedAddressId === addr.id
                                ? 'border-[#E88D14] bg-amber-50/40'
                                : 'border-zinc-200'
                            }`}
                          >
                            {editingAddr?.id === addr.id ? (
                              <div className="space-y-2.5">
                                <p className="text-xs font-bold text-zinc-900">Edit Address</p>
                                <input
                                  type="text"
                                  value={editLabel}
                                  onChange={(e) => setEditLabel(e.target.value)}
                                  placeholder="Label (e.g. Home)"
                                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-base"
                                />
                                <select
                                  value={editCommunity}
                                  onChange={(e) => {
                                    const v = e.target.value as CommunityType;
                                    setEditCommunity(v);
                                    if (v === 'brigade_eldorado') setEditApartment('Brigade Eldorado');
                                  }}
                                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-base"
                                >
                                  <option value="brigade_eldorado">Within Brigade Eldorado</option>
                                  <option value="outside_eldorado">
                                    Outside Brigade Eldorado (Main Gate Only)
                                  </option>
                                </select>
                                <input
                                  type="text"
                                  value={editApartment}
                                  onChange={(e) => setEditApartment(e.target.value)}
                                  placeholder="Apartment Name *"
                                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-base"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    value={editTower}
                                    onChange={(e) => setEditTower(e.target.value)}
                                    placeholder="Tower / Block"
                                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-base"
                                  />
                                  <input
                                    type="text"
                                    value={editFlat}
                                    onChange={(e) => setEditFlat(e.target.value)}
                                    placeholder="Flat No."
                                    className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-base"
                                  />
                                </div>
                                <input
                                  type="text"
                                  value={editLandmark}
                                  onChange={(e) => setEditLandmark(e.target.value)}
                                  placeholder="Landmark"
                                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-base"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    disabled={savingEdit}
                                    onClick={handleSaveEditedAddress}
                                    className="min-h-[38px] px-3.5 bg-[#E88D14] text-black text-xs font-bold rounded-lg"
                                  >
                                    {savingEdit ? 'Saving...' : 'Save Changes'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingAddr(null)}
                                    className="min-h-[38px] px-3 text-xs text-zinc-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <label className="flex items-start gap-2.5 flex-1 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="mobileSavedAddress"
                                    checked={selectedAddressId === addr.id}
                                    onChange={() => setSelectedAddressId(addr.id)}
                                    className="mt-1 shrink-0"
                                  />
                                  <div className="text-xs space-y-0.5">
                                    <p className="font-bold text-zinc-900">
                                      {addr.label} ·{' '}
                                      {addr.community === 'brigade_eldorado'
                                        ? 'Brigade Eldorado'
                                        : 'Outside (Main Gate Only)'}
                                    </p>
                                    <p className="text-zinc-600">
                                      {addr.apartmentName}
                                      {addr.blockOrTower ? `, ${addr.blockOrTower}` : ''}
                                      {addr.flatNumber ? `, Flat ${addr.flatNumber}` : ''}
                                      {addr.landmark ? ` (${addr.landmark})` : ''}
                                    </p>
                                  </div>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => startEditAddress(addr)}
                                  aria-label={`Edit address ${addr.label}`}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 active:text-zinc-900 shrink-0"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}

                        <label
                          className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer ${
                            selectedAddressId === 'new'
                              ? 'border-[#E88D14] bg-amber-50/40'
                              : 'border-zinc-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name="mobileSavedAddress"
                            checked={selectedAddressId === 'new'}
                            onChange={() => setSelectedAddressId('new')}
                          />
                          <span className="text-xs font-semibold text-zinc-900">
                            + Add / Enter a new delivery address
                          </span>
                        </label>
                      </div>
                    )}

                    {(addresses.length === 0 || selectedAddressId === 'new') && (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCommunity('brigade_eldorado');
                              setApartmentName('Brigade Eldorado');
                            }}
                            className={`min-h-[44px] p-2.5 rounded-lg border text-[11px] font-semibold text-left ${
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
                            className={`min-h-[44px] p-2.5 rounded-lg border text-[11px] font-semibold text-left ${
                              community === 'outside_eldorado'
                                ? 'border-[#0A0A0B] bg-zinc-900 text-white'
                                : 'border-zinc-300 text-zinc-700'
                            }`}
                          >
                            Outside (Main Gate Only)
                          </button>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Apartment / Community Name *
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={120}
                            value={apartmentName}
                            onChange={(e) => setApartmentName(e.target.value)}
                            placeholder="e.g. Brigade Eldorado"
                            className="w-full min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-semibold text-zinc-700 mb-1">
                              Tower / Block
                            </label>
                            <input
                              type="text"
                              maxLength={60}
                              value={blockOrTower}
                              onChange={(e) => setBlockOrTower(e.target.value)}
                              placeholder="Jasper Tower"
                              className="w-full min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-700 mb-1">
                              Flat / House No.
                            </label>
                            <input
                              type="text"
                              maxLength={40}
                              value={flatNumber}
                              onChange={(e) => setFlatNumber(e.target.value)}
                              placeholder="402"
                              className="w-full min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-zinc-700 mb-1">
                            Landmark / Gate Instructions
                          </label>
                          <input
                            type="text"
                            maxLength={120}
                            value={landmark}
                            onChange={(e) => setLandmark(e.target.value)}
                            placeholder="Optional landmark"
                            className="w-full min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <label className="flex items-center gap-2 text-xs text-zinc-700">
                            <input
                              type="checkbox"
                              checked={saveAddressForFuture}
                              onChange={(e) => setSaveAddressForFuture(e.target.checked)}
                            />
                            <span>Save address to account</span>
                          </label>
                          {addresses.length > 0 && apartmentName.trim() && (
                            <button
                              type="button"
                              disabled={addingInlineAddr}
                              onClick={() => {
                                setNewLabel(newLabel || 'Home');
                                handleSaveNewAddressNow();
                              }}
                              className="text-xs font-semibold text-[#D97706] underline shrink-0"
                            >
                              {addingInlineAddr ? 'Saving...' : 'Save Now'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Brigade Eldorado Delivery & Collection Rules */}
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2">
                  <p className="text-[11px] font-bold text-zinc-900 uppercase tracking-wider">
                    Delivery &amp; Collection Rules
                  </p>
                  <ul className="space-y-1 text-[11px] text-zinc-700">
                    {DELIVERY_RULES.map((rule) => (
                      <li key={rule}>• {rule}</li>
                    ))}
                  </ul>
                  <label className="flex items-start gap-2.5 pt-2 border-t border-zinc-200 text-xs font-medium text-zinc-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deliveryRuleAck}
                      onChange={(e) => setDeliveryRuleAck(e.target.checked)}
                      className="mt-0.5 shrink-0"
                    />
                    <span>
                      I accept the Brigade Eldorado delivery and main-gate collection rules.
                    </span>
                  </label>
                </div>
              </section>

              {/* Step 3: Compact Items Review */}
              <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2.5">
                <h2 className="text-sm font-bold text-zinc-900">
                  3. Items Review ({breakdown.totalItemsCount})
                </h2>
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
                      <div key={item.cartKey} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-zinc-900 truncate">{item.name}</p>
                          <p className="text-[11px] text-zinc-500 truncate">
                            {item.quantityLabel}
                            {item.selectedFlavour ? ` · ${item.selectedFlavour}` : ''} ·{' '}
                            {formatRupees(item.originalPrice)}
                          </p>
                          {overStock ? (
                            <p className="text-[10px] font-semibold text-red-700 mt-0.5">
                              {stockMeta && !stockMeta.orderable
                                ? stockMeta.code === 'SOLD_OUT'
                                  ? 'SOLD OUT — Remove item'
                                  : 'Unavailable — Remove item'
                                : `Only ${stockNorm?.stockQuantity ?? 0} ${(stockNorm?.stockUnit || 'units').toLowerCase()} left`}
                            </p>
                          ) : stockMeta?.code === 'LOW_STOCK' && stockMeta.customerWarning ? (
                            <p className="text-[10px] font-semibold text-amber-700 mt-0.5">
                              {stockMeta.customerWarning}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="inline-flex items-center border border-zinc-300 rounded-lg">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.cartKey, item.quantity - 1)}
                              className="min-w-[30px] min-h-[30px] flex items-center justify-center text-zinc-700"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2 text-xs font-mono tabular-nums font-bold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={plusDisabled}
                              onClick={() => updateCartQuantity(item.cartKey, item.quantity + 1)}
                              className="min-w-[30px] min-h-[30px] flex items-center justify-center text-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-xs font-mono tabular-nums font-bold min-w-[48px] text-right">
                            {formatRupees(item.originalPrice * item.quantity)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.cartKey)}
                            className="p-1 text-zinc-400 active:text-red-600"
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Step 4: Coupon Code */}
              <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[#D97706]" />
                  <h2 className="text-sm font-bold text-zinc-900">4. Apply Coupon Code</h2>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(sanitizeCouponCode(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onApplyCoupon();
                      }
                    }}
                    placeholder="Enter coupon code"
                    className="flex-1 min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base font-mono uppercase"
                  />
                  <button
                    type="button"
                    disabled={checkingCoupon}
                    onClick={onApplyCoupon}
                    className="min-h-[44px] px-4 bg-[#0A0A0B] text-white text-xs font-bold rounded-lg whitespace-nowrap"
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
                    <span className="font-mono font-semibold truncate">
                      Active: {appliedCoupon.code}
                    </span>
                    <button
                      type="button"
                      onClick={onRemoveCoupon}
                      className="underline font-semibold shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </section>

              {/* Step 5 & 6: Order Summary & Razorpay Pay Button */}
              <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-4">
                <h2 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-2">
                  5. Order Summary &amp; Payment
                </h2>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-zinc-900 font-semibold">
                    <span>Item Subtotal</span>
                    <span className="font-mono tabular-nums">
                      {formatRupees(breakdown.effectiveSubtotal)}
                    </span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Coupon ({appliedCoupon.code})</span>
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

                <div className="pt-3 border-t border-zinc-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-900">Final Payable Amount</span>
                  <span className="text-xl font-bold font-mono tabular-nums text-zinc-900">
                    {formatRupees(breakdown.finalAmount)}
                  </span>
                </div>

                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-start gap-2 text-[11px] text-zinc-700">
                  <Clock className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                  <span>
                    Estimated preparation time: <strong>{settings.defaultPrepMinutes} minutes</strong>.
                  </span>
                </div>

                {!serverConfig.razorpayConfigured && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      Razorpay keys are not configured on the server yet. Placing the order records it as PAYMENT PENDING without confirming it.
                    </span>
                  </div>
                )}

                {hasStockConflict && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-800 space-y-1">
                    <p className="font-bold">Cart requires update before payment:</p>
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
                  className="w-full min-h-[50px] py-3.5 px-4 bg-[#E88D14] text-black font-bold text-sm rounded-xl active:bg-[#f39c25] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Secured by Razorpay Signature Verification</span>
                </div>
                <p className="text-[11px] text-zinc-500 text-center">
                  Orders are subject to our{' '}
                  <Link to="/terms" className="text-[#D97706] font-semibold underline">
                    Terms &amp; Conditions
                  </Link>{' '}
                  and{' '}
                  <Link to="/refund-policy" className="text-[#D97706] font-semibold underline">
                    Refund &amp; Cancellation Policy
                  </Link>
                  .
                </p>
              </section>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
