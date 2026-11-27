import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  DEFAULT_SETTINGS,
  INITIAL_CAKE_MENU,
  INITIAL_FOOD_MENU,
  buildFallbackCheckoutCharges,
  getCategoryImage,
  normalizeCheckoutCharge,
  resolveCakeItemImage,
  resolveFoodItemImage,
} from '../data/catalog';
import { auth, db, handleFirestoreError, OperationType, testConnection } from '../lib/firebase';
import {
  clampCartToInventory,
  getRemainingAddableQuantity,
  isItemOrderable,
  normalizeInventoryFields,
} from '../lib/inventory';
import { CATEGORY_TO_SECTION_ID } from '../lib/mediaStorage';
import type {
  AdminUserRecord,
  CakeMenuItem,
  CartItem,
  CheckoutChargeRecord,
  CouponRecord,
  CustomerAddress,
  CustomerNotification,
  CustomerProfile,
  FoodMenuItem,
  MediaAssetRecord,
  OrderRecord,
  PaymentRecord,
  PhoneAccountRecord,
  RestaurantSettings,
  ServerConfigStatus,
  SiteMediaSectionRecord,
} from '../types';

const CART_STORAGE_KEY = 'zaikora_kitchens_cart_v1';

export interface DltPhoneSession {
  phone: string;
  name?: string;
  email?: string;
  marketingConsent?: boolean;
  sessionToken: string;
}

interface AppContextValue {
  user: User | null;
  authReady: boolean;
  initialLoading: boolean;
  dltPhoneSession: DltPhoneSession | null;
  setDltPhoneSession: (session: DltPhoneSession | null) => void;
  verifiedPhone: string;
  customerName: string;
  customerEmail: string;
  customerMarketingConsent: boolean;
  phoneAccount: PhoneAccountRecord | null;
  isCustomerAuthenticated: boolean;
  customerProfile: CustomerProfile | null;
  addresses: CustomerAddress[];
  notifications: CustomerNotification[];
  orders: OrderRecord[];
  payments: PaymentRecord[];
  adminRecord: AdminUserRecord | null;
  adminSessionToken: string | null;
  setAdminSessionToken: (token: string | null) => void;
  lockAdminSession: () => Promise<void>;
  isAdmin: boolean;
  foodMenu: FoodMenuItem[];
  foodMenuSynced: boolean;
  cakeMenu: CakeMenuItem[];
  cakeMenuSynced: boolean;
  siteMedia: Record<string, SiteMediaSectionRecord>;
  mediaLibrary: MediaAssetRecord[];
  resolveSectionMedia: (
    sectionId: string,
    fallbackImageUrl: string
  ) => {
    mediaUrl: string;
    derivativeUrl?: string;
    mediaType: 'image' | 'video';
    label?: string;
  };
  resolveCategoryImage: (categoryName: string) => { src: string; derivativeSrc?: string };
  settings: RestaurantSettings;
  checkoutCharges: CheckoutChargeRecord[];
  checkoutChargesSynced: boolean;
  serverConfig: ServerConfigStatus;
  cart: CartItem[];
  totalCartItems: number;
  stockNotice: string | null;
  dismissStockNotice: () => void;
  appliedCoupon: CouponRecord | null;
  setAppliedCoupon: (coupon: CouponRecord | null) => void;
  addToCart: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  updateCartQuantity: (cartKey: string, quantity: number) => void;
  removeFromCart: (cartKey: string) => void;
  clearCart: () => void;
  logout: () => Promise<void>;
  refreshServerConfig: () => Promise<void>;
  getApiAuthHeaders: () => Promise<Record<string, string>>;
  getAdminApiAuthHeaders: () => Promise<Record<string, string>>;
  ensureCustomerProfile: (
    u: User,
    explicitName?: string,
    explicitPhone?: string,
    explicitEmail?: string,
    explicitMarketingConsent?: boolean
  ) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function sanitizeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, CartItem>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<CartItem>;
    const cartKey = typeof item.cartKey === 'string' ? item.cartKey.trim() : '';
    const productId = typeof item.productId === 'string' ? item.productId.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const qty = Math.round(Number(item.quantity));
    const price = Number(item.originalPrice);
    if (!cartKey || !productId || !name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      continue;
    }
    const clampedQty = Math.min(100, qty);
    const existing = merged.get(cartKey);
    if (existing) {
      existing.quantity = Math.min(100, existing.quantity + clampedQty);
    } else {
      merged.set(cartKey, {
        cartKey,
        productId,
        productType: item.productType === 'cake' ? 'cake' : 'food',
        name,
        quantityLabel: typeof item.quantityLabel === 'string' ? item.quantityLabel : '',
        originalPrice: Math.round(price),
        eligibleForAutoDiscount: Boolean(item.eligibleForAutoDiscount),
        selectedFlavour: typeof item.selectedFlavour === 'string' ? item.selectedFlavour : undefined,
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : undefined,
        quantity: clampedQty,
      });
    }
  }
  return Array.from(merged.values());
}

function loadInitialCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeCartItems(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dltSessionReady, setDltSessionReady] = useState(false);
  const [dltPhoneSession, setDltPhoneSession] = useState<DltPhoneSession | null>(null);
  const [adminSessionReady, setAdminSessionReady] = useState(false);
  const [adminSessionToken, setAdminSessionToken] = useState<string | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [phoneAccount, setPhoneAccount] = useState<PhoneAccountRecord | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [adminRecord, setAdminRecord] = useState<AdminUserRecord | null>(null);

  const [firestoreFoodMenu, setFirestoreFoodMenu] = useState<FoodMenuItem[]>([]);
  const [firestoreCakeMenu, setFirestoreCakeMenu] = useState<CakeMenuItem[]>([]);
  const [siteMedia, setSiteMedia] = useState<Record<string, SiteMediaSectionRecord>>({});
  const [mediaLibrary, setMediaLibrary] = useState<MediaAssetRecord[]>([]);
  const [settings, setSettings] = useState<RestaurantSettings>(DEFAULT_SETTINGS);
  const [firestoreCheckoutCharges, setFirestoreCheckoutCharges] = useState<CheckoutChargeRecord[]>([]);

  const [cart, setCart] = useState<CartItem[]>(loadInitialCart);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponRecord | null>(null);
  const dismissStockNotice = () => setStockNotice(null);
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus>({
    razorpayConfigured: false,
    razorpayWebhookConfigured: false,
    razorpayMode: 'unconfigured',
  });

  const refreshServerConfig = async () => {
    try {
      const res = await fetch('/api/config/status');
      if (res.ok) {
        const data = (await res.json()) as ServerConfigStatus;
        setServerConfig(data);
      }
    } catch {
      // Non-fatal network check
    }
  };

  const persistCartToStorage = (items: CartItem[]) => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage quota errors
    }
  };

  useEffect(() => {
    persistCartToStorage(cart);
  }, [cart]);

  useEffect(() => {
    const syncFromStorage = () => {
      const latest = loadInitialCart();
      setCart((prev) => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(latest);
        return prevJson === nextJson ? prev : latest;
      });
    };

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === CART_STORAGE_KEY) {
        syncFromStorage();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncFromStorage();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('pageshow', syncFromStorage);
    window.addEventListener('focus', syncFromStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('pageshow', syncFromStorage);
      window.removeEventListener('focus', syncFromStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    testConnection();
    refreshServerConfig();

    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { authenticated?: boolean; phone?: string; name?: string | null; email?: string | null; sessionToken?: string } | null) => {
        if (!cancelled && data?.authenticated && data.phone && data.sessionToken) {
          setDltPhoneSession({
            phone: data.phone,
            name: data.name || undefined,
            email: data.email || undefined,
            sessionToken: data.sessionToken,
          });
        }
      })
      .catch(() => {
        // Non-fatal session hydration check
      })
      .finally(() => {
        if (!cancelled) setDltSessionReady(true);
      });

    fetch('/api/admin/session', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { unlocked?: boolean; sessionToken?: string | null } | null) => {
        if (!cancelled && data?.unlocked && data.sessionToken) {
          setAdminSessionToken(data.sessionToken);
        }
      })
      .catch(() => {
        // Non-fatal admin session check
      })
      .finally(() => {
        if (!cancelled) setAdminSessionReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Public catalog & settings listeners
  useEffect(() => {
    const catalogFallbackTimer = window.setTimeout(() => {
      setCatalogLoaded(true);
    }, 2500);

    const isPermissionError = (err: unknown): boolean => {
      const code = (err as { code?: string } | null)?.code;
      const msg = err instanceof Error ? err.message : String(err ?? '');
      return (
        code === 'permission-denied' ||
        msg.toLowerCase().includes('missing or insufficient permissions')
      );
    };

    const foodQuery = query(collection(db, 'food_menu'), orderBy('sortOrder', 'asc'));
    const unsubFood = onSnapshot(
      foodQuery,
      (snap) => {
        window.clearTimeout(catalogFallbackTimer);
        const items = snap.docs.map((d) => d.data() as FoodMenuItem);
        setFirestoreFoodMenu(items);
        setCatalogLoaded(true);
      },
      (err) => {
        window.clearTimeout(catalogFallbackTimer);
        setCatalogLoaded(true);
        if (isPermissionError(err)) {
          handleFirestoreError(err, OperationType.LIST, 'food_menu');
        }
      }
    );

    const cakeQuery = query(collection(db, 'cake_menu'), orderBy('sortOrder', 'asc'));
    const unsubCakes = onSnapshot(
      cakeQuery,
      (snap) => {
        const items = snap.docs.map((d) => d.data() as CakeMenuItem);
        setFirestoreCakeMenu(items);
      },
      (err) => {
        if (isPermissionError(err)) {
          handleFirestoreError(err, OperationType.LIST, 'cake_menu');
        }
      }
    );

    const unsubSettings = onSnapshot(
      doc(db, 'restaurant_settings', 'config'),
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as Partial<RestaurantSettings>;
          setSettings({
            ...DEFAULT_SETTINGS,
            ...raw,
            whatsappNumber: raw.whatsappNumber?.trim() || DEFAULT_SETTINGS.whatsappNumber,
            contactPhone: raw.contactPhone?.trim() || DEFAULT_SETTINGS.contactPhone,
            contactEmail: raw.contactEmail?.trim() || DEFAULT_SETTINGS.contactEmail,
          });
        }
      },
      (err) => {
        if (isPermissionError(err)) {
          handleFirestoreError(err, OperationType.GET, 'restaurant_settings/config');
        }
      }
    );

    const unsubSiteMedia = onSnapshot(
      collection(db, 'site_media'),
      (snap) => {
        const next: Record<string, SiteMediaSectionRecord> = {};
        for (const d of snap.docs) {
          const data = d.data() as SiteMediaSectionRecord;
          if (data?.sectionId && data?.mediaUrl) {
            next[data.sectionId] = data;
          }
        }
        setSiteMedia(next);
      },
      () => {
        // Public site_media fallback remains active if rules/connection temporarily unavailable
      }
    );

    const chargesQuery = query(
      collection(db, 'checkout_charges'),
      orderBy('displayOrder', 'asc')
    );
    const unsubCharges = onSnapshot(
      chargesQuery,
      (snap) => {
        const list = snap.docs
          .map((d, idx) =>
            normalizeCheckoutCharge({ ...(d.data() as Record<string, unknown>), id: d.id }, idx + 1)
          )
          .filter((c): c is CheckoutChargeRecord => c !== null)
          .sort((a, b) => a.displayOrder - b.displayOrder);
        setFirestoreCheckoutCharges(list);
      },
      (err) => {
        if (isPermissionError(err)) {
          handleFirestoreError(err, OperationType.LIST, 'checkout_charges');
        }
      }
    );

    return () => {
      window.clearTimeout(catalogFallbackTimer);
      unsubFood();
      unsubCakes();
      unsubSettings();
      unsubSiteMedia();
      unsubCharges();
    };
  }, []);

  // User-scoped listeners (only attached when authenticated)
  useEffect(() => {
    if (!authReady || !user) {
      setCustomerProfile(null);
      setAddresses([]);
      setNotifications([]);
      setOrders([]);
      setPayments([]);
      setAdminRecord(null);
      return;
    }

    const uid = user.uid;

    const unsubCustomer = onSnapshot(
      doc(db, 'customers', uid),
      (snap) => {
        setCustomerProfile(snap.exists() ? (snap.data() as CustomerProfile) : null);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `customers/${uid}`)
    );

    const unsubAddresses = onSnapshot(
      collection(db, 'customers', uid, 'addresses'),
      (snap) => {
        setAddresses(snap.docs.map((d) => d.data() as CustomerAddress));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `customers/${uid}/addresses`)
    );

    const notifQuery = query(
      collection(db, 'customers', uid, 'notifications'),
      orderBy('createdAt', 'desc')
    );
    const unsubNotifs = onSnapshot(
      notifQuery,
      (snap) => {
        setNotifications(snap.docs.map((d) => d.data() as CustomerNotification));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `customers/${uid}/notifications`)
    );

    const ordersQuery = query(
      collection(db, 'orders'),
      where('customerId', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        setOrders(snap.docs.map((d) => d.data() as OrderRecord));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const paymentsQuery = query(
      collection(db, 'payments'),
      where('customerId', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const unsubPayments = onSnapshot(
      paymentsQuery,
      (snap) => {
        setPayments(snap.docs.map((d) => d.data() as PaymentRecord));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubAdmin = onSnapshot(
      doc(db, 'admins', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as AdminUserRecord;
          setAdminRecord(data.active ? data : null);
        } else {
          setAdminRecord(null);
        }
      },
      () => {
        setAdminRecord(null);
      }
    );

    return () => {
      unsubCustomer();
      unsubAddresses();
      unsubNotifs();
      unsubOrders();
      unsubPayments();
      unsubAdmin();
    };
  }, [authReady, user]);

  const verifiedPhone =
    dltPhoneSession?.phone || customerProfile?.phone || user?.phoneNumber || '';

  const customerName =
    customerProfile?.name || phoneAccount?.name || dltPhoneSession?.name || '';

  const customerEmail =
    customerProfile?.email || phoneAccount?.email || dltPhoneSession?.email || '';

  const customerMarketingConsent =
    typeof customerProfile?.marketingConsent === 'boolean'
      ? customerProfile.marketingConsent
      : Boolean(phoneAccount?.marketingConsent);

  useEffect(() => {
    if (!authReady || !user || !verifiedPhone) {
      setPhoneAccount(null);
      return;
    }
    const phoneId = verifiedPhone.replace(/\D/g, '');
    if (!/^91[6-9]\d{9}$/.test(phoneId)) {
      setPhoneAccount(null);
      return;
    }
    const unsubPhoneAccount = onSnapshot(
      doc(db, 'phone_accounts', phoneId),
      (snap) => {
        setPhoneAccount(snap.exists() ? (snap.data() as PhoneAccountRecord) : null);
      },
      () => {
        setPhoneAccount(null);
      }
    );
    return () => unsubPhoneAccount();
  }, [authReady, user, verifiedPhone]);

  const isCustomerAuthenticated = Boolean(user && verifiedPhone);

  const getApiAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (user) {
      const idToken = await user.getIdToken();
      headers['X-Firebase-Auth'] = idToken;
      if (!dltPhoneSession?.sessionToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    }
    if (dltPhoneSession?.sessionToken) {
      headers.Authorization = `Bearer ${dltPhoneSession.sessionToken}`;
    }
    return headers;
  };

  const getAdminApiAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (adminSessionToken) {
      headers.Authorization = `Bearer ${adminSessionToken}`;
    }
    if (user) {
      const idToken = await user.getIdToken();
      headers['X-Firebase-Auth'] = idToken;
    }
    return headers;
  };

  const ensureCustomerProfile = async (
    u: User,
    explicitName?: string,
    explicitPhone?: string,
    explicitEmail?: string,
    explicitMarketingConsent?: boolean
  ) => {
    const ref = doc(db, 'customers', u.uid);
    const cleanPhone = (
      explicitPhone ||
      dltPhoneSession?.phone ||
      customerProfile?.phone ||
      u.phoneNumber ||
      ''
    )
      .trim()
      .slice(0, 20);
    const cleanName = (explicitName || customerProfile?.name || phoneAccount?.name || dltPhoneSession?.name || 'ZAIKORA Customer')
      .trim()
      .slice(0, 100);
    const cleanEmail = (explicitEmail || customerProfile?.email || phoneAccount?.email || dltPhoneSession?.email || '')
      .trim()
      .toLowerCase()
      .slice(0, 160);
    const consentValue =
      typeof explicitMarketingConsent === 'boolean'
        ? explicitMarketingConsent
        : typeof customerProfile?.marketingConsent === 'boolean'
          ? customerProfile.marketingConsent
          : Boolean(phoneAccount?.marketingConsent);
    try {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        const updatePayload: Record<string, unknown> = {
          name: cleanName || 'ZAIKORA Customer',
          marketingConsent: consentValue,
          updatedAt: serverTimestamp(),
        };
        if (cleanPhone.length >= 10) {
          updatePayload.phone = cleanPhone;
        }
        if (cleanEmail) {
          updatePayload.email = cleanEmail;
        }
        await updateDoc(ref, updatePayload);
      } else {
        const createPayload: Record<string, unknown> = {
          uid: u.uid,
          phone: cleanPhone,
          name: cleanName || 'ZAIKORA Customer',
          marketingConsent: consentValue,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (cleanEmail) {
          createPayload.email = cleanEmail;
        }
        await setDoc(ref, createPayload);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `customers/${u.uid}`);
    }
  };

  const foodMenu = useMemo(
    () =>
      (firestoreFoodMenu.length > 0 ? firestoreFoodMenu : INITIAL_FOOD_MENU).map((rawItem) => {
        let item = rawItem;
        if (item.id === 'fish-puli-munchi' || item.name === 'Fish Puli Munchi') {
          const hasLegacyDesc =
            !item.description || item.description.includes('Mangalorean coastal fish curry');
          item = {
            ...item,
            name: 'Bangda Fish Pulimunchu',
            ...(hasLegacyDesc
              ? {
                  description:
                    'Authentic tangy and spicy Mangalorean Bangda (mackerel) coastal fish curry.',
                }
              : {}),
          };
        } else if (
          item.id === 'white-rice-seafood' &&
          item.description?.includes('Fish Puli Munchi')
        ) {
          item = {
            ...item,
            description: 'Steamed white rice ideal alongside Bangda Fish Pulimunchu.',
          };
        } else if (
          item.id === 'chicken-biryani' &&
          item.description?.toLowerCase().includes('basmati')
        ) {
          item = {
            ...item,
            description:
              'Fragrant short-grain jeera samba rice layered with slow-cooked spiced chicken and caramelized onions.',
          };
        }
        return resolveFoodItemImage(item);
      }),
    [firestoreFoodMenu]
  );

  const cakeMenu = useMemo(
    () =>
      (firestoreCakeMenu.length > 0 ? firestoreCakeMenu : INITIAL_CAKE_MENU).map((cake) =>
        resolveCakeItemImage(cake)
      ),
    [firestoreCakeMenu]
  );

  const checkoutCharges = useMemo(() => {
    if (firestoreCheckoutCharges.length > 0 || settings.checkoutChargesConfigured) {
      return [...firestoreCheckoutCharges].sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return buildFallbackCheckoutCharges(settings);
  }, [firestoreCheckoutCharges, settings]);

  const checkoutChargesSynced =
    firestoreCheckoutCharges.length > 0 || Boolean(settings.checkoutChargesConfigured);

  useEffect(() => {
    if (!catalogLoaded) return;
    setCart((prev) => {
      if (prev.length === 0) return prev;
      const result = clampCartToInventory(prev, foodMenu, cakeMenu);
      if (!result.changed) return prev;
      persistCartToStorage(result.nextCart);
      if (result.notices.length > 0) {
        setStockNotice(result.notices[0]);
      }
      return result.nextCart;
    });
  }, [catalogLoaded, foodMenu, cakeMenu]);

  const updateCartState = (updater: (prev: CartItem[]) => CartItem[]) => {
    setCart((prev) => {
      const next = sanitizeCartItems(updater(prev));
      persistCartToStorage(next);
      return next;
    });
  };

  const addToCart = (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
    const qtyToAdd = Math.max(1, Math.round(Number(item.quantity ?? 1) || 1));
    const catalogItem =
      item.productType === 'cake'
        ? cakeMenu.find((c) => c.id === item.productId)
        : foodMenu.find((f) => f.id === item.productId);

    if (catalogItem) {
      if (!isItemOrderable(catalogItem, { isCake: item.productType === 'cake' })) {
        setStockNotice(`"${catalogItem.name}" is currently sold out or unavailable.`);
        return;
      }
      const remaining = getRemainingAddableQuantity(cart, catalogItem, item.productType);
      if (remaining <= 0) {
        const norm = normalizeInventoryFields(catalogItem, {
          isCake: item.productType === 'cake',
        });
        setStockNotice(
          norm.stockMode === 'limited'
            ? `Only ${norm.stockQuantity} ${norm.stockUnit.toLowerCase()} available for "${catalogItem.name}".`
            : `Maximum order quantity reached for "${catalogItem.name}".`
        );
        return;
      }
      const allowedAdd = Math.min(qtyToAdd, remaining);
      if (allowedAdd < qtyToAdd) {
        const norm = normalizeInventoryFields(catalogItem, {
          isCake: item.productType === 'cake',
        });
        setStockNotice(
          `Adjusted "${catalogItem.name}" to available stock (${norm.stockQuantity} ${norm.stockUnit.toLowerCase()} remaining).`
        );
      } else {
        setStockNotice(null);
      }
      updateCartState((prev) => {
        const existingIndex = prev.findIndex((c) => c.cartKey === item.cartKey);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: Math.min(100, updated[existingIndex].quantity + allowedAdd),
          };
          return updated;
        }
        return [...prev, { ...item, quantity: allowedAdd }];
      });
      return;
    }

    updateCartState((prev) => {
      const existingIndex = prev.findIndex((c) => c.cartKey === item.cartKey);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: Math.min(100, updated[existingIndex].quantity + qtyToAdd),
        };
        return updated;
      }
      return [...prev, { ...item, quantity: qtyToAdd }];
    });
  };

  const updateCartQuantity = (cartKey: string, quantity: number) => {
    const rounded = Math.round(Number(quantity));
    if (!Number.isFinite(rounded) || rounded <= 0) {
      removeFromCart(cartKey);
      return;
    }

    const currentLine = cart.find((c) => c.cartKey === cartKey);
    if (currentLine) {
      const catalogItem =
        currentLine.productType === 'cake'
          ? cakeMenu.find((c) => c.id === currentLine.productId)
          : foodMenu.find((f) => f.id === currentLine.productId);
      if (catalogItem) {
        if (!isItemOrderable(catalogItem, { isCake: currentLine.productType === 'cake' })) {
          setStockNotice(`"${catalogItem.name}" is currently sold out or unavailable.`);
          removeFromCart(cartKey);
          return;
        }
        const norm = normalizeInventoryFields(catalogItem, {
          isCake: currentLine.productType === 'cake',
        });
        if (norm.stockMode === 'limited') {
          const otherLinesQty = cart
            .filter(
              (c) =>
                c.cartKey !== cartKey &&
                c.productType === currentLine.productType &&
                c.productId === currentLine.productId
            )
            .reduce((sum, c) => sum + Math.max(0, Math.round(Number(c.quantity) || 0)), 0);
          const maxForLine = Math.max(0, norm.stockQuantity - otherLinesQty);
          if (rounded > maxForLine) {
            setStockNotice(
              `Only ${norm.stockQuantity} ${norm.stockUnit.toLowerCase()} remaining for "${catalogItem.name}".`
            );
            if (maxForLine <= 0) {
              removeFromCart(cartKey);
              return;
            }
            updateCartState((prev) =>
              prev.map((item) =>
                item.cartKey === cartKey ? { ...item, quantity: maxForLine } : item
              )
            );
            return;
          }
        }
      }
    }

    setStockNotice(null);
    updateCartState((prev) =>
      prev.map((item) =>
        item.cartKey === cartKey ? { ...item, quantity: Math.min(100, rounded) } : item
      )
    );
  };

  const removeFromCart = (cartKey: string) => {
    updateCartState((prev) => prev.filter((item) => item.cartKey !== cartKey));
  };

  const clearCart = () => {
    updateCartState(() => []);
    setAppliedCoupon(null);
    setStockNotice(null);
  };

  const totalCartItems = useMemo(
    () => cart.reduce((sum, item) => sum + Math.max(1, Math.round(Number(item.quantity) || 1)), 0),
    [cart]
  );

  const lockAdminSession = async () => {
    if (user && adminRecord?.active) {
      try {
        await updateDoc(doc(db, 'admins', user.uid), { active: false });
      } catch {
        // Non-fatal if already inactive or signed out
      }
    }
    setAdminSessionToken(null);
    setAdminRecord(null);
    try {
      await fetch('/api/admin/lock', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
    } catch {
      // Non-fatal admin lock cleanup
    }
  };

  const logout = async () => {
    setDltPhoneSession(null);
    setAdminSessionToken(null);
    try {
      await Promise.all([
        fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        }),
        fetch('/api/admin/lock', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        }),
      ]);
    } catch {
      // Non-fatal logout cleanup
    }
    await signOut(auth);
  };

  const isAdminUnlocked = Boolean(adminSessionToken && adminRecord?.active);

  // Admin-only permanent Media Library listener
  useEffect(() => {
    if (!authReady || !user || !isAdminUnlocked) {
      setMediaLibrary([]);
      return;
    }

    const mediaQuery = query(collection(db, 'media_library'), orderBy('createdAt', 'desc'));
    const unsubMedia = onSnapshot(
      mediaQuery,
      (snap) => {
        setMediaLibrary(snap.docs.map((d) => d.data() as MediaAssetRecord));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'media_library')
    );

    return () => unsubMedia();
  }, [authReady, user, isAdminUnlocked]);

  const resolveSectionMedia = (
    sectionId: string,
    fallbackImageUrl: string
  ): {
    mediaUrl: string;
    derivativeUrl?: string;
    mediaType: 'image' | 'video';
    label?: string;
  } => {
    const custom = siteMedia[sectionId];
    if (custom && custom.mediaUrl) {
      return {
        mediaUrl: custom.mediaUrl,
        derivativeUrl: custom.derivativeUrl,
        mediaType: custom.mediaType === 'video' ? 'video' : 'image',
        label: custom.label,
      };
    }
    return {
      mediaUrl: fallbackImageUrl,
      mediaType: 'image',
    };
  };

  const resolveCategoryImage = (
    categoryName: string
  ): { src: string; derivativeSrc?: string } => {
    const sectionId = CATEGORY_TO_SECTION_ID[categoryName];
    const custom = sectionId ? siteMedia[sectionId] : undefined;
    if (custom && custom.mediaUrl && custom.mediaType === 'image') {
      return {
        src: custom.mediaUrl,
        derivativeSrc: custom.derivativeUrl,
      };
    }
    return { src: getCategoryImage(categoryName) };
  };

  const value: AppContextValue = {
    user,
    authReady: authReady && dltSessionReady && adminSessionReady,
    initialLoading: !authReady || !dltSessionReady || !adminSessionReady || !catalogLoaded,
    dltPhoneSession,
    setDltPhoneSession,
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
    adminRecord: adminRecord?.active ? adminRecord : null,
    adminSessionToken,
    setAdminSessionToken,
    lockAdminSession,
    isAdmin: isAdminUnlocked,
    foodMenu,
    foodMenuSynced: firestoreFoodMenu.length > 0,
    cakeMenu,
    cakeMenuSynced: firestoreCakeMenu.length > 0,
    siteMedia,
    mediaLibrary,
    resolveSectionMedia,
    resolveCategoryImage,
    settings,
    checkoutCharges,
    checkoutChargesSynced,
    serverConfig,
    cart,
    totalCartItems,
    stockNotice,
    dismissStockNotice,
    appliedCoupon,
    setAppliedCoupon,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    logout,
    refreshServerConfig,
    getApiAuthHeaders,
    getAdminApiAuthHeaders,
    ensureCustomerProfile,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
