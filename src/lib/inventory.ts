import type { CakeMenuItem, CartItem, FoodMenuItem, StockMode } from '../types/index.ts';

export const STOCK_UNIT_OPTIONS = [
  'Plates',
  'Pieces',
  'Servings',
  'Portions',
  'Pizzas',
  'Burgers',
  'Boxes',
  'Cakes',
] as const;

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;
export const MAX_STOCK_QUANTITY = 100000;

export type InventoryStatusCode = 'AVAILABLE' | 'LOW_STOCK' | 'SOLD_OUT' | 'UNAVAILABLE';

export interface NormalizedInventoryState {
  available: boolean;
  stockMode: StockMode;
  stockQuantity: number;
  stockUnit: string;
  lowStockThreshold: number;
  soldOut: boolean;
}

export interface InventoryStatusMeta {
  code: InventoryStatusCode;
  orderable: boolean;
  customerBadge: string;
  customerWarning?: string;
  adminBadge: string;
  remainingLabel: string;
}

type InventoryCandidate = Partial<
  Pick<
    FoodMenuItem & CakeMenuItem,
    | 'id'
    | 'name'
    | 'category'
    | 'cakeType'
    | 'quantityLabel'
    | 'available'
    | 'stockMode'
    | 'stockQuantity'
    | 'stockUnit'
    | 'lowStockThreshold'
    | 'soldOut'
  >
>;

export function inferDefaultStockUnit(
  item: InventoryCandidate,
  options?: { isCake?: boolean }
): string {
  const cakeType = item.cakeType;
  if (cakeType === 'sicle') return 'Pieces';
  if (cakeType === 'bento' || cakeType === 'party' || options?.isCake) return 'Cakes';

  const cat = (item.category || '').toLowerCase();
  const label = (item.quantityLabel || '').toLowerCase();
  const name = (item.name || '').toLowerCase();

  if (cat.includes('pizza') || name.includes('pizza')) return 'Pizzas';
  if (cat.includes('burger') || name.includes('burger')) return 'Burgers';
  if (label.includes('piece') || label.includes('pc')) return 'Pieces';
  if (label.includes('plate') || name.includes('rice') || name.includes('biryani')) return 'Plates';
  if (label.includes('serving')) return 'Servings';
  return 'Portions';
}

export function clampStockInt(value: unknown, fallback = 0, max = MAX_STOCK_QUANTITY): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(num)));
}

export function sanitizeStockUnit(
  raw: unknown,
  fallbackItem?: InventoryCandidate,
  options?: { isCake?: boolean }
): string {
  const cleaned = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
  if (cleaned) return cleaned;
  if (fallbackItem) return inferDefaultStockUnit(fallbackItem, options);
  return options?.isCake ? 'Cakes' : 'Plates';
}

export function normalizeInventoryFields(
  item: InventoryCandidate,
  options?: { isCake?: boolean }
): NormalizedInventoryState {
  const stockMode: StockMode = item.stockMode === 'limited' ? 'limited' : 'unlimited';
  const stockQuantity = clampStockInt(item.stockQuantity, 0);
  const stockUnit = sanitizeStockUnit(item.stockUnit, item, options);
  const lowStockThreshold = clampStockInt(
    item.lowStockThreshold,
    DEFAULT_LOW_STOCK_THRESHOLD,
    10000
  );
  const available = item.available !== false;
  const soldOut = stockMode === 'limited' && stockQuantity <= 0;

  return {
    available,
    stockMode,
    stockQuantity,
    stockUnit,
    lowStockThreshold,
    soldOut,
  };
}

export function isItemSoldOut(
  item: InventoryCandidate,
  options?: { isCake?: boolean }
): boolean {
  return normalizeInventoryFields(item, options).soldOut;
}

export function isItemLowStock(
  item: InventoryCandidate,
  options?: { isCake?: boolean }
): boolean {
  const n = normalizeInventoryFields(item, options);
  return (
    n.available &&
    n.stockMode === 'limited' &&
    n.stockQuantity > 0 &&
    n.stockQuantity <= n.lowStockThreshold
  );
}

export function isItemOrderable(
  item: InventoryCandidate,
  options?: { isCake?: boolean }
): boolean {
  const n = normalizeInventoryFields(item, options);
  return n.available && (n.stockMode === 'unlimited' || n.stockQuantity > 0);
}

export function getMaxOrderableForProduct(
  item: InventoryCandidate,
  options?: { isCake?: boolean }
): number {
  const n = normalizeInventoryFields(item, options);
  if (!n.available) return 0;
  if (n.stockMode === 'unlimited') return Number.POSITIVE_INFINITY;
  return n.stockQuantity;
}

export function getCartQuantityForProduct(
  cart: CartItem[],
  productType: 'food' | 'cake',
  productId: string,
  excludeCartKey?: string
): number {
  let total = 0;
  for (const line of cart) {
    if (line.productType === productType && line.productId === productId) {
      if (excludeCartKey && line.cartKey === excludeCartKey) continue;
      total += Math.max(0, Math.floor(Number(line.quantity) || 0));
    }
  }
  return total;
}

