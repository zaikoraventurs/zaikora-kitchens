import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Gift,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { BRAND_NAME, DEFAULT_CHECKOUT_CHARGES, DEFAULT_SETTINGS } from '../../data/catalog';
import { db } from '../../lib/firebase';
import { stripUndefinedFields } from '../../lib/inventory';
import { computeCheckoutChargesSummary, formatRupees } from '../../lib/pricing';
import type {
  CheckoutChargeAppliesOn,
  CheckoutChargeRecord,
  CheckoutChargeType,
  RestaurantSettings,
} from '../../types';

interface CheckoutChargesManagerProps {
  checkoutCharges: CheckoutChargeRecord[];
  checkoutChargesSynced: boolean;
  settings: RestaurantSettings;
  onNotice: (msg: string) => void;
  onAudit: (action: string, target: string, details: string) => Promise<void>;
}

function slugifyChargeId(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || `charge_${Date.now()}`;
}

function deriveSyncedLegacyFees(charges: CheckoutChargeRecord[]) {
  const deliveryRow = charges.find((c) => c.id === 'delivery');
  const handlingRow = charges.find((c) => c.id === 'handling');
  const deliveryCharge =
    deliveryRow && deliveryRow.enabled && deliveryRow.type === 'fixed'
      ? Math.max(0, Math.round(deliveryRow.amount))
      : 0;
  const handlingCharge =
    handlingRow && handlingRow.enabled && handlingRow.type === 'fixed'
      ? Math.max(0, Math.round(handlingRow.amount))
      : 0;
  return { deliveryCharge, handlingCharge };
}

function buildSettingsSyncPayload(
  settings: RestaurantSettings,
  charges: CheckoutChargeRecord[]
): Record<string, unknown> {
  const { deliveryCharge, handlingCharge } = deriveSyncedLegacyFees(charges);
  return stripUndefinedFields({
    brandName: (settings.brandName || BRAND_NAME).slice(0, 60),
    tagline: (settings.tagline || DEFAULT_SETTINGS.tagline).slice(0, 80),
    whatsappNumber: (settings.whatsappNumber || '').trim().slice(0, 20),
    contactPhone: (settings.contactPhone || '').trim().slice(0, 20),
    contactEmail: (settings.contactEmail || '').trim().slice(0, 120),
    defaultPrepMinutes: Math.min(
      1440,
      Math.max(5, Math.round(Number(settings.defaultPrepMinutes) || DEFAULT_SETTINGS.defaultPrepMinutes))
    ),
    deliveryCharge,
    handlingCharge,
    autoDiscountPerItem: Math.min(
      100,
      Math.max(0, Math.round(Number(settings.autoDiscountPerItem) || 0))
    ),
    isAcceptingOrders: Boolean(settings.isAcceptingOrders),
    checkoutChargesConfigured: true,
    collectionNotice: (settings.collectionNotice || DEFAULT_SETTINGS.collectionNotice).slice(0, 240),
    studioPhone: (settings.studioPhone || '').trim().slice(0, 20),
    studioEmail: (settings.studioEmail || '').trim().slice(0, 120),
    studioInstagram: (settings.studioInstagram || '').trim().slice(0, 200),
    updatedAt: serverTimestamp(),
  });
}

