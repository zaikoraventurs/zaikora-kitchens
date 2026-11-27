import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  History,
  Minus,
  Plus,
  Power,
  RotateCcw,
  Save,
  Search,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  CAKE_SICLES_IMAGE_URL,
  BENTO_CAKE_IMAGE_URL,
  CUSTOM_PARTY_CAKE_IMAGE_URL,
  getDishAuthenticDefaultImage,
} from '../../data/catalog';
import { db } from '../../lib/firebase';
import {
  STOCK_UNIT_OPTIONS,
  clampStockInt,
  getInventoryStatusMeta,
  normalizeInventoryFields,
  sanitizeStockUnit,
} from '../../lib/inventory';
import {
  adjustProductStockDelta,
  resetLimitedStockZero,
  saveProductInventoryBatch,
} from '../../lib/inventoryActions';
import { formatDateTime, formatRupees } from '../../lib/pricing';
import type {
  CakeMenuItem,
  FoodMenuItem,
  StockHistoryAction,
  StockHistoryRecord,
  StockMode,
} from '../../types';
import { FoodImage } from '../ReliableMedia';

interface InventoryManagerTabProps {
  onAudit: (action: string, target: string, details: string) => Promise<void>;
  onNotify: (msg: string) => void;
}

type InventoryFilter =
  | 'all'
  | 'food'
  | 'cake'
  | 'limited'
  | 'low_stock'
  | 'sold_out'
  | 'unavailable';

interface DraftEdit {
  stockMode: StockMode;
  stockQuantity: string;
  stockUnit: string;
  lowStockThreshold: string;
  available: boolean;
  reason: string;
}

interface UnifiedCatalogEntry {
  key: string;
  productType: 'food' | 'cake';
  item: FoodMenuItem | CakeMenuItem;
  categoryLabel: string;
  imageUrl: string;
  derivativeUrl?: string;
  fallbackImage?: string;
}

const ACTION_BADGE_MAP: Record<
  StockHistoryAction,
  { label: string; badgeClass: string }