export function getRemainingAddableQuantity(
  cart: CartItem[],
  item: InventoryCandidate & { id: string },
  productType: 'food' | 'cake',
  currentCartKey?: string
): number {
  const maxForProduct = getMaxOrderableForProduct(item, { isCake: productType === 'cake' });
  if (!Number.isFinite(maxForProduct)) return Number.POSITIVE_INFINITY;
  const otherQty = getCartQuantityForProduct(cart, productType, item.id, currentCartKey);
  return Math.max(0, maxForProduct - otherQty);
}

export function canAddAnotherUnitToCart(
  cart: CartItem[],
  item: InventoryCandidate & { id: string },
  productType: 'food' | 'cake',
  desiredLineQty: number,
  currentCartKey?: string
): boolean {
  const n = normalizeInventoryFields(item, { isCake: productType === 'cake' });
  if (!n.available) return false;
  if (n.stockMode === 'unlimited') return desiredLineQty > 0;
  const otherQty = getCartQuantityForProduct(cart, productType, item.id, currentCartKey);
  return desiredLineQty > 0 && otherQty + desiredLineQty <= n.stockQuantity;
}

export function getInventoryStatusMeta(
  item: InventoryCandidate,
  options?: { isCake?: boolean }
): InventoryStatusMeta {
  const n = normalizeInventoryFields(item, options);

  if (!n.available) {
    return {
      code: 'UNAVAILABLE',
      orderable: false,
      customerBadge: 'Unavailable',
      customerWarning: 'Currently Unavailable',
      adminBadge: 'MANUALLY UNAVAILABLE',
      remainingLabel:
        n.stockMode === 'limited' ? `${n.stockQuantity} ${n.stockUnit}` : 'Unlimited (Paused)',
    };
  }

  if (n.soldOut) {
    return {
      code: 'SOLD_OUT',
      orderable: false,
      customerBadge: 'SOLD OUT',
      customerWarning: 'SOLD OUT',
      adminBadge: 'SOLD OUT',
      remainingLabel: `0 ${n.stockUnit}`,
    };
  }

  if (isItemLowStock(item, options)) {
    return {
      code: 'LOW_STOCK',
      orderable: true,
      customerBadge: `Only ${n.stockQuantity} ${n.stockUnit} left`,
      customerWarning: `LOW STOCK — ONLY ${n.stockQuantity} ${n.stockUnit.toUpperCase()} REMAINING`,
      adminBadge: 'LOW STOCK',
      remainingLabel: `${n.stockQuantity} ${n.stockUnit}`,
    };
  }

  return {
    code: 'AVAILABLE',
    orderable: true,
    customerBadge:
      n.stockMode === 'limited' ? `${n.stockQuantity} ${n.stockUnit} left` : 'Available',
    adminBadge: 'AVAILABLE',
    remainingLabel: n.stockMode === 'limited' ? `${n.stockQuantity} ${n.stockUnit}` : 'Unlimited',
  };
}

export function clampCartToInventory(
  cart: CartItem[],
  foodMenu: FoodMenuItem[],
  cakeMenu: CakeMenuItem[]
): { nextCart: CartItem[]; changed: boolean; notices: string[] } {
  if (cart.length === 0) {
    return { nextCart: cart, changed: false, notices: [] };
  }

  const foodMap = new Map(foodMenu.map((f) => [f.id, f]));
  const cakeMap = new Map(cakeMenu.map((c) => [c.id, c]));
  const allocatedByProduct = new Map<string, number>();

  const nextCart: CartItem[] = [];
  const notices: string[] = [];
  let changed = false;

  for (const line of cart) {
    const liveItem =
      line.productType === 'cake' ? cakeMap.get(line.productId) : foodMap.get(line.productId);

    if (!liveItem) {
      nextCart.push(line);
      continue;
    }

    const norm = normalizeInventoryFields(liveItem, {
      isCake: line.productType === 'cake',
    });

    if (!norm.available || norm.soldOut) {
      changed = true;
      notices.push(
        `"${liveItem.name}" is currently ${
          norm.soldOut ? 'SOLD OUT' : 'unavailable'
        } and was removed from your cart.`
      );
      continue;
    }

    if (norm.stockMode === 'limited') {
      const key = `${line.productType}:${line.productId}`;
      const alreadyAllocated = allocatedByProduct.get(key) || 0;
      const remaining = Math.max(0, norm.stockQuantity - alreadyAllocated);

      if (remaining <= 0) {
        changed = true;
        notices.push(
          `Stock availability has changed for "${liveItem.name}". Only ${norm.stockQuantity} ${norm.stockUnit.toLowerCase()} are available.`
        );
        continue;
      }

      if (line.quantity > remaining) {
        changed = true;
        allocatedByProduct.set(key, alreadyAllocated + remaining);
        nextCart.push({
          ...line,
          quantity: remaining,
        });
        notices.push(
          `Stock availability has changed. Only ${norm.stockQuantity} ${norm.stockUnit.toLowerCase()} ${
            norm.stockQuantity === 1 ? 'is' : 'are'
          } currently available for "${liveItem.name}". Your quantity has been updated.`
        );
        continue;
      }

      allocatedByProduct.set(key, alreadyAllocated + line.quantity);
    }

    nextCart.push(line);
  }

  return { nextCart, changed, notices };
}

export function buildStockHistoryId(prefix: string, productId: string): string {
  const safeId = productId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${safeId}_${Date.now()}_${rand}`.slice(0, 120);
}

export function stripUndefinedFields<T extends Record<string, unknown>>(
  record: T
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

