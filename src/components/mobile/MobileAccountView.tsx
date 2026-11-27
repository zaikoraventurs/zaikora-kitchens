import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
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
import { useApp } from '../../context/AppContext';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { formatDateTime, formatRupees } from '../../lib/pricing';
import type { CommunityType, CustomerAddress } from '../../types';

interface MobileAccountViewProps {
  nameInput: string;
  onNameInputChange: (val: string) => void;
  mobileDigitsInput: string;
  onMobileDigitsInputChange: (val: string) => void;
  emailInput: string;
  onEmailInputChange: (val: string) => void;
  marketingConsentInput: boolean;
  onMarketingConsentInputChange: (val: boolean) => void;
  savingProfile: boolean;
  profileSavedMsg: string;
  profileErrorMsg: string;
  onSaveProfile: (e: React.FormEvent) => void;
  showAddressForm: boolean;
  onToggleAddressForm: () => void;
  addrLabel: string;
  onAddrLabelChange: (val: string) => void;
  addrCommunity: CommunityType;
  onAddrCommunityChange: (val: CommunityType) => void;
  addrApartment: string;
  onAddrApartmentChange: (val: string) => void;
  addrTower: string;
  onAddrTowerChange: (val: string) => void;
  addrFlat: string;
  onAddrFlatChange: (val: string) => void;
  addrLandmark: string;
  onAddrLandmarkChange: (val: string) => void;
  savingAddr: boolean;
  onSaveAddress: (e: React.FormEvent) => void;
  onDeleteAddress: (id: string) => void;
  onMarkNotificationRead: (id: string) => void;
  onLogout: () => void;
  totalTimesOrdered: number;
  totalTimesSignedIn: number;
}