> = {
  manual_add: {
    label: 'Stock Added',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  manual_reduce: {
    label: 'Stock Reduced',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  manual_edit: {
    label: 'Manual Update',
    badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-300',
  },
  mode_change: {
    label: 'Mode Changed',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  availability_toggle: {
    label: 'Availability',
    badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-300',
  },
  admin_reset: {
    label: 'Reset to 0',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
  },
  order_deduction: {
    label: 'Order Paid',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  order_restore: {
    label: 'Order Refunded',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
  },
};

export function InventoryManagerTab({ onAudit, onNotify }: InventoryManagerTabProps) {
  const { user, foodMenu, cakeMenu, resolveCategoryImage } = useApp();

  const [filter, setFilter] = useState<InventoryFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [drafts, setDrafts] = useState<Record<string, DraftEdit>>({});
  const [customDeltaInputs, setCustomDeltaInputs] = useState<Record<string, string>>({});
  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<{
    key: string;
    kind: 'reset_zero' | 'large_reduce';
    delta?: number;
  } | null>(null);
  const [errorBanner, setErrorBanner] = useState('');

  const [historyRows, setHistoryRows] = useState<StockHistoryRecord[]>([]);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'stock_history'),
      orderBy('createdAt', 'desc'),
      limit(150)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setHistoryRows(snap.docs.map((d) => d.data() as StockHistoryRecord));
        setHistoryError('');
      },
      (err) => {
        setHistoryError(err.message || 'Unable to stream stock history.');
      }
    );
    return () => unsub();
  }, []);

  const entries: UnifiedCatalogEntry[] = useMemo(() => {
    const foodEntries: UnifiedCatalogEntry[] = foodMenu.map((item) => {
      const catFallback = resolveCategoryImage(item.category);
      const authImg = getDishAuthenticDefaultImage(item.id, item.name, item.category);
      return {
        key: `food:${item.id}`,
        productType: 'food',
        item,
        categoryLabel: item.category,
        imageUrl: item.imageUrl || authImg || catFallback.src,
        derivativeUrl:
          item.imageDerivativeUrl || (!item.imageUrl ? catFallback.derivativeSrc : undefined),
        fallbackImage: authImg || catFallback.src,
      };
    });

    const cakeEntries: UnifiedCatalogEntry[] = cakeMenu.map((cake) => {
      const fallback =
        cake.cakeType === 'bento'
          ? BENTO_CAKE_IMAGE_URL
          : cake.cakeType === 'sicle'
          ? CAKE_SICLES_IMAGE_URL
          : CUSTOM_PARTY_CAKE_IMAGE_URL;
      return {
        key: `cake:${cake.id}`,
        productType: 'cake',
        item: cake,
        categoryLabel: `Cakes · ${
          cake.cakeType === 'bento'
            ? 'Bento Cake'
            : cake.cakeType === 'sicle'
            ? 'Cake Sicles'
            : 'Party Cake'
        }`,
        imageUrl: cake.imageUrl || fallback,
        derivativeUrl: cake.imageDerivativeUrl,
        fallbackImage: fallback,
      };
    });

    return [...foodEntries, ...cakeEntries];
  }, [foodMenu, cakeMenu, resolveCategoryImage]);

  const kpis = useMemo(() => {
    let availableCount = 0;
    let limitedCount = 0;
    let lowStockCount = 0;
    let soldOutCount = 0;
    let unavailableCount = 0;

    for (const entry of entries) {
      const norm = normalizeInventoryFields(entry.item, {
        isCake: entry.productType === 'cake',
      });
      const meta = getInventoryStatusMeta(entry.item, {
        isCake: entry.productType === 'cake',
      });
      if (norm.stockMode === 'limited') limitedCount += 1;
      if (meta.code === 'AVAILABLE' || meta.code === 'LOW_STOCK') availableCount += 1;
      if (meta.code === 'LOW_STOCK') lowStockCount += 1;
      if (meta.code === 'SOLD_OUT') soldOutCount += 1;
      if (meta.code === 'UNAVAILABLE') unavailableCount += 1;
    }

    return {
      total: entries.length,
      availableCount,
      limitedCount,
      lowStockCount,
      soldOutCount,
      unavailableCount,
    };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return entries.filter((entry) => {
      const norm = normalizeInventoryFields(entry.item, {
        isCake: entry.productType === 'cake',
      });
      const meta = getInventoryStatusMeta(entry.item, {
        isCake: entry.productType === 'cake',
      });

      if (filter === 'food' && entry.productType !== 'food') return false;
      if (filter === 'cake' && entry.productType !== 'cake') return false;
      if (filter === 'limited' && norm.stockMode !== 'limited') return false;
      if (filter === 'low_stock' && meta.code !== 'LOW_STOCK') return false;
      if (filter === 'sold_out' && meta.code !== 'SOLD_OUT') return false;
      if (filter === 'unavailable' && meta.code !== 'UNAVAILABLE') return false;

      if (!q) return true;
      return (
        entry.item.name.toLowerCase().includes(q) ||
        entry.categoryLabel.toLowerCase().includes(q) ||
        norm.stockUnit.toLowerCase().includes(q) ||
        meta.adminBadge.toLowerCase().includes(q)
      );
    });
  }, [entries, filter, searchTerm]);

  const getDraft = (entry: UnifiedCatalogEntry): DraftEdit => {
    const existing = drafts[entry.key];
    if (existing) return existing;
    const norm = normalizeInventoryFields(entry.item, {
      isCake: entry.productType === 'cake',
    });
    return {
      stockMode: norm.stockMode,
      stockQuantity: String(norm.stockQuantity),
      stockUnit: norm.stockUnit,
      lowStockThreshold: String(norm.lowStockThreshold),
      available: norm.available,
      reason: '',
    };
  };

  const patchDraft = (entry: UnifiedCatalogEntry, patch: Partial<DraftEdit>) => {
    setDrafts((prev) => ({
      ...prev,
      [entry.key]: {
        ...getDraft(entry),
        ...patch,
      },
    }));
  };

  const clearDraft = (key: string) => {
    setDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    if (!user || busyKeys[key]) return;
    setErrorBanner('');
    setBusyKeys((prev) => ({ ...prev, [key]: true }));
    try {
      await fn();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Inventory update failed.');
    } finally {
      setBusyKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSaveDraft = async (entry: UnifiedCatalogEntry) => {
    const draft = getDraft(entry);
    const prevNorm = normalizeInventoryFields(entry.item, {
      isCake: entry.productType === 'cake',
    });
    const nextQty = clampStockInt(draft.stockQuantity, 0);
    const nextThreshold = clampStockInt(draft.lowStockThreshold, prevNorm.lowStockThreshold, 10000);
    const nextUnit = sanitizeStockUnit(draft.stockUnit, entry.item, {
      isCake: entry.productType === 'cake',
    });

    const actionType: StockHistoryAction =
      draft.stockMode !== prevNorm.stockMode
        ? 'mode_change'
        : draft.available !== prevNorm.available && nextQty === prevNorm.stockQuantity
        ? 'availability_toggle'
        : 'manual_edit';

    const defaultReason =
      actionType === 'mode_change'
        ? `Switched to ${draft.stockMode === 'limited' ? `Limited (${nextQty} ${nextUnit})` : 'Unlimited'}`
        : actionType === 'availability_toggle'
        ? draft.available
          ? 'Marked Available in Inventory'
          : 'Marked Manually Unavailable in Inventory'
        : draft.stockMode === 'limited'
        ? `Stock set to ${nextQty} ${nextUnit} (low alert <= ${nextThreshold})`
        : 'Updated inventory settings';

    await withBusy(entry.key, async () => {
      if (!user) return;
      await saveProductInventoryBatch({
        item: entry.item,
        productType: entry.productType,
        actorUid: user.uid,
        stockMode: draft.stockMode,
        stockQuantity: nextQty,
        stockUnit: nextUnit,
        lowStockThreshold: nextThreshold,
        available: draft.available,
        actionType,
        reason: draft.reason.trim() || defaultReason,
      });
      await onAudit(
        'INVENTORY_UPDATE',
        `${entry.productType === 'cake' ? 'cake_menu' : 'food_menu'}/${entry.item.id}`,
        `${entry.item.name}: ${draft.stockMode}, qty=${nextQty} ${nextUnit}, available=${draft.available}`
      );
      clearDraft(entry.key);
      onNotify(`Inventory updated for "${entry.item.name}".`);
    });
  };

  const handleQuickToggleAvailable = async (entry: UnifiedCatalogEntry) => {
    const prevNorm = normalizeInventoryFields(entry.item, {
      isCake: entry.productType === 'cake',
    });
    const nextAvailable = !prevNorm.available;

    await withBusy(entry.key, async () => {
      if (!user) return;
      await saveProductInventoryBatch({
        item: entry.item,
        productType: entry.productType,
        actorUid: user.uid,
        stockMode: prevNorm.stockMode,
        stockQuantity: prevNorm.stockQuantity,
        stockUnit: prevNorm.stockUnit,
        lowStockThreshold: prevNorm.lowStockThreshold,
        available: nextAvailable,
        actionType: 'availability_toggle',
        reason: nextAvailable
          ? 'Admin marked item Available'
          : 'Admin marked item Manually Unavailable',
      });
      await onAudit(
        'INVENTORY_AVAILABILITY',
        `${entry.productType === 'cake' ? 'cake_menu' : 'food_menu'}/${entry.item.id}`,
        `${entry.item.name} -> ${nextAvailable ? 'Available' : 'Manually Unavailable'}`
      );
      clearDraft(entry.key);
      onNotify(
        `"${entry.item.name}" marked ${nextAvailable ? 'Available' : 'Unavailable'}.`
      );
    });
  };

  const handleDeltaAdjust = async (
    entry: UnifiedCatalogEntry,
    delta: number,
    skipConfirm = false
  ) => {
    if (!Number.isFinite(delta) || delta === 0) return;
    if (!skipConfirm && delta <= -5) {
      setConfirmAction({ key: entry.key, kind: 'large_reduce', delta });
      return;
    }

    await withBusy(entry.key, async () => {
      if (!user) return;
      const draft = drafts[entry.key];
      await adjustProductStockDelta({
        item: entry.item,
        productType: entry.productType,
        actorUid: user.uid,
        delta,
        reason: draft?.reason.trim() || undefined,
      });
      await onAudit(
        delta >= 0 ? 'INVENTORY_ADD' : 'INVENTORY_REDUCE',
        `${entry.productType === 'cake' ? 'cake_menu' : 'food_menu'}/${entry.item.id}`,
        `${entry.item.name}: delta ${delta >= 0 ? `+${delta}` : delta}`
      );
      clearDraft(entry.key);
      setCustomDeltaInputs((prev) => ({ ...prev, [entry.key]: '' }));
      setConfirmAction(null);
      onNotify(
        `${delta >= 0 ? 'Added' : 'Reduced'} ${Math.abs(delta)} for "${entry.item.name}".`
      );
    });
  };

  const handleResetZero = async (entry: UnifiedCatalogEntry) => {
    await withBusy(entry.key, async () => {
      if (!user) return;
      await resetLimitedStockZero({
        item: entry.item,
        productType: entry.productType,
        actorUid: user.uid,
      });
      await onAudit(
        'INVENTORY_RESET_ZERO',
        `${entry.productType === 'cake' ? 'cake_menu' : 'food_menu'}/${entry.item.id}`,
        `${entry.item.name} manually reset to 0 (Sold Out)`
      );
      clearDraft(entry.key);
      setConfirmAction(null);
      onNotify(`"${entry.item.name}" stock reset to 0 (Marked Sold Out).`);
    });
  };

  return (
    <div className="space-y-8">
      {errorBanner && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs sm:text-sm text-red-900 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner('')}
            className="text-xs font-semibold text-red-800 underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Inventory Overview KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {[
          { label: 'Total Menu Items', value: kpis.total, accent: 'text-zinc-900' },
          { label: 'Orderable Now', value: kpis.availableCount, accent: 'text-emerald-700' },
          { label: 'Limited Stock Mode', value: kpis.limitedCount, accent: 'text-[#B45309]' },
          { label: 'Low Stock Alerts', value: kpis.lowStockCount, accent: 'text-amber-700' },
          { label: 'Sold Out (0 Left)', value: kpis.soldOutCount, accent: 'text-red-700' },
          {
            label: 'Manually Unavailable',
            value: kpis.unavailableCount,
            accent: 'text-zinc-600',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white border border-zinc-200 rounded-xl p-4 space-y-1"
          >
            <p className="text-[11px] font-medium text-zinc-500">{card.label}</p>
            <p className={`text-2xl font-bold font-mono tabular-nums ${card.accent}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filter & Search Toolbar */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0A0A0B] text-[#E88D14] flex items-center justify-center shrink-0">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">
                Limited Stock &amp; Availability Management
              </h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                Configure Unlimited or Limited Stock per existing item. Sold-out items stay at 0 until you restock them manually (no automatic daily reset).
              </p>
            </div>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search food or cake..."
              className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg text-xs focus:outline-none focus:border-[#E88D14]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(
            [
              { id: 'all', label: `All (${kpis.total})` },
              { id: 'food', label: `Food Menu (${foodMenu.length})` },
              { id: 'cake', label: `Cakes (${cakeMenu.length})` },
              { id: 'limited', label: `Limited Stock (${kpis.limitedCount})` },
              { id: 'low_stock', label: `Low Stock (${kpis.lowStockCount})` },
              { id: 'sold_out', label: `Sold Out (${kpis.soldOutCount})` },
              { id: 'unavailable', label: `Unavailable (${kpis.unavailableCount})` },
            ] as Array<{ id: InventoryFilter; label: string }>
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setFilter(pill.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 transition-colors ${
                filter === pill.id
                  ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                  : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Product Stock Control List */}
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-zinc-300 rounded-xl text-sm text-zinc-500">
            No menu items match the selected filter.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEntries.map((entry) => {
              const norm = normalizeInventoryFields(entry.item, {
                isCake: entry.productType === 'cake',
              });
              const meta = getInventoryStatusMeta(entry.item, {
                isCake: entry.productType === 'cake',
              });
              const draft = getDraft(entry);
              const isBusy = Boolean(busyKeys[entry.key]);
              const isDirty = Boolean(drafts[entry.key]);
              const customDeltaStr = customDeltaInputs[entry.key] || '';
              const customDeltaNum = clampStockInt(customDeltaStr, 0, 10000);
              const isConfirmingHere = confirmAction?.key === entry.key;

              const badgeStyle =
                meta.code === 'SOLD_OUT'
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : meta.code === 'UNAVAILABLE'
                  ? 'bg-zinc-200 text-zinc-700 border-zinc-300'
                  : meta.code === 'LOW_STOCK'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200';

              return (
                <div
                  key={entry.key}
                  className={`border rounded-xl p-4 sm:p-5 space-y-4 ${
                    meta.code === 'SOLD_OUT'
                      ? 'border-red-300 bg-red-50/20'
                      : meta.code === 'LOW_STOCK'
                      ? 'border-amber-300 bg-amber-50/20'
                      : 'border-zinc-200 bg-white'
                  }`}
                >
                  {/* Item Identity & Status Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0">
                        <FoodImage
                          src={entry.imageUrl}
                          derivativeSrc={entry.derivativeUrl}
                          fallbackSrc={entry.fallbackImage}
                          alt={entry.item.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-zinc-900 truncate">
                            {entry.item.name}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold tracking-wide ${badgeStyle}`}
                          >
                            {meta.adminBadge}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500">
                          {entry.categoryLabel} · {entry.item.quantityLabel} ·{' '}
                          <span className="font-mono font-semibold text-zinc-800">
                            {formatRupees(entry.item.originalPrice)}
                          </span>
                        </p>
                        <p className="text-[11px] font-semibold text-zinc-700">
                          Mode:{' '}
                          <span className="font-mono">
                            {norm.stockMode === 'limited' ? 'Limited Stock' : 'Unlimited'}
                          </span>{' '}
                          · Remaining:{' '}
                          <span className="font-mono text-zinc-900">{meta.remainingLabel}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleQuickToggleAvailable(entry)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                          norm.available
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                            : 'bg-zinc-900 border-zinc-900 text-white hover:bg-zinc-800'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>
                          {norm.available ? 'Available (Click to Pause)' : 'Unavailable (Mark Available)'}
                        </span>
                      </button>

                      {norm.stockMode === 'limited' && norm.stockQuantity > 0 && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            setConfirmAction({ key: entry.key, kind: 'reset_zero' })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-red-300 bg-white text-red-700 hover:bg-red-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset to 0</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Confirmation Guard for Reset to 0 or Large Stock Reduction */}
                  {isConfirmingHere && confirmAction && (
                    <div className="p-3 bg-red-50 border border-red-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-950">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <span>
                          {confirmAction.kind === 'reset_zero'
                            ? `Confirm resetting "${entry.item.name}" stock to 0? It will immediately display SOLD OUT to customers.`
                            : `Confirm reducing "${entry.item.name}" stock by ${Math.abs(
                                confirmAction.delta || 0
                              )} units?`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            if (confirmAction.kind === 'reset_zero') {
                              handleResetZero(entry);
                            } else if (typeof confirmAction.delta === 'number') {
                              handleDeltaAdjust(entry, confirmAction.delta, true);
                            }
                          }}
                          className="px-3 py-1.5 bg-red-700 text-white font-bold rounded-lg hover:bg-red-800"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmAction(null)}
                          className="px-3 py-1.5 bg-white border border-zinc-300 text-zinc-700 font-semibold rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Configuration Controls Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-2 border-t border-zinc-100">
                    {/* Stock Mode */}
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Stock Mode
                      </label>
                      <div className="grid grid-cols-2 gap-1 bg-zinc-100 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => patchDraft(entry, { stockMode: 'unlimited' })}
                          className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-colors ${
                            draft.stockMode === 'unlimited'
                              ? 'bg-[#0A0A0B] text-white'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          Unlimited
                        </button>
                        <button
                          type="button"
                          onClick={() => patchDraft(entry, { stockMode: 'limited' })}
                          className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-colors ${
                            draft.stockMode === 'limited'
                              ? 'bg-[#E88D14] text-black'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          Limited
                        </button>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        disabled={draft.stockMode === 'unlimited'}
                        value={draft.stockMode === 'unlimited' ? '' : draft.stockQuantity}
                        placeholder={draft.stockMode === 'unlimited' ? '∞' : '0'}
                        onChange={(e) =>
                          patchDraft(entry, { stockQuantity: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono disabled:bg-zinc-100 disabled:text-zinc-400"
                      />
                    </div>

                    {/* Unit */}
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Stock Unit
                      </label>
                      <select
                        value={
                          STOCK_UNIT_OPTIONS.includes(
                            draft.stockUnit as (typeof STOCK_UNIT_OPTIONS)[number]
                          )
                            ? draft.stockUnit
                            : 'Plates'
                        }
                        onChange={(e) => patchDraft(entry, { stockUnit: e.target.value })}
                        className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg text-xs bg-white"
                      >
                        {STOCK_UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Low Stock Threshold */}
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Low Alert &le;
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        disabled={draft.stockMode === 'unlimited'}
                        value={draft.stockMode === 'unlimited' ? '' : draft.lowStockThreshold}
                        placeholder="5"
                        onChange={(e) =>
                          patchDraft(entry, { lowStockThreshold: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono disabled:bg-zinc-100 disabled:text-zinc-400"
                      />
                    </div>

                    {/* Save Changes Button */}
                    <div className="md:col-span-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleSaveDraft(entry)}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                          isDirty
                            ? 'bg-[#E88D14] text-black hover:bg-[#f39c25]'
                            : 'bg-[#0A0A0B] text-white hover:bg-zinc-800'
                        }`}
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{isBusy ? 'Saving...' : 'Save Stock'}</span>
                      </button>
                      {isDirty && (
                        <button
                          type="button"
                          onClick={() => clearDraft(entry.key)}
                          title="Discard unsaved edits"
                          className="p-2 border border-zinc-300 rounded-lg text-zinc-600 hover:text-zinc-900"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Restock / Reduce Toolbar (Available for Limited Stock or quick switch) */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-zinc-500 mr-1">
                        Quick Adjust:
                      </span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeltaAdjust(entry, 1)}
                        className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-bold rounded-lg hover:bg-emerald-100"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeltaAdjust(entry, 5)}
                        className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-bold rounded-lg hover:bg-emerald-100"
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || (norm.stockMode === 'limited' && norm.stockQuantity <= 0)}
                        onClick={() => handleDeltaAdjust(entry, -1)}
                        className="px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-mono font-bold rounded-lg hover:bg-amber-100 disabled:opacity-40"
                      >
                        -1
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={customDeltaStr}
                        onChange={(e) =>
                          setCustomDeltaInputs((prev) => ({
                            ...prev,
                            [entry.key]: e.target.value,
                          }))
                        }
                        placeholder="Qty"
                        aria-label={`Custom quantity adjustment for ${entry.item.name}`}
                        className="w-20 px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-mono"
                      />
                      <button
                        type="button"
                        disabled={isBusy || customDeltaNum <= 0}
                        onClick={() => handleDeltaAdjust(entry, customDeltaNum)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 disabled:opacity-40"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                      <button
                        type="button"
                        disabled={
                          isBusy ||
                          customDeltaNum <= 0 ||
                          (norm.stockMode === 'limited' && norm.stockQuantity <= 0)
                        }
                        onClick={() => handleDeltaAdjust(entry, -customDeltaNum)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-zinc-300 text-zinc-800 text-xs font-semibold rounded-lg hover:border-red-400 hover:text-red-700 disabled:opacity-40"
                      >
                        <Minus className="w-3 h-3" />
                        <span>Reduce</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Live Stock History Ledger */}
      <section className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-[#D97706]" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-900">
                Stock History ({historyRows.length})
              </h2>
              <p className="text-xs text-zinc-500">
                Real-time log of paid order deductions, refund restorations, restocks, and manual edits.
              </p>
            </div>
          </div>
        </div>

        {historyError && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            {historyError}
          </div>
        )}

        {historyRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-200 rounded-xl">
            No stock history recorded yet. Any stock mode change, restock, or paid limited-stock order will appear here automatically.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 max-h-[520px] overflow-y-auto">
            {historyRows.map((row) => {
              const badge = ACTION_BADGE_MAP[row.actionType] || {
                label: row.actionType,
                badgeClass: 'bg-zinc-100 text-zinc-800 border-zinc-300',
              };
              const deltaText =
                row.changeDelta > 0
                  ? `+${row.changeDelta}`
                  : row.changeDelta < 0
                  ? String(row.changeDelta)
                  : '0';

              return (
                <div
                  key={row.historyId}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-zinc-900">{row.productName}</span>
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.badgeClass}`}
                      >
                        {badge.label}
                      </span>
                      {row.orderId && (
                        <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono text-[10px]">
                          Order: {row.orderId}
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-600">{row.reason}</p>
                    <p className="text-[11px] text-zinc-400">
                      {formatDateTime(row.createdAt)} · Mode: {row.stockMode}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                    <span
                      className={`font-bold ${
                        row.changeDelta > 0
                          ? 'text-emerald-700'
                          : row.changeDelta < 0
                          ? 'text-red-700'
                          : 'text-zinc-600'
                      }`}
                    >
                      {deltaText} {row.stockUnit}
                    </span>
                    <span className="px-2.5 py-1 bg-zinc-100 rounded-md text-zinc-800 font-semibold flex items-center gap-1">
                      <span>{row.previousStock}</span>
                      <span>→</span>
                      <span>{row.newStock}</span>
                      {row.newStock > 0 && row.stockMode === 'limited' && (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 ml-0.5" />
                      )}
                      {row.newStock === 0 && row.stockMode === 'limited' && (
                        <Check className="w-3 h-3 text-red-600 ml-0.5" />
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