export function CheckoutChargesManager({
  checkoutCharges,
  checkoutChargesSynced,
  settings,
  onNotice,
  onAudit,
}: CheckoutChargesManagerProps) {
  const [draftCharges, setDraftCharges] = useState<CheckoutChargeRecord[]>(checkoutCharges);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Add New Charge form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState<CheckoutChargeType>('fixed');
  const [newAppliesOn, setNewAppliesOn] = useState<CheckoutChargeAppliesOn>('all');
  const [newAmount, setNewAmount] = useState<string>('15');
  const [newEnabled, setNewEnabled] = useState(true);
  const [addingCharge, setAddingCharge] = useState(false);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<CheckoutChargeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Sync draft when live Firestore snapshot changes and admin has no unsaved edits
  useEffect(() => {
    if (!dirty) {
      setDraftCharges(checkoutCharges);
    }
  }, [checkoutCharges, dirty]);

  const updateDraftRow = (id: string, patch: Partial<CheckoutChargeRecord>) => {
    setErrorMsg('');
    setDirty(true);
    setDraftCharges((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const handleMakeFree = (id: string) => {
    setErrorMsg('');
    setDirty(true);
    setDraftCharges((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              amount: 0,
              enabled: true,
            }
          : row
      )
    );
  };

  const validateChargeList = (list: CheckoutChargeRecord[]): string | null => {
    const seenNames = new Set<string>();
    for (const row of list) {
      const cleanName = row.name.trim();
      if (!cleanName) {
        return 'Every charge must have a non-empty display name.';
      }
      if (cleanName.length > 80) {
        return `Charge name "${cleanName}" exceeds 80 characters.`;
      }
      const lower = cleanName.toLowerCase();
      if (seenNames.has(lower)) {
        return `Duplicate charge name "${cleanName}". Each charge name must be unique.`;
      }
      seenNames.add(lower);
      if (!Number.isFinite(row.amount) || row.amount < 0) {
        return `Amount for "${cleanName}" cannot be negative.`;
      }
      if (row.type === 'percentage' && row.amount > 100) {
        return `Percentage charge "${cleanName}" cannot exceed 100%.`;
      }
      if (row.type === 'fixed' && row.amount > 100000) {
        return `Fixed charge "${cleanName}" cannot exceed ₹1,00,000.`;
      }
    }
    return null;
  };

  const persistChargesBatch = async (
    nextCharges: CheckoutChargeRecord[],
    auditAction: string,
    auditDetails: string,
    successText: string
  ) => {
    const validationErr = validateChargeList(nextCharges);
    if (validationErr) {
      setErrorMsg(validationErr);
      return false;
    }

    setErrorMsg('');
    setSaving(true);
    try {
      const existingSnap = await getDocs(collection(db, 'checkout_charges'));
      const existingMap = new Map<string, Record<string, unknown>>();
      for (const docSnap of existingSnap.docs) {
        existingMap.set(docSnap.id, docSnap.data() as Record<string, unknown>);
      }

      const nextIds = new Set(nextCharges.map((c) => c.id));
      const batch = writeBatch(db);

      // Delete any removed docs
      for (const existingId of existingMap.keys()) {
        if (!nextIds.has(existingId)) {
          batch.delete(doc(db, 'checkout_charges', existingId));
        }
      }

      // Upsert current charges cleanly (no undefined fields)
      nextCharges.forEach((charge, idx) => {
        const existingDoc = existingMap.get(charge.id);
        const cleanDesc = (charge.description || '').trim().slice(0, 240);
        const normalizedAmount =
          charge.type === 'percentage'
            ? Math.min(100, Math.max(0, Math.round(charge.amount * 100) / 100))
            : Math.min(100000, Math.max(0, Math.round(charge.amount)));
        const displayOrder = Number.isFinite(charge.displayOrder)
          ? Math.min(10000, Math.max(0, Math.round(charge.displayOrder)))
          : idx + 1;

        const payload: Record<string, unknown> = {
          id: charge.id,
          name: charge.name.trim().slice(0, 80),
          amount: normalizedAmount,
          type: charge.type === 'percentage' ? 'percentage' : 'fixed',
          appliesOn: charge.appliesOn === 'delivery_only' ? 'delivery_only' : 'all',
          enabled: Boolean(charge.enabled),
          displayOrder,
          createdAt: existingDoc?.createdAt ?? charge.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (cleanDesc) {
          payload.description = cleanDesc;
        }
        batch.set(doc(db, 'checkout_charges', charge.id), stripUndefinedFields(payload));
      });

      // Keep restaurant_settings/config in sync & mark checkoutChargesConfigured = true
      batch.set(
        doc(db, 'restaurant_settings', 'config'),
        buildSettingsSyncPayload(settings, nextCharges)
      );

      await batch.commit();
      setDraftCharges(nextCharges);
      setDirty(false);
      await onAudit(auditAction, 'checkout_charges', auditDetails);
      onNotice(successText);
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to save checkout charges to Firestore.';
      setErrorMsg(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveChanges = async () => {
    const sorted = [...draftCharges].sort((a, b) => a.displayOrder - b.displayOrder);
    await persistChargesBatch(
      sorted,
      'UPDATE_CHECKOUT_CHARGES',
      `Saved ${sorted.length} checkout charge configuration(s)`,
      'Checkout charges saved and applied live to cart and checkout.'
    );
  };

  const handleInitializeDefaults = async () => {
    await persistChargesBatch(
      DEFAULT_CHECKOUT_CHARGES,
      'INITIALIZE_CHECKOUT_CHARGES',
      'Initialized default Delivery (₹10) and Handling (₹20) checkout charges',
      'Default checkout charges initialized in Firestore.'
    );
  };

  const handleAddNewCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanName = newName.trim();
    if (!cleanName) {
      setErrorMsg('Please enter a charge name.');
      return;
    }
    const parsedAmount = Number(newAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setErrorMsg('Please enter a valid non-negative charge amount.');
      return;
    }
    if (newType === 'percentage' && parsedAmount > 100) {
      setErrorMsg('Percentage charge cannot exceed 100%.');
      return;
    }
    if (newType === 'fixed' && parsedAmount > 100000) {
      setErrorMsg('Fixed charge cannot exceed ₹1,00,000.');
      return;
    }

    if (draftCharges.some((c) => c.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg(`A charge named "${cleanName}" already exists.`);
      return;
    }

    let candidateId = slugifyChargeId(cleanName);
    const usedIds = new Set(draftCharges.map((c) => c.id));
    if (usedIds.has(candidateId)) {
      candidateId = `${candidateId.slice(0, 40)}_${Date.now().toString(36)}`;
    }

    const maxOrder = draftCharges.reduce((m, c) => Math.max(m, c.displayOrder || 0), 0);
    const createdCharge: CheckoutChargeRecord = {
      id: candidateId,
      name: cleanName.slice(0, 80),
      ...(newDescription.trim() ? { description: newDescription.trim().slice(0, 240) } : {}),
      amount:
        newType === 'percentage'
          ? Math.round(parsedAmount * 100) / 100
          : Math.round(parsedAmount),
      type: newType,
      appliesOn: newAppliesOn,
      enabled: newEnabled,
      displayOrder: maxOrder + 1,
    };

    const nextCharges = [...draftCharges, createdCharge].sort(
      (a, b) => a.displayOrder - b.displayOrder
    );

    setAddingCharge(true);
    const ok = await persistChargesBatch(
      nextCharges,
      'CREATE_CHECKOUT_CHARGE',
      `Added checkout charge "${createdCharge.name}" (${createdCharge.type === 'percentage' ? `${createdCharge.amount}%` : formatRupees(createdCharge.amount)})`,
      `Added "${createdCharge.name}" and published to live checkout.`
    );
    setAddingCharge(false);

    if (ok) {
      setNewName('');
      setNewDescription('');
      setNewType('fixed');
      setNewAppliesOn('all');
      setNewAmount('15');
      setNewEnabled(true);
      setShowAddForm(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const nextCharges = draftCharges.filter((c) => c.id !== deleteTarget.id);
    const ok = await persistChargesBatch(
      nextCharges,
      'DELETE_CHECKOUT_CHARGE',
      `Deleted checkout charge "${deleteTarget.name}" (${deleteTarget.id})`,
      `Deleted charge "${deleteTarget.name}" from checkout.`
    );
    setDeleting(false);
    if (ok) {
      setDeleteTarget(null);
    }
  };

  const stats = useMemo(() => {
    const active = draftCharges.filter((c) => c.enabled);
    const free = active.filter((c) => Number(c.amount) === 0);
    const disabled = draftCharges.filter((c) => !c.enabled);
    const deliveryPreview = computeCheckoutChargesSummary({
      effectiveSubtotal: 300,
      couponDiscount: 0,
      fulfillmentType: 'delivery',
      checkoutCharges: draftCharges,
      chargesConfigured: true,
    });
    const collectionPreview = computeCheckoutChargesSummary({
      effectiveSubtotal: 300,
      couponDiscount: 0,
      fulfillmentType: 'collection',
      checkoutCharges: draftCharges,
      chargesConfigured: true,
    });
    return {
      total: draftCharges.length,
      activeCount: active.length,
      freeCount: free.length,
      disabledCount: disabled.length,
      deliveryPreview,
      collectionPreview,
    };
  }, [draftCharges]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#D97706]" />
            <h2 className="text-xl font-bold text-zinc-900">
              Checkout Charges &amp; Fees Management
            </h2>
          </div>
          <p className="text-xs text-zinc-600 max-w-2xl">
            Configure every fee charged to customers at Cart, Checkout, and Server Payment verification. Changes take effect immediately for all new orders without redeploying.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!checkoutChargesSynced && (
            <button
              type="button"
              disabled={saving}
              onClick={handleInitializeDefaults}
              className="px-4 py-2.5 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 disabled:opacity-50"
            >
              Initialize Defaults in DB
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setErrorMsg('');
              setShowAddForm((prev) => !prev);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-zinc-100 text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-200 border border-zinc-300"
          >
            <Plus className="w-4 h-4" />
            <span>{showAddForm ? 'Close Add Form' : 'Add New Charge'}</span>
          </button>
          {dirty && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setDraftCharges(checkoutCharges);
                setDirty(false);
                setErrorMsg('');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-zinc-300 text-zinc-700 text-xs font-semibold rounded-lg hover:bg-zinc-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveChanges}
            className={`inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 ${
              dirty
                ? 'bg-[#E88D14] text-black hover:bg-[#f39c25] shadow-sm'
                : 'bg-[#0A0A0B] text-white hover:bg-[#E88D14] hover:text-black'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : dirty ? 'Save Changes *' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Unsaved Notice or Error */}
      {!checkoutChargesSynced && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span>
            Showing default Delivery (₹10) and Handling (₹20) charges. Click{' '}
            <strong>Initialize Defaults in DB</strong> or edit and hit <strong>Save Changes</strong> to persist your configuration in Firestore.
          </span>
        </div>
      )}

      {dirty && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-center justify-between gap-3">
          <span className="font-semibold">
            You have unsaved checkout charge changes. Click &ldquo;Save Changes&rdquo; to apply them live to customer checkouts.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3">
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-[11px] font-medium text-zinc-500">Configured Charges</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900 mt-1">
              {stats.total}
            </p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-[11px] font-medium text-zinc-500">Active (Enabled)</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {stats.activeCount}
            </p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-[11px] font-medium text-zinc-500">Marked Free (₹0)</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-[#D97706] mt-1">
              {stats.freeCount}
            </p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-[11px] font-medium text-zinc-500">Disabled (Excluded)</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-zinc-500 mt-1">
              {stats.disabledCount}
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 bg-[#0A0A0B] text-white rounded-xl p-5 border border-zinc-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold tracking-wider uppercase text-[#E88D14]">
              Live Customer Checkout Preview (Sample ₹300 Subtotal)
            </p>
            <span className="text-[11px] text-zinc-400">
              {dirty ? 'Previewing unsaved draft' : 'Matches live checkout'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5">
              <p className="font-bold text-zinc-200">Delivery Order (₹300 subtotal)</p>
              {stats.deliveryPreview.appliedCharges.length === 0 ? (
                <p className="text-zinc-400">No extra charges applied.</p>
              ) : (
                stats.deliveryPreview.appliedCharges.map((c) => (
                  <div key={c.id} className="flex justify-between text-zinc-300">
                    <span>
                      {c.name}
                      {c.type === 'percentage' ? ` (${c.rate}%)` : ''}
                    </span>
                    <span
                      className={`font-mono font-semibold ${
                        c.isFree ? 'text-emerald-400' : 'text-white'
                      }`}
                    >
                      {c.isFree ? 'FREE (₹0)' : formatRupees(c.calculatedAmount)}
                    </span>
                  </div>
                ))
              )}
              <div className="pt-1.5 border-t border-zinc-800 flex justify-between font-bold text-[#E88D14]">
                <span>Customer Total</span>
                <span className="font-mono">
                  {formatRupees(300 + stats.deliveryPreview.chargesTotal)}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5">
              <p className="font-bold text-zinc-200">Self-Collection Order (₹300 subtotal)</p>
              {stats.collectionPreview.appliedCharges.length === 0 ? (
                <p className="text-zinc-400">No extra charges applied.</p>
              ) : (
                stats.collectionPreview.appliedCharges.map((c) => (
                  <div key={c.id} className="flex justify-between text-zinc-300">
                    <span>
                      {c.name}
                      {c.type === 'percentage' ? ` (${c.rate}%)` : ''}
                    </span>
                    <span
                      className={`font-mono font-semibold ${
                        c.isFree ? 'text-emerald-400' : 'text-white'
                      }`}
                    >
                      {c.isFree ? 'FREE (₹0)' : formatRupees(c.calculatedAmount)}
                    </span>
                  </div>
                ))
              )}
              <div className="pt-1.5 border-t border-zinc-800 flex justify-between font-bold text-[#E88D14]">
                <span>Customer Total</span>
                <span className="font-mono">
                  {formatRupees(300 + stats.collectionPreview.chargesTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add New Charge Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddNewCharge}
          className="bg-white border-2 border-[#E88D14] rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-zinc-900">Add New Checkout Charge</h3>
              <p className="text-xs text-zinc-500">
                Create any additional fee (e.g. Packaging Fee, Platform Fee, Rain Surge, Service Charge).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="p-1.5 text-zinc-500 hover:text-zinc-900"
              aria-label="Close Add Charge Form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Charge Name *
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Packaging Charge, Eco Bag Fee, Service Fee"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Charge Type
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as CheckoutChargeType)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white"
              >
                <option value="fixed">Fixed Amount (₹)</option>
                <option value="percentage">Percentage (% of Order)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                {newType === 'percentage' ? 'Rate (%)' : 'Amount (₹)'}
              </label>
              <input
                type="number"
                required
                min={0}
                max={newType === 'percentage' ? 100 : 100000}
                step={newType === 'percentage' ? '0.5' : '1'}
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Optional Description
              </label>
              <input
                type="text"
                maxLength={240}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional note explaining this fee"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Applies To
              </label>
              <select
                value={newAppliesOn}
                onChange={(e) => setNewAppliesOn(e.target.value as CheckoutChargeAppliesOn)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white"
              >
                <option value="all">All Orders (Delivery &amp; Collection)</option>
                <option value="delivery_only">Delivery Orders Only</option>
              </select>
            </div>

            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEnabled}
                  onChange={(e) => setNewEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#E88D14]"
                />
                <span>Enable immediately at checkout</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-xs font-semibold text-zinc-700 border border-zinc-300 rounded-lg hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingCharge || saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-[#E88D14] text-black text-xs font-bold rounded-lg hover:bg-[#f39c25] disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{addingCharge ? 'Adding Charge...' : 'Add Charge & Publish'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Configured Charges List */}
      {draftCharges.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center space-y-3">
          <Receipt className="w-9 h-9 text-zinc-400 mx-auto" />
          <h3 className="text-base font-bold text-zinc-900">No Checkout Charges Configured</h3>
          <p className="text-xs text-zinc-600 max-w-md mx-auto">
            Customers currently pay ₹0 in extra fees. You can add custom charges above or restore the default Delivery (₹10) and Handling (₹20) charges.
          </p>
          <div className="pt-1 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-[#E88D14] text-black text-xs font-bold rounded-lg"
            >
              + Add New Charge
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleInitializeDefaults}
              className="px-4 py-2 bg-zinc-900 text-white text-xs font-semibold rounded-lg"
            >
              Restore Default Charges
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {draftCharges.map((charge) => {
            const isFree = charge.enabled && Number(charge.amount) === 0;
            return (
              <div
                key={charge.id}
                className={`bg-white border rounded-xl p-5 space-y-4 transition-colors ${
                  charge.enabled
                    ? isFree
                      ? 'border-emerald-300 bg-emerald-50/20'
                      : 'border-zinc-200'
                    : 'border-zinc-200 bg-zinc-50/75 opacity-85'
                }`}
              >
                {/* Top Bar: Status Badge + Toggle + Make Free + Delete */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={charge.enabled}
                      onClick={() => updateDraftRow(charge.id, { enabled: !charge.enabled })}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        charge.enabled
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-zinc-200 text-zinc-700 border-zinc-300'
                      }`}
                    >
                      <span>{charge.enabled ? 'ON · Active' : 'OFF · Disabled'}</span>
                    </button>

                    <span className="font-mono text-[11px] px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded">
                      ID: {charge.id}
                    </span>

                    {isFree ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[11px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        Displayed as FREE (₹0)
                      </span>
                    ) : !charge.enabled ? (
                      <span className="text-[11px] font-medium text-zinc-500">
                        Completely excluded from checkout calculations
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleMakeFree(charge.id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        isFree
                          ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                          : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-[#E88D14] hover:text-black hover:border-[#E88D14]'
                      }`}
                    >
                      <Gift className="w-3.5 h-3.5" />
                      <span>{isFree ? 'Free (₹0)' : 'Make Free'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(charge)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-700 bg-white hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Editable Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5">
                  <div className="lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Charge Name *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={charge.name}
                      onChange={(e) => updateDraftRow(charge.id, { name: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-medium bg-white"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Type
                    </label>
                    <select
                      value={charge.type}
                      onChange={(e) =>
                        updateDraftRow(charge.id, {
                          type: e.target.value as CheckoutChargeType,
                        })
                      }
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs bg-white"
                    >
                      <option value="fixed">Fixed (₹)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      {charge.type === 'percentage' ? 'Percentage (%)' : 'Amount (₹)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={charge.type === 'percentage' ? 100 : 100000}
                      step={charge.type === 'percentage' ? '0.5' : '1'}
                      value={charge.amount}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        updateDraftRow(charge.id, {
                          amount: Number.isFinite(val) && val >= 0 ? val : 0,
                        });
                      }}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono tabular-nums font-bold bg-white"
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Applies On
                    </label>
                    <select
                      value={charge.appliesOn}
                      onChange={(e) =>
                        updateDraftRow(charge.id, {
                          appliesOn: e.target.value as CheckoutChargeAppliesOn,
                        })
                      }
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs bg-white"
                    >
                      <option value="all">All Orders (Delivery &amp; Collection)</option>
                      <option value="delivery_only">Delivery Orders Only</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Display Order
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={charge.displayOrder}
                      onChange={(e) =>
                        updateDraftRow(charge.id, {
                          displayOrder: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        })
                      }
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono tabular-nums bg-white"
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-12">
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Optional Description (for internal clarity)
                    </label>
                    <input
                      type="text"
                      maxLength={240}
                      value={charge.description || ''}
                      onChange={(e) =>
                        updateDraftRow(charge.id, { description: e.target.value })
                      }
                      placeholder="Optional description..."
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs bg-white"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Save Bar */}
      {draftCharges.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-600">
            Changes update Firestore, live customer Cart &amp; Checkout, and Razorpay server price verification automatically.
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveChanges}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E88D14] text-black text-xs font-bold rounded-lg hover:bg-[#f39c25] disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : 'Save Changes'}</span>
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-zinc-900">
                  Delete Checkout Charge?
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Are you sure you want to permanently delete{' '}
                  <strong className="text-zinc-900">{deleteTarget.name}</strong>? Customers will no longer see or be charged this fee at checkout.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 border border-zinc-300 rounded-lg hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-700 text-white text-xs font-bold rounded-lg hover:bg-red-800 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