export function MobileAccountView({
  nameInput,
  onNameInputChange,
  mobileDigitsInput,
  onMobileDigitsInputChange,
  emailInput,
  onEmailInputChange,
  marketingConsentInput,
  onMarketingConsentInputChange,
  savingProfile,
  profileSavedMsg,
  profileErrorMsg,
  onSaveProfile,
  showAddressForm,
  onToggleAddressForm,
  addrLabel,
  onAddrLabelChange,
  addrCommunity,
  onAddrCommunityChange,
  addrApartment,
  onAddrApartmentChange,
  addrTower,
  onAddrTowerChange,
  addrFlat,
  onAddrFlatChange,
  addrLandmark,
  onAddrLandmarkChange,
  savingAddr,
  onSaveAddress,
  onDeleteAddress,
  onMarkNotificationRead,
  onLogout,
  totalTimesOrdered,
  totalTimesSignedIn,
}: MobileAccountViewProps) {
  const {
    user,
    verifiedPhone,
    customerName,
    customerEmail,
    customerProfile,
    addresses,
    notifications,
    payments,
  } = useApp();

  const [editingAddr, setEditingAddr] = useState<CustomerAddress | null>(null);
  const [editLabel, setEditLabel] = useState('Home');
  const [editCommunity, setEditCommunity] = useState<CommunityType>('brigade_eldorado');
  const [editApartment, setEditApartment] = useState('');
  const [editTower, setEditTower] = useState('');
  const [editFlat, setEditFlat] = useState('');
  const [editLandmark, setEditLandmark] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (addr: CustomerAddress) => {
    setEditingAddr(addr);
    setEditLabel(addr.label || 'Home');
    setEditCommunity(addr.community);
    setEditApartment(addr.apartmentName || '');
    setEditTower(addr.blockOrTower || '');
    setEditFlat(addr.flatNumber || '');
    setEditLandmark(addr.landmark || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingAddr || !editApartment.trim()) return;
    setSavingEdit(true);
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
      setSavingEdit(false);
    }
  };

  return (
    <div className="md:hidden px-3.5 pt-4 pb-8 space-y-5">
      {/* Compact Account Summary Header */}
      <div className="bg-[#0A0A0B] text-white rounded-2xl p-4 border border-zinc-800 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-widest text-[#E88D14]">
              CUSTOMER ACCOUNT
            </p>
            <h1 className="text-lg font-bold text-white truncate mt-0.5">
              {customerName || 'My Account'}
            </h1>
            <p className="text-xs font-mono text-zinc-300 mt-0.5">{verifiedPhone}</p>
            {customerEmail && (
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">{customerEmail}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[40px] px-3 bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 shrink-0 active:bg-red-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-zinc-800 text-xs">
          <div className="bg-zinc-900/90 rounded-lg px-3 py-2">
            <p className="text-[11px] text-zinc-400">Orders Placed</p>
            <p className="text-sm font-bold font-mono tabular-nums text-white mt-0.5">
              {totalTimesOrdered}
            </p>
          </div>
          <div className="bg-zinc-900/90 rounded-lg px-3 py-2">
            <p className="text-[11px] text-zinc-400">Total Sign-Ins</p>
            <p className="text-sm font-bold font-mono tabular-nums text-white mt-0.5">
              {totalTimesSignedIn}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          to="/orders"
          className="bg-white border border-zinc-200 rounded-xl p-3.5 flex items-center justify-between gap-2 active:border-[#E88D14]"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Package className="w-4 h-4 text-[#D97706] shrink-0" />
            <span className="text-xs font-bold text-zinc-900 truncate">My Orders</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
        </Link>
        <Link
          to="/track"
          className="bg-white border border-zinc-200 rounded-xl p-3.5 flex items-center justify-between gap-2 active:border-[#E88D14]"
        >
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-[#D97706] shrink-0" />
            <span className="text-xs font-bold text-zinc-900 truncate">Track Order</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
        </Link>
      </div>

      {/* Edit Account Details */}
      <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-[#D97706]" />
          <h2 className="text-sm font-bold text-zinc-900">Edit Account Details</h2>
        </div>

        {profileErrorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{profileErrorMsg}</span>
          </div>
        )}

        <form onSubmit={onSaveProfile} className="space-y-3">
          <div>
            <label htmlFor="m-account-name" className="block text-xs font-semibold text-zinc-700 mb-1">
              Full Name *
            </label>
            <input
              id="m-account-name"
              type="text"
              required
              maxLength={100}
              value={nameInput}
              onChange={(e) => onNameInputChange(e.target.value)}
              placeholder="Enter your full name"
              className="w-full min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base"
            />
          </div>
          <div>
            <label htmlFor="m-account-mobile" className="block text-xs font-semibold text-zinc-700 mb-1">
              Mobile Number (+91) *
            </label>
            <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
              <span className="px-3 min-h-[44px] bg-zinc-100 text-zinc-700 font-mono text-sm border-r border-zinc-300 select-none inline-flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-zinc-500" />
                +91
              </span>
              <input
                id="m-account-mobile"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                value={mobileDigitsInput}
                onChange={(e) =>
                  onMobileDigitsInputChange(e.target.value.replace(/\D/g, '').slice(0, 10))
                }
                placeholder="98XXXXXXXX"
                className="flex-1 min-h-[44px] px-3 py-2 text-base font-mono tabular-nums focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="m-account-email" className="block text-xs font-semibold text-zinc-700 mb-1">
              Email Address
            </label>
            <input
              id="m-account-email"
              type="email"
              maxLength={160}
              value={emailInput}
              onChange={(e) => onEmailInputChange(e.target.value)}
              placeholder="you@example.com"
              className="w-full min-h-[44px] px-3 py-2 border border-zinc-300 rounded-lg text-base"
            />
          </div>
          <label className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-200 bg-zinc-50 text-xs text-zinc-700 cursor-pointer">
            <input
              type="checkbox"
              checked={marketingConsentInput}
              onChange={(e) => onMarketingConsentInputChange(e.target.checked)}
              className="mt-0.5 rounded border-zinc-300 text-[#E88D14]"
            />
            <span>
              Optional: Receive promotional offers via WhatsApp, phone calls, and email.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingProfile}
              className="min-h-[42px] px-4 bg-[#0A0A0B] text-white text-xs font-bold rounded-lg active:bg-[#E88D14] active:text-black disabled:opacity-60"
            >
              {savingProfile ? 'Saving...' : 'Save Account Changes'}
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
      <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#D97706]" />
            <h2 className="text-sm font-bold text-zinc-900">Saved Addresses</h2>
          </div>
          <button
            type="button"
            onClick={onToggleAddressForm}
            className="min-h-[36px] inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-100 text-zinc-900 text-xs font-semibold rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>

        {showAddressForm && (
          <form
            onSubmit={onSaveAddress}
            className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2.5"
          >
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Label</label>
              <input
                type="text"
                maxLength={40}
                value={addrLabel}
                onChange={(e) => onAddrLabelChange(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-zinc-300 rounded-lg text-base"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Zone</label>
              <select
                value={addrCommunity}
                onChange={(e) => {
                  const val = e.target.value as CommunityType;
                  onAddrCommunityChange(val);
                  if (val === 'brigade_eldorado') onAddrApartmentChange('Brigade Eldorado');
                }}
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-zinc-300 rounded-lg text-base"
              >
                <option value="brigade_eldorado">Within Brigade Eldorado</option>
                <option value="outside_eldorado">Outside Brigade Eldorado (Main Gate)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Apartment Name *
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={addrApartment}
                onChange={(e) => onAddrApartmentChange(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-zinc-300 rounded-lg text-base"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Tower/Block</label>
                <input
                  type="text"
                  maxLength={60}
                  value={addrTower}
                  onChange={(e) => onAddrTowerChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-zinc-300 rounded-lg text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Flat No.</label>
                <input
                  type="text"
                  maxLength={40}
                  value={addrFlat}
                  onChange={(e) => onAddrFlatChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-zinc-300 rounded-lg text-base"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Landmark</label>
              <input
                type="text"
                maxLength={120}
                value={addrLandmark}
                onChange={(e) => onAddrLandmarkChange(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-zinc-300 rounded-lg text-base"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={savingAddr}
                className="min-h-[40px] px-4 bg-[#E88D14] text-black text-xs font-bold rounded-lg"
              >
                {savingAddr ? 'Saving...' : 'Save Address'}
              </button>
              <button
                type="button"
                onClick={onToggleAddressForm}
                className="min-h-[40px] px-4 text-xs text-zinc-600"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {addresses.length === 0 ? (
          <p className="text-xs text-zinc-500">No saved addresses yet.</p>
        ) : (
          <div className="space-y-2.5">
            {addresses.map((addr) => (
              <div key={addr.id} className="p-3 border border-zinc-200 rounded-xl">
                {editingAddr?.id === addr.id ? (
                  <form onSubmit={handleSaveEdit} className="space-y-2.5">
                    <p className="text-xs font-bold text-zinc-900">Edit Address</p>
                    <input
                      type="text"
                      maxLength={40}
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Label"
                      className="w-full min-h-[40px] px-3 py-1.5 border border-zinc-300 rounded-lg text-base"
                    />
                    <select
                      value={editCommunity}
                      onChange={(e) => {
                        const v = e.target.value as CommunityType;
                        setEditCommunity(v);
                        if (v === 'brigade_eldorado') setEditApartment('Brigade Eldorado');
                      }}
                      className="w-full min-h-[40px] px-3 py-1.5 border border-zinc-300 rounded-lg text-base"
                    >
                      <option value="brigade_eldorado">Within Brigade Eldorado</option>
                      <option value="outside_eldorado">Outside Brigade Eldorado (Main Gate)</option>
                    </select>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={editApartment}
                      onChange={(e) => setEditApartment(e.target.value)}
                      placeholder="Apartment Name *"
                      className="w-full min-h-[40px] px-3 py-1.5 border border-zinc-300 rounded-lg text-base"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        maxLength={60}
                        value={editTower}
                        onChange={(e) => setEditTower(e.target.value)}
                        placeholder="Tower / Block"
                        className="w-full min-h-[40px] px-3 py-1.5 border border-zinc-300 rounded-lg text-base"
                      />
                      <input
                        type="text"
                        maxLength={40}
                        value={editFlat}
                        onChange={(e) => setEditFlat(e.target.value)}
                        placeholder="Flat No."
                        className="w-full min-h-[40px] px-3 py-1.5 border border-zinc-300 rounded-lg text-base"
                      />
                    </div>
                    <input
                      type="text"
                      maxLength={120}
                      value={editLandmark}
                      onChange={(e) => setEditLandmark(e.target.value)}
                      placeholder="Landmark"
                      className="w-full min-h-[40px] px-3 py-1.5 border border-zinc-300 rounded-lg text-base"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={savingEdit}
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
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs space-y-0.5 min-w-0">
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
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(addr)}
                        aria-label={`Edit address ${addr.label}`}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 active:text-zinc-900"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAddress(addr.id)}
                        aria-label="Delete address"
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-400 active:text-red-600"
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

      {/* Notifications */}
      <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#D97706]" />
          <h2 className="text-sm font-bold text-zinc-900">
            Notifications ({notifications.length})
          </h2>
        </div>

        {notifications.length === 0 ? (
          <p className="text-xs text-zinc-500">No order notifications yet.</p>
        ) : (
          <div className="space-y-2.5 max-h-72 overflow-y-auto">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  n.read ? 'bg-zinc-50 border-zinc-200' : 'bg-amber-50/60 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-zinc-900">{n.title}</span>
                  <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                    {formatDateTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-zinc-700">{n.message}</p>
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => onMarkNotificationRead(n.id)}
                    className="text-xs font-semibold text-[#D97706] underline pt-0.5"
                  >
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Payment History (Mobile Card List) */}
      <section className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#D97706]" />
          <h2 className="text-sm font-bold text-zinc-900">Payment History</h2>
        </div>

        {payments.length === 0 ? (
          <p className="text-xs text-zinc-500">No payment transactions recorded yet.</p>
        ) : (
          <div className="space-y-2.5">
            {payments.map((pay) => (
              <div
                key={pay.paymentId}
                className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <Link
                    to={`/track/${pay.orderId}`}
                    className="font-mono font-semibold text-[#D97706] underline block truncate"
                  >
                    {pay.orderId}
                  </Link>
                  <p className="text-[11px] font-mono text-zinc-500 truncate">
                    {pay.razorpayPaymentId || 'Pending'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono tabular-nums text-zinc-900">
                    {formatRupees(pay.amount)}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-zinc-600">{pay.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Other Kitchen Links */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Link
          to="/contact"
          className="bg-white border border-zinc-200 rounded-xl p-3 text-center font-semibold text-zinc-800"
        >
          Contact
        </Link>
        <Link
          to="/terms"
          className="bg-white border border-zinc-200 rounded-xl p-3 text-center font-semibold text-zinc-800"
        >
          Terms &amp; Conditions
        </Link>
        <Link
          to="/refund-policy"
          className="bg-white border border-zinc-200 rounded-xl p-3 text-center font-semibold text-zinc-800"
        >
          Refund Policy
        </Link>
      </div>
    </div>
  );
}
