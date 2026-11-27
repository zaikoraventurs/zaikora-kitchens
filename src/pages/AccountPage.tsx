import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  CreditCard,
  LogOut,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Trash2,
  User,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { MobileAccountView } from '../components/mobile/MobileAccountView';
import { useApp } from '../context/AppContext';
import { BRAND_NAME } from '../data/catalog';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatDateTime, formatRupees } from '../lib/pricing';
import type { CommunityType, CustomerAddress } from '../types';

function extractIndianDigits(phone: string | undefined): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits.slice(-10);
}

export function AccountPage() {
  const navigate = useNavigate();
  const {
    user,
    verifiedPhone,
    customerName,
    customerEmail,
    customerMarketingConsent,
    phoneAccount,
    isCustomerAuthenticated,
    customerProfile,
    addresses,
    notifications,
    orders,
    payments,
    setDltPhoneSession,
    getApiAuthHeaders,
    logout,
  } = useApp();

  const [nameInput, setNameInput] = useState(customerProfile?.name || customerName || '');
  const [mobileDigitsInput, setMobileDigitsInput] = useState(
    extractIndianDigits(verifiedPhone || customerProfile?.phone)
  );
  const [emailInput, setEmailInput] = useState(customerProfile?.email || customerEmail || '');
  const [marketingConsentInput, setMarketingConsentInput] = useState(customerMarketingConsent);

  const profileInitializedRef = useRef({
    name: Boolean(customerProfile?.name || customerName),
    phone: Boolean(verifiedPhone || customerProfile?.phone),
    email: Boolean(customerProfile?.email || customerEmail),
    consent: typeof customerProfile?.marketingConsent === 'boolean',
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedMsg, setProfileSavedMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  useEffect(() => {
    if (!profileInitializedRef.current.name) {
      const resolvedName = customerProfile?.name || customerName;
      if (resolvedName) {
        setNameInput(resolvedName);
        profileInitializedRef.current.name = true;
      }
    }
    if (!profileInitializedRef.current.phone) {
      const resolvedDigits = extractIndianDigits(verifiedPhone || customerProfile?.phone);
      if (resolvedDigits.length === 10) {
        setMobileDigitsInput(resolvedDigits);
        profileInitializedRef.current.phone = true;
      }
    }
    if (!profileInitializedRef.current.email) {
      const resolvedEmail = customerProfile?.email || customerEmail;
      if (resolvedEmail) {
        setEmailInput(resolvedEmail);
        profileInitializedRef.current.email = true;
      }
    }
    if (!profileInitializedRef.current.consent) {
      if (
        typeof customerProfile?.marketingConsent === 'boolean' ||
        typeof phoneAccount?.marketingConsent === 'boolean'
      ) {
        setMarketingConsentInput(customerMarketingConsent);
        profileInitializedRef.current.consent = true;
      }
    }
  }, [
    customerProfile?.name,
    customerProfile?.phone,
    customerProfile?.email,
    customerProfile?.marketingConsent,
    phoneAccount?.marketingConsent,
    customerName,
    customerEmail,
    customerMarketingConsent,
    verifiedPhone,
  ]);

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrCommunity, setAddrCommunity] = useState<CommunityType>('brigade_eldorado');
  const [addrApartment, setAddrApartment] = useState('Brigade Eldorado');
  const [addrTower, setAddrTower] = useState('');
  const [addrFlat, setAddrFlat] = useState('');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [savingAddr, setSavingAddr] = useState(false);

  // Desktop inline edit saved address state
  const [editingAddr, setEditingAddr] = useState<CustomerAddress | null>(null);
  const [editLabel, setEditLabel] = useState('Home');
  const [editCommunity, setEditCommunity] = useState<CommunityType>('brigade_eldorado');
  const [editApartment, setEditApartment] = useState('');
  const [editTower, setEditTower] = useState('');
  const [editFlat, setEditFlat] = useState('');
  const [editLandmark, setEditLandmark] = useState('');
  const [savingEditAddr, setSavingEditAddr] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileSavedMsg('');
    setProfileErrorMsg('');

    const nextName = nameInput.trim();
    const cleanedMobile = mobileDigitsInput.replace(/\D/g, '');
    const nextEmail = emailInput.trim().toLowerCase();

    if (!nextName) {
      setProfileErrorMsg('Please enter your full name.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanedMobile)) {
      setProfileErrorMsg('Please enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nextEmail)) {
      setProfileErrorMsg('Please enter a valid email address.');
      return;
    }

    setSavingProfile(true);
    try {
      const headers = await getApiAuthHeaders();
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          name: nextName,
          mobile: `+91${cleanedMobile}`,
          email: nextEmail,
          marketingConsent: marketingConsentInput,
        }),
      });

      const raw = await res.text();
      let data: {
        updated?: boolean;
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
          setProfileErrorMsg(`Unexpected server response (HTTP ${res.status}). Please try again.`);
          return;
        }
      }

      if (!res.ok || !data.updated || !data.phone || !data.sessionToken) {
        setProfileErrorMsg(data.error || `Unable to update profile (HTTP ${res.status}).`);
        return;
      }

      setDltPhoneSession({
        phone: data.phone,
        name: data.name || nextName,
        email: data.email || nextEmail || undefined,
        sessionToken: data.sessionToken,
      });
      setMobileDigitsInput(extractIndianDigits(data.phone));
      setProfileSavedMsg('Account details updated.');
    } catch (err) {
      setProfileErrorMsg(
        err instanceof Error && err.message
          ? `Unable to update profile: ${err.message}`
          : 'Unable to reach server. Please try again.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !addrApartment.trim()) return;
    setSavingAddr(true);
    const id = `addr_${Date.now()}`;
    try {
      await setDoc(doc(db, 'customers', user.uid, 'addresses', id), {
        id,
        customerId: user.uid,
        label: addrLabel.trim().slice(0, 40) || 'Home',
        recipientName: (customerProfile?.name || nameInput || 'Customer').slice(0, 100),
        phone: (verifiedPhone || customerProfile?.phone || '').slice(0, 20),
        community: addrCommunity,
        apartmentName: addrApartment.trim().slice(0, 120),
        blockOrTower: addrTower.trim().slice(0, 60),
        flatNumber: addrFlat.trim().slice(0, 40),
        landmark: addrLandmark.trim().slice(0, 120),
        isDefault: addresses.length === 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowAddressForm(false);
      setAddrTower('');
      setAddrFlat('');
      setAddrLandmark('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `customers/${user.uid}/addresses/${id}`);
    } finally {
      setSavingAddr(false);
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

  const handleSaveEditedAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingAddr || !editApartment.trim()) return;
    setSavingEditAddr(true);
    try {
      await updateDoc(doc(db, 'customers', user.uid, 'addresses', editingAddr.id), {
        label: editLabel.trim().slice(0, 40) || 'Home',
        recipientName: (customerProfile?.name || nameInput || 'Customer').slice(0, 100),
        phone: (verifiedPhone || customerProfile?.phone || '').slice(0, 20),
        community: editCommunity,
        apartmentName: editApartment.trim().slice(0, 120),
        blockOrTower: editTower.trim().slice(0, 60),
        flatNumber: editFlat.trim().slice(0, 40),
        landmark: editLandmark.trim().slice(0, 120),
        isDefault: Boolean(editingAddr.isDefault),
        updatedAt: serverTimestamp(),
      });
      setEditingAddr(null);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `customers/${user.uid}/addresses/${editingAddr.id}`
      );
    } finally {
      setSavingEditAddr(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'customers', user.uid, 'addresses', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `customers/${user.uid}/addresses/${id}`);
    }
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'customers', user.uid, 'notifications', notifId), {
        read: true,
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `customers/${user.uid}/notifications/${notifId}`
      );
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!isCustomerAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14 text-center space-y-5">
        <BrandLogo className="h-20 w-auto mx-auto" />
        <h1 className="text-2xl font-bold text-zinc-900">Sign In or Create an Account</h1>
        <p className="text-sm text-zinc-600">
          Log in or create a ZAIKORA KITCHENS account to manage your profile, mobile number, saved addresses, order tracking, and payment history.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/login?redirect=/account"
            className="inline-block px-6 py-3 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/login?mode=register&redirect=/account"
            className="inline-block px-6 py-3 bg-[#0A0A0B] text-white font-semibold text-sm rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Create Account
          </Link>
        </div>
      </div>
    );
  }

  const totalTimesOrdered = Math.max(orders.length, phoneAccount?.orderCount ?? 0);
  const totalTimesSignedIn = phoneAccount?.loginCount ?? 1;

  return (
    <>
      <MobileAccountView
        nameInput={nameInput}
        onNameInputChange={setNameInput}
        mobileDigitsInput={mobileDigitsInput}
        onMobileDigitsInputChange={setMobileDigitsInput}
        emailInput={emailInput}
        onEmailInputChange={setEmailInput}
        marketingConsentInput={marketingConsentInput}
        onMarketingConsentInputChange={setMarketingConsentInput}
        savingProfile={savingProfile}
        profileSavedMsg={profileSavedMsg}
        profileErrorMsg={profileErrorMsg}
        onSaveProfile={handleSaveProfile}
        showAddressForm={showAddressForm}
        onToggleAddressForm={() => setShowAddressForm((p) => !p)}
        addrLabel={addrLabel}
        onAddrLabelChange={setAddrLabel}
        addrCommunity={addrCommunity}
        onAddrCommunityChange={setAddrCommunity}
        addrApartment={addrApartment}
        onAddrApartmentChange={setAddrApartment}
        addrTower={addrTower}
        onAddrTowerChange={setAddrTower}
        addrFlat={addrFlat}
        onAddrFlatChange={setAddrFlat}
        addrLandmark={addrLandmark}
        onAddrLandmarkChange={setAddrLandmark}
        savingAddr={savingAddr}
        onSaveAddress={handleSaveAddress}
        onDeleteAddress={handleDeleteAddress}
        onMarkNotificationRead={handleMarkNotificationRead}
        onLogout={handleLogout}
        totalTimesOrdered={totalTimesOrdered}
        totalTimesSignedIn={totalTimesSignedIn}
      />
      <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200">
        <div className="flex items-center gap-4">
          <BrandLogo className="h-14 w-auto rounded-lg" />
          <div>
            <p className="text-xs font-medium tracking-widest text-[#D97706]">{BRAND_NAME}</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              {customerName || 'My Account'}
            </h1>
            <p className="text-xs text-zinc-600 mt-0.5 flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold text-zinc-900">Mobile: {verifiedPhone}</span>
              {customerEmail && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{customerEmail}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>
                Ordered: <strong>{totalTimesOrdered} {totalTimesOrdered === 1 ? 'time' : 'times'}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Signed in: <strong>{totalTimesSignedIn} {totalTimesSignedIn === 1 ? 'time' : 'times'}</strong>
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/orders"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-zinc-300 text-zinc-800 text-xs font-semibold rounded-lg hover:border-zinc-500"
          >
            <Package className="w-4 h-4 text-[#D97706]" />
            <span>My Orders ({totalTimesOrdered} {totalTimesOrdered === 1 ? 'time' : 'times'})</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Profile & Saved Addresses */}
        <div className="lg:col-span-6 space-y-6">
          {/* Edit Account Details */}
          <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#D97706]" />
                <h2 className="text-lg font-bold text-zinc-900">Edit Account Details</h2>
              </div>
              <span className="text-[11px] text-zinc-500">Name · Mobile · Email</span>
            </div>

            {profileErrorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{profileErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label htmlFor="account-full-name" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Full Name *
                </label>
                <input
                  id="account-full-name"
                  type="text"
                  required
                  maxLength={100}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:border-[#E88D14]"
                />
              </div>

              <div>
                <label htmlFor="account-mobile-number" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Mobile Number (+91) *
                </label>
                <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                  <span className="px-3.5 py-2.5 bg-zinc-100 text-zinc-700 font-mono text-sm border-r border-zinc-300 select-none inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-zinc-500" />
                    +91
                  </span>
                  <input
                    id="account-mobile-number"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    required
                    value={mobileDigitsInput}
                    onChange={(e) =>
                      setMobileDigitsInput(e.target.value.replace(/\D/g, '').slice(0, 10))
                    }
                    placeholder="98XXXXXXXX"
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono tabular-nums focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  You can update your mobile number anytime; your 4-digit password and order history stay linked.
                </p>
              </div>

              <div>
                <label htmlFor="account-email" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Email Address
                </label>
                <input
                  id="account-email"
                  type="email"
                  maxLength={160}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:border-[#E88D14]"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-200 bg-zinc-50 text-xs text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingConsentInput}
                  onChange={(e) => setMarketingConsentInput(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-300 text-[#E88D14] focus:ring-[#E88D14]"
                />
                <span>
                  Receive optional promotional offers and updates via WhatsApp, phone calls, and email.
                </span>
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black transition-colors disabled:opacity-60"
                >
                  {savingProfile ? 'Saving Changes...' : 'Save Account Changes'}
                </button>
                {profileSavedMsg && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {profileSavedMsg}
                  </span>
                )}
              </div>
            </form>
          </section>

          {/* Saved Addresses (Add / Edit / Delete) */}
          <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#D97706]" />
                <h2 className="text-lg font-bold text-zinc-900">Saved Addresses</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddressForm((p) => !p)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-200"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Address</span>
              </button>
            </div>

            {showAddressForm && (
              <form
                onSubmit={handleSaveAddress}
                className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">Label</label>
                    <input
                      type="text"
                      maxLength={40}
                      value={addrLabel}
                      onChange={(e) => setAddrLabel(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">Zone</label>
                    <select
                      value={addrCommunity}
                      onChange={(e) => {
                        const val = e.target.value as CommunityType;
                        setAddrCommunity(val);
                        if (val === 'brigade_eldorado') setAddrApartment('Brigade Eldorado');
                      }}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                    >
                      <option value="brigade_eldorado">Within Brigade Eldorado</option>
                      <option value="outside_eldorado">Outside Brigade Eldorado (Main Gate)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Apartment Name *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={addrApartment}
                      onChange={(e) => setAddrApartment(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">Tower/Block</label>
                    <input
                      type="text"
                      maxLength={60}
                      value={addrTower}
                      onChange={(e) => setAddrTower(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">Flat No.</label>
                    <input
                      type="text"
                      maxLength={40}
                      value={addrFlat}
                      onChange={(e) => setAddrFlat(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">Landmark</label>
                    <input
                      type="text"
                      maxLength={120}
                      value={addrLandmark}
                      onChange={(e) => setAddrLandmark(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingAddr}
                    className="px-4 py-2 bg-[#E88D14] text-black text-xs font-semibold rounded-lg"
                  >
                    {savingAddr ? 'Saving...' : 'Save Address'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddressForm(false)}
                    className="px-4 py-2 text-xs text-zinc-600"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {addresses.length === 0 ? (
              <p className="text-xs text-zinc-500">No saved addresses yet.</p>
            ) : (
              <div className="space-y-3">
                {addresses.map((addr) => (
                  <div key={addr.id} className="p-4 border border-zinc-200 rounded-xl">
                    {editingAddr?.id === addr.id ? (
                      <form onSubmit={handleSaveEditedAddress} className="space-y-3">
                        <p className="text-xs font-bold text-zinc-900">Edit Saved Address</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-zinc-700 mb-1">
                              Label
                            </label>
                            <input
                              type="text"
                              maxLength={40}
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-700 mb-1">
                              Zone
                            </label>
                            <select
                              value={editCommunity}
                              onChange={(e) => {
                                const val = e.target.value as CommunityType;
                                setEditCommunity(val);
                                if (val === 'brigade_eldorado') {
                                  setEditApartment('Brigade Eldorado');
                                }
                              }}
                              className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                            >
                              <option value="brigade_eldorado">Within Brigade Eldorado</option>
                              <option value="outside_eldorado">
                                Outside Brigade Eldorado (Main Gate)
                              </option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-zinc-700 mb-1">
                              Apartment Name *
                            </label>
                            <input
                              type="text"
                              required
                              maxLength={120}
                              value={editApartment}
                              onChange={(e) => setEditApartment(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-700 mb-1">
                              Tower/Block
                            </label>
                            <input
                              type="text"
                              maxLength={60}
                              value={editTower}
                              onChange={(e) => setEditTower(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-700 mb-1">
                              Flat No.
                            </label>
                            <input
                              type="text"
                              maxLength={40}
                              value={editFlat}
                              onChange={(e) => setEditFlat(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-zinc-700 mb-1">
                              Landmark
                            </label>
                            <input
                              type="text"
                              maxLength={120}
                              value={editLandmark}
                              onChange={(e) => setEditLandmark(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={savingEditAddr}
                            className="px-4 py-2 bg-[#E88D14] text-black text-xs font-semibold rounded-lg"
                          >
                            {savingEditAddr ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAddr(null)}
                            className="px-4 py-2 text-xs text-zinc-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-zinc-900">
                            {addr.label} ·{' '}
                            {addr.community === 'brigade_eldorado'
                              ? 'Within Brigade Eldorado'
                              : 'Outside Brigade Eldorado (Main Gate Only)'}
                          </p>
                          <p className="text-zinc-600">
                            {addr.apartmentName}
                            {addr.blockOrTower ? `, ${addr.blockOrTower}` : ''}
                            {addr.flatNumber ? `, Flat ${addr.flatNumber}` : ''}
                            {addr.landmark ? ` (${addr.landmark})` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditAddress(addr)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                            aria-label={`Edit address ${addr.label}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.id)}
                            className="text-zinc-400 hover:text-red-600"
                            aria-label="Delete address"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Notifications & Payment History */}
        <div className="lg:col-span-6 space-y-6">
          {/* In-Website Notifications */}
          <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#D97706]" />
              <h2 className="text-lg font-bold text-zinc-900">
                Notifications ({notifications.length})
              </h2>
            </div>

            {notifications.length === 0 ? (
              <p className="text-xs text-zinc-500">No order notifications yet.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                      n.read ? 'bg-zinc-50 border-zinc-200' : 'bg-amber-50/50 border-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900">{n.title}</span>
                      <span className="font-mono text-zinc-500">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="text-zinc-700">{n.message}</p>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-zinc-500">
                        In-website notification
                      </span>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => handleMarkNotificationRead(n.id)}
                          className="text-[11px] font-semibold text-[#D97706] hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Payment History */}
          <section className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#D97706]" />
              <h2 className="text-lg font-bold text-zinc-900">Payment History</h2>
            </div>

            {payments.length === 0 ? (
              <p className="text-xs text-zinc-500">No payment transactions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-zinc-200 text-zinc-500">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Order</th>
                      <th className="py-2 pr-3 font-medium">Amount</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 font-medium">Razorpay ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {payments.map((pay) => (
                      <tr key={pay.paymentId}>
                        <td className="py-2.5 pr-3 font-mono">
                          <Link
                            to={`/track/${pay.orderId}`}
                            className="text-[#D97706] hover:underline"
                          >
                            {pay.orderId}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3 font-mono tabular-nums font-semibold">
                          {formatRupees(pay.amount)}
                        </td>
                        <td className="py-2.5 pr-3 uppercase font-semibold">{pay.status}</td>
                        <td className="py-2.5 font-mono text-zinc-500">
                          {pay.razorpayPaymentId || 'Pending'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
      </div>
    </>
  );
}
