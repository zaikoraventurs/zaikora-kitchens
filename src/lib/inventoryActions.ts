import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import {
  buildStockHistoryId,
  clampStockInt,
  normalizeInventoryFields,
  sanitizeStockUnit,
  stripUndefinedFields,
} from './inventory';
import type {
  CakeMenuItem,
  FoodMenuItem,
  StockHistoryAction,
  StockMode,
} from '../types';

export interface InventoryUpdatePayload {
  item: FoodMenuItem | CakeMenuItem;
  productType: 'food' | 'cake';
  actorUid: string;
  stockMode: StockMode;
  stockQuantity: number;
  stockUnit: string;
  lowStockThreshold: number;
  available: boolean;
  actionType: StockHistoryAction;
  reason: string;
}

export async function saveProductInventoryBatch(input: InventoryUpdatePayload): Promise<void> {
  const {
    item,
    productType,
    actorUid,
    stockMode,
    stockQuantity,
    stockUnit,
    lowStockThreshold,
    available,
    actionType,
    reason,
  } = input;

  const prev = normalizeInventoryFields(item, { isCake: productType === 'cake' });
  const nextQty = clampStockInt(stockQuantity, 0);
  const nextThreshold = clampStockInt(lowStockThreshold, prev.lowStockThreshold, 10000);
  const nextUnit = sanitizeStockUnit(stockUnit, item, { isCake: productType === 'cake' });
  const nextSoldOut = stockMode === 'limited' && nextQty <= 0;
  const colName = productType === 'cake' ? 'cake_menu' : 'food_menu';

  const productRef = doc(db, colName, item.id);
  const existingSnap = await getDoc(productRef);
  const batch = writeBatch(db);

  const inventoryFields = {
    available,
    stockMode,
    stockQuantity: nextQty,
    stockUnit: nextUnit,
    lowStockThreshold: nextThreshold,
    soldOut: nextSoldOut,
    lastStockUpdatedAt: serverTimestamp(),
    lastStockUpdatedBy: actorUid.slice(0, 128),
    updatedAt: serverTimestamp(),
  };

  if (existingSnap.exists()) {
    // Update strictly inventory fields so existing product photos, names, and metadata stay untouched
    batch.update(productRef, inventoryFields);
  } else {
    // Strip all undefined optional fields (e.g. imageDerivativeUrl, mediaId) before initial seed write
    const cleanBaseItem = stripUndefinedFields(item as unknown as Record<string, unknown>);
    batch.set(
      productRef,
      {
        ...cleanBaseItem,
        ...inventoryFields,
      },
      { merge: true }
    );
  }

  const historyId = buildStockHistoryId('stk', item.id);
  const delta =
    stockMode === 'limited'
      ? nextQty - (prev.stockMode === 'limited' ? prev.stockQuantity : 0)
      : 0;

  batch.set(
    doc(db, 'stock_history', historyId),
    stripUndefinedFields({
      historyId,
      productId: item.id,
      productType,
      productName: item.name.slice(0, 120),
      stockMode,
      stockUnit: nextUnit,
      previousStock: prev.stockMode === 'limited' ? prev.stockQuantity : 0,
      changeDelta: delta,
      newStock: stockMode === 'limited' ? nextQty : 0,
      actionType,
      reason: reason.trim().slice(0, 240) || 'Admin stock update',
      actorUid: actorUid.slice(0, 128),
      createdAt: serverTimestamp(),
    })
  );

  await batch.commit();
}

export async function adjustProductStockDelta(params: {
  item: FoodMenuItem | CakeMenuItem;
  productType: 'food' | 'cake';
  actorUid: string;
  delta: number;
  reason?: string;
}): Promise<void> {
  const prev = normalizeInventoryFields(params.item, { isCake: params.productType === 'cake' });
  const nextQty = clampStockInt(prev.stockQuantity + Math.trunc(params.delta), 0);
  const actionType: StockHistoryAction = params.delta >= 0 ? 'manual_add' : 'manual_reduce';

  // When restocking a sold-out item (> 0), ensure it is available for ordering automatically
  const nextAvailable = params.delta > 0 && prev.soldOut && nextQty > 0 ? true : prev.available;

  await saveProductInventoryBatch({
    item: params.item,
    productType: params.productType,
    actorUid: params.actorUid,
    stockMode: 'limited',
    stockQuantity: nextQty,
    stockUnit: prev.stockUnit,
    lowStockThreshold: prev.lowStockThreshold,
    available: nextAvailable,
    actionType,
    reason:
      params.reason ||
      (params.delta >= 0
        ? `Added ${params.delta} ${prev.stockUnit}`
        : `Reduced ${Math.abs(params.delta)} ${prev.stockUnit}`),
  });
}

export async function resetLimitedStockZero(params: {
  item: FoodMenuItem | CakeMenuItem;
  productType: 'food' | 'cake';
  actorUid: string;
}): Promise<void> {
  const prev = normalizeInventoryFields(params.item, {
    isCake: params.productType === 'cake',
  });
  await saveProductInventoryBatch({
    item: params.item,
    productType: params.productType,
    actorUid: params.actorUid,
    stockMode: 'limited',
    stockQuantity: 0,
    stockUnit: prev.stockUnit,
    lowStockThreshold: prev.lowStockThreshold,
    available: prev.available,
    actionType: 'admin_reset',
    reason: 'Manual admin stock reset to 0 (Marked Sold Out)',
  });
}
