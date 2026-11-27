import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bell,
  BellRing,
  Boxes,
  Cake,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  LogOut,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  Shield,
  Tag,
  Trash2,
  Upload,
  Users,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { BrandLogo, FoodImage } from '../components/BrandLogo';
import { CheckoutChargesManager } from '../components/admin/CheckoutChargesManager';
import { InventoryManagerTab } from '../components/admin/InventoryManagerTab';
import { MediaManagerTab } from '../components/admin/MediaManagerTab';
import { useApp } from '../context/AppContext';
import {
  BRAND_NAME,
  COLLECTION_READY_MESSAGE,
  DELIVERY_TRANSIT_MESSAGE,
  FOOD_CATEGORIES,
  INITIAL_CAKE_MENU,
  INITIAL_FOOD_MENU,
  LEGACY_ORDER_STATUS_SEQUENCE,
  isOrderCompletedOrClosed,
  isOrderPendingAdminApproval,
} from '../data/catalog';
import { useNewOrderAlert } from '../hooks/useNewOrderAlert';
import { buildUnexpectedApiResponseError, parseApiResponse } from '../lib/api';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getInventoryStatusMeta, stripUndefinedFields } from '../lib/inventory';
import { uploadMediaToFirebaseStorage } from '../lib/mediaStorage';
import { formatDateTime, formatRupees, sanitizeCouponCode, toDateSafe } from '../lib/pricing';
import type {
  AdminUserRecord,
  CakeMenuItem,
  CouponRecord,
  CustomerAddress,
  CustomerProfile,
  FoodMenuItem,
  MediaCategory,
  OrderItemRecord,
  OrderRecord,
  OrderStatus,
  PaymentRecord,
  PhoneAccountRecord,
} from '../types';

type AdminTab =
  | 'overview'
  | 'orders'
  | 'inventory'
  | 'food'
  | 'cakes'
  | 'media'
  | 'coupons'
  | 'charges'
  | 'customers'
  | 'reports';

function toLocalDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function AdminDashboardPage() {
  const {
    user,
    setAdminSessionToken,
    lockAdminSession,
    isAdmin,
    adminRecord,
    foodMenu,
    foodMenuSynced,
    cakeMenu,
    cakeMenuSynced,
    mediaLibrary,
    settings,
    checkoutCharges,
    checkoutChargesSynced,
    serverConfig,
    getApiAuthHeaders,
    getAdminApiAuthHeaders,
  } = useApp();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [allPayments, setAllPayments] = useState<PaymentRecord[]>([]);
  const [allCoupons, setAllCoupons] = useState<CouponRecord[]>([]);
  const [allCustomers, setAllCustomers] = useState<CustomerProfile[]>([]);
  const [allPhoneAccounts, setAllPhoneAccounts] = useState<PhoneAccountRecord[]>([]);
  const [allAdmins, setAllAdmins] = useState<AdminUserRecord[]>([]);

  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [actionMsg, setActionMsg] = useState('');
  const [copiedCouponCode, setCopiedCouponCode] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [unlockingAdmin, setUnlockingAdmin] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState('');
  const [adminCybercrimeWarning, setAdminCybercrimeWarning] = useState('');
  const [unreadSecurityAlerts, setUnreadSecurityAlerts] = useState(0);
  const [couponError, setCouponError] = useState('');

  const [rejectTargetOrderId, setRejectTargetOrderId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [orderItemsCache, setOrderItemsCache] = useState<Record<string, OrderItemRecord[]>>({});

  const {
    allOrders,
    unacceptedOrders,
    unacceptedOrderItems,
    acceptingOrderIds,
    rejectingOrderIds,
    syncingRefundIds,
    orderActionError,
    clearOrderActionError,
    soundState,
    notifPermission,
    enableSound: handleEnableSound,
    requestNotifications: handleRequestNotifications,
    acceptOrder: handleAcceptOrder,
    rejectOrder: handleRejectOrder,
    syncRefundStatus: handleSyncRefundStatus,
  } = useNewOrderAlert({
    user,
    isAdmin,
    getAdminApiAuthHeaders,
    onOrderAccepted: (orderId) => {
      setActionMsg(`Order ${orderId} confirmed and customer notified.`);
      setTimeout(() => setActionMsg(''), 5000);
    },
    onOrderRejected: (orderId, result) => {
      setRejectTargetOrderId(null);
      setRejectReasonInput('');
      setActionMsg(
        result.refundId
          ? `Order ${orderId} rejected. Razorpay refund ${result.refundId} status: ${result.refundStatus || result.status}.`
          : `Order ${orderId} rejected.`
      );
      setTimeout(() => setActionMsg(''), 6000);
    },
  });

  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError('');
    setAdminCybercrimeWarning('');
    const cleaned = adminPassword.trim();
    if (!cleaned) {
      setAdminAuthError('Please enter an admin password.');
      return;
    }

    setUnlockingAdmin(true);
    try {
      let fbUser = auth.currentUser;
      if (!fbUser) {
        fbUser = (await signInAnonymously(auth)).user;
      }
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/admin/unlock', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ password: cleaned }),
      });
      const parsed = await parseApiResponse<{
        unlocked?: boolean;
        sessionToken?: string;
        error?: string;
        cybercrimeWarning?: string;
      }>(res);
      const data = parsed.data;
      if (!parsed.isJson || !data) {
        setAdminAuthError(
          buildUnexpectedApiResponseError(res, 'Admin authentication server is unreachable')
        );
        return;
      }
      if (!res.ok || !data.unlocked || !data.sessionToken) {
        setAdminAuthError(data.error || 'Invalid admin password. Please try again.');
        if (data.cybercrimeWarning) {
          setAdminCybercrimeWarning(data.cybercrimeWarning);
        }
        return;
      }
      setAdminSessionToken(data.sessionToken);
      setAdminPassword('');
      await handleEnableSound();
    } catch (err) {
      setAdminAuthError(
        err instanceof Error ? err.message : 'Unable to unlock Admin Dashboard.'
      );
    } finally {
      setUnlockingAdmin(false);
    }
  };

  // Order Prep / Status editing
  const [prepEdits, setPrepEdits] = useState<Record<string, { minutes: number; note: string }>>({});

  // Food Menu Form
  const [foodForm, setFoodForm] = useState({
    id: '',
    name: '',
    category: 'Starters',
    quantityLabel: '1 serving',
    originalPrice: 100,
    description: '',
    imageUrl: '',
    imageDerivativeUrl: '',
    mediaId: '',
    available: true,
    sortOrder: 100,
  });

  // Cake Form
  const [cakeForm, setCakeForm] = useState({
    id: '',
    name: '',
    cakeType: 'bento' as 'bento' | 'sicle' | 'party',
    quantityLabel: '250 grams',
    originalPrice: 130,
    priceUnit: '',
    flavoursCsv: 'Red Velvet, Chocolate, Pineapple, Vanilla',
    notice: '',
    orderableOnline: true,
    eligibleForAutoDiscount: true,
    description: '',
    imageUrl: '',
    imageDerivativeUrl: '',
    mediaId: '',
    available: true,
    sortOrder: 10,
  });

  // Coupon Form (using local calendar dates)
  const [couponForm, setCouponForm] = useState(() => ({
    code: '',
    discountType: 'fixed' as 'percentage' | 'fixed',
    discountValue: 20,
    minOrderAmount: 0,
    validFrom: toLocalDateInputValue(new Date()),
    validUntil: toLocalDateInputValue(new Date(Date.now() + 30 * 86400000)),
    usageLimit: 100,
    active: true,
  }));

  // Settings Form
  const [settingsForm, setSettingsForm] = useState({
    whatsappNumber: settings.whatsappNumber,
    contactPhone: settings.contactPhone,
    contactEmail: settings.contactEmail,
    defaultPrepMinutes: settings.defaultPrepMinutes,
    deliveryCharge: settings.deliveryCharge,
    handlingCharge: settings.handlingCharge,
    autoDiscountPerItem: settings.autoDiscountPerItem,
    isAcceptingOrders: settings.isAcceptingOrders,
    collectionNotice: settings.collectionNotice,
    studioPhone: settings.studioPhone || '',
    studioEmail: settings.studioEmail || '',
    studioInstagram: settings.studioInstagram || 'https://www.instagram.com/pixel_craft1studio/',
  });

  // Team Admin Add Form
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'super_admin' | 'manager'>('manager');

  // Reports Date Filter
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');

  // Customer Detail Inspection
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomerAddresses, setSelectedCustomerAddresses] = useState<CustomerAddress[]>([]);

  const handleInspectCustomer = async (uid: string) => {
    if (selectedCustomerId === uid) {
      setSelectedCustomerId(null);
      setSelectedCustomerAddresses([]);
      return;
    }
    setSelectedCustomerId(uid);
    try {
      const snap = await getDocs(collection(db, 'customers', uid, 'addresses'));
      setSelectedCustomerAddresses(snap.docs.map((d) => d.data() as CustomerAddress));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `customers/${uid}/addresses`);
    }
  };

  useEffect(() => {
    setSettingsForm({
      whatsappNumber: settings.whatsappNumber || '',
      contactPhone: settings.contactPhone || '',
      contactEmail: settings.contactEmail || '',
      defaultPrepMinutes: settings.defaultPrepMinutes,
      deliveryCharge: settings.deliveryCharge,
      handlingCharge: settings.handlingCharge,
      autoDiscountPerItem: settings.autoDiscountPerItem,
      isAcceptingOrders: settings.isAcceptingOrders,
      collectionNotice: settings.collectionNotice || '',
      studioPhone: settings.studioPhone || '',
      studioEmail: settings.studioEmail || '',
      studioInstagram: settings.studioInstagram || 'https://www.instagram.com/pixel_craft1studio/',
    });
  }, [settings]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    let cancelled = false;
    getAdminApiAuthHeaders()
      .then((headers) =>
        fetch('/api/security/overview', { credentials: 'include', headers })
      )
      .then(async (res) => {
        if (!res.ok) return null;
        const parsed = await parseApiResponse<{ notifications?: Array<{ read?: boolean }> }>(res);
        return parsed.isJson ? parsed.data : null;
      })
      .then((data) => {
        if (!cancelled && data?.notifications) {
          setUnreadSecurityAlerts(data.notifications.filter((n) => !n.read).length);
        }
      })
      .catch(() => {
        // Non-blocking badge fetch
      });

    const unsubPayments = onSnapshot(
      query(collection(db, 'payments'), orderBy('createdAt', 'desc')),
      (snap) => setAllPayments(snap.docs.map((d) => d.data() as PaymentRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubCoupons = onSnapshot(
      collection(db, 'coupons'),
      (snap) => setAllCoupons(snap.docs.map((d) => d.data() as CouponRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'coupons')
    );

    const unsubCustomers = onSnapshot(
      collection(db, 'customers'),
      (snap) => setAllCustomers(snap.docs.map((d) => d.data() as CustomerProfile)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers')
    );

    const unsubPhoneAccounts = onSnapshot(
      collection(db, 'phone_accounts'),
      (snap) => setAllPhoneAccounts(snap.docs.map((d) => d.data() as PhoneAccountRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'phone_accounts')
    );

    const unsubAdmins = onSnapshot(
      collection(db, 'admins'),
      (snap) => setAllAdmins(snap.docs.map((d) => d.data() as AdminUserRecord)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'admins')
    );

    return () => {
      cancelled = true;
      unsubPayments();
      unsubCoupons();
      unsubCustomers();
      unsubPhoneAccounts();
      unsubAdmins();
    };
  }, [user, isAdmin, getAdminApiAuthHeaders]);

  // Fetch itemized order lines when inspecting Orders tab
  useEffect(() => {
    if (!user || !isAdmin || activeTab !== 'orders' || allOrders.length === 0) return;
    let cancelled = false;
    for (const o of allOrders.slice(0, 40)) {
      if (orderItemsCache[o.orderId] || unacceptedOrderItems[o.orderId]) continue;
      getDocs(collection(db, 'orders', o.orderId, 'items'))
        .then((snap) => {
          if (cancelled) return;
          const rows = snap.docs.map((d) => d.data() as OrderItemRecord);
          setOrderItemsCache((prev) => ({ ...prev, [o.orderId]: rows }));
        })
        .catch(() => {
          // Non-blocking fallback to itemsPreview
        });
    }
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, activeTab, allOrders, orderItemsCache, unacceptedOrderItems]);

  // Overview KPIs
  const metrics = useMemo(() => {
    const todayStr = new Date().toDateString();
    let todayOrders = 0;
    let pendingOrders = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;
    let totalRevenue = 0;
    let todayRevenue = 0;

    for (const o of allOrders) {
      const created = toDateSafe(o.createdAt);
      const isToday = created ? created.toDateString() === todayStr : false;
      if (isToday) todayOrders += 1;

      if (
        o.status === 'DELIVERED' ||
        o.status === 'COLLECTED' ||
        o.status === 'Delivered / Collected'
      ) {
        completedOrders += 1;
      } else if (
        o.status === 'REJECTED' ||
        o.status === 'REFUND PROCESSING' ||
        o.status === 'REFUNDED' ||
        o.status === 'Cancelled' ||
        o.status === 'PAYMENT FAILED'
      ) {
        cancelledOrders += 1;
      } else if (o.status !== 'PAYMENT PENDING') {
        pendingOrders += 1;
      }

      if (o.paymentStatus === 'successful' || o.paymentStatus === 'verified') {
        totalRevenue += o.finalAmount;
        if (isToday) todayRevenue += o.finalAmount;
      }
    }

    const successfulPayments = allPayments.filter(
      (p) => p.status === 'successful' || p.status === 'verified'
    ).length;
    const pendingPayments = allPayments.filter((p) => p.status === 'pending').length;
    const failedPayments = allPayments.filter((p) => p.status === 'failed').length;

    return {
      totalOrders: allOrders.length,
      todayOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue,
      todayRevenue,
      successfulPayments,
      pendingPayments,
      failedPayments,
    };
  }, [allOrders, allPayments]);

  const filteredReportsOrders = useMemo(() => {
    return allOrders.filter((o) => {
      const d = toDateSafe(o.createdAt);
      if (!d) return true;
      if (reportStart && d < new Date(reportStart)) return false;
      if (reportEnd) {
        const endD = new Date(reportEnd);
        endD.setHours(23, 59, 59, 999);
        if (d > endD) return false;
      }
      return true;
    });
  }, [allOrders, reportStart, reportEnd]);

  const showNotice = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 4000);
  };

  const recordAdminAudit = async (action: string, target: string, details: string) => {
    try {
      const headers = await getAdminApiAuthHeaders();
      await fetch('/api/security/audit-action', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ action, target, details }),
      });
    } catch {
      // Non-blocking audit log
    }
  };

  const handleUpdateOrderStatus = async (order: OrderRecord, newStatus: OrderStatus) => {
    if (!user) return;
    if (order.adminAccepted !== true) {
      showNotice('Please verify and Accept this order before advancing kitchen status.');
      return;
    }
    try {
      const prepEdit = prepEdits[order.orderId];
      const prepMinutes = prepEdit?.minutes || order.estimatedPrepMinutes;
      const readySoonerNotice = prepEdit?.note?.trim() || order.readySoonerNotice || '';

      const batch = writeBatch(db);
      const orderUpdate: Record<string, unknown> = {
        status: newStatus,
        estimatedPrepMinutes: prepMinutes,
        updatedAt: serverTimestamp(),
      };
      if (readySoonerNotice) {
        orderUpdate.readySoonerNotice = readySoonerNotice.slice(0, 200);
      }
      batch.update(doc(db, 'orders', order.orderId), orderUpdate);

      const histId = `hist_${Date.now()}`;
      let note = `Updated to ${newStatus}`;
      if (newStatus === 'OUT FOR DELIVERY' || newStatus === 'Out for Delivery') {
        note = DELIVERY_TRANSIT_MESSAGE;
      }
      if (newStatus === 'READY FOR COLLECTION' || newStatus === 'Ready for Collection') {
        note = COLLECTION_READY_MESSAGE;
      }

      batch.set(doc(db, 'orders', order.orderId, 'status_history', histId), {
        id: histId,
        orderId: order.orderId,
        customerId: order.customerId,
        status: newStatus,
        note,
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
      });
      await batch.commit();

      const notifId = `notif_${Date.now()}`;
      await setDoc(doc(db, 'customers', order.customerId, 'notifications', notifId), {
        id: notifId,
        customerId: order.customerId,
        orderId: order.orderId,
        title: newStatus,
        message: note,
        smsSent: false,
        smsStatusDetail: 'Live in-website order notification delivered.',
        read: false,
        createdAt: serverTimestamp(),
      });

      await recordAdminAudit('UPDATE_ORDER_STATUS', `orders/${order.orderId}`, `Status changed to ${newStatus}`);
      showNotice(`Order ${order.orderId} updated to "${newStatus}".`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.orderId}`);
    }
  };

  const handleSeedOfficialFoodMenu = async () => {
    try {
      const batch = writeBatch(db);
      for (const item of INITIAL_FOOD_MENU) {
        batch.set(
          doc(db, 'food_menu', item.id),
          {
            ...stripUndefinedFields(item as unknown as Record<string, unknown>),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
      showNotice('Official 26-item Food Menu synced to Firestore.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'food_menu');
    }
  };

  const handleSeedOfficialCakeMenu = async () => {
    try {
      const batch = writeBatch(db);
      for (const cake of INITIAL_CAKE_MENU) {
        batch.set(
          doc(db, 'cake_menu', cake.id),
          {
            ...stripUndefinedFields(cake as unknown as Record<string, unknown>),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
      showNotice('Official Cakes catalog synced to Firestore.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'cake_menu');
    }
  };

  const handleSaveFoodItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const id =
      foodForm.id.trim() ||
      foodForm.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    if (!id || !foodForm.name.trim()) return;
    try {
      const payload: Record<string, unknown> = {
        id,
        name: foodForm.name.trim().slice(0, 100),
        category: foodForm.category,
        quantityLabel: foodForm.quantityLabel.trim().slice(0, 60),
        originalPrice: Math.max(1, Math.round(Number(foodForm.originalPrice))),
        description: foodForm.description.trim().slice(0, 300),
        imageUrl: foodForm.imageUrl.trim().slice(0, 1000),
        available: foodForm.available,
        sortOrder: Math.max(0, Math.round(Number(foodForm.sortOrder))),
        updatedAt: serverTimestamp(),
      };
      if (foodForm.imageDerivativeUrl.trim()) {
        payload.imageDerivativeUrl = foodForm.imageDerivativeUrl.trim().slice(0, 1000);
      }
      if (foodForm.mediaId.trim()) {
        payload.mediaId = foodForm.mediaId.trim().slice(0, 120);
      }
      await setDoc(doc(db, 'food_menu', id), stripUndefinedFields(payload), { merge: true });
      setFoodForm({
        id: '',
        name: '',
        category: 'Starters',
        quantityLabel: '1 serving',
        originalPrice: 100,
        description: '',
        imageUrl: '',
        imageDerivativeUrl: '',
        mediaId: '',
        available: true,
        sortOrder: 100,
      });
      showNotice(`Food item "${foodForm.name}" saved.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `food_menu/${id}`);
    }
  };

  const handleToggleFoodAvailability = async (item: FoodMenuItem) => {
    try {
      const ref = doc(db, 'food_menu', item.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          available: !item.available,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(
          ref,
          {
            ...stripUndefinedFields(item as unknown as Record<string, unknown>),
            available: !item.available,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `food_menu/${item.id}`);
    }
  };

  const handleDeleteFoodItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'food_menu', id));
      showNotice('Food item deleted.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `food_menu/${id}`);
    }
  };

  const handleSaveCakeItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const id =
      cakeForm.id.trim() ||
      cakeForm.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    if (!id || !cakeForm.name.trim()) return;
    const flavours = cakeForm.flavoursCsv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    try {
      const payload: Record<string, unknown> = {
        id,
        name: cakeForm.name.trim().slice(0, 100),
        cakeType: cakeForm.cakeType,
        quantityLabel: cakeForm.quantityLabel.trim().slice(0, 60),
        originalPrice: Math.max(1, Math.round(Number(cakeForm.originalPrice))),
        priceUnit: cakeForm.priceUnit.trim().slice(0, 40),
        flavours,
        notice: cakeForm.notice.trim().slice(0, 200),
        orderableOnline: cakeForm.orderableOnline,
        eligibleForAutoDiscount: cakeForm.eligibleForAutoDiscount,
        description: cakeForm.description.trim().slice(0, 400),
        imageUrl: cakeForm.imageUrl.trim().slice(0, 1000),
        available: cakeForm.available,
        sortOrder: Math.max(0, Math.round(Number(cakeForm.sortOrder))),
        updatedAt: serverTimestamp(),
      };
      if (cakeForm.imageDerivativeUrl.trim()) {
        payload.imageDerivativeUrl = cakeForm.imageDerivativeUrl.trim().slice(0, 1000);
      }
      if (cakeForm.mediaId.trim()) {
        payload.mediaId = cakeForm.mediaId.trim().slice(0, 120);
      }
      await setDoc(doc(db, 'cake_menu', id), stripUndefinedFields(payload), { merge: true });
      showNotice(`Cake "${cakeForm.name}" saved.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `cake_menu/${id}`);
    }
  };

  const handleToggleCakeAvailability = async (cake: CakeMenuItem) => {
    try {
      const ref = doc(db, 'cake_menu', cake.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          available: !cake.available,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(
          ref,
          {
            ...stripUndefinedFields(cake as unknown as Record<string, unknown>),
            available: !cake.available,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `cake_menu/${cake.id}`);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    const code = sanitizeCouponCode(couponForm.code);
    if (code.length < 2) {
      setCouponError('Coupon code must be at least 2 letters or digits (A–Z, 0–9, _, -).');
      return;
    }
    const discountValue = Math.min(50000, Math.max(1, Math.round(Number(couponForm.discountValue) || 0)));
    if (couponForm.discountType === 'percentage' && discountValue > 100) {
      setCouponError('Percentage discount cannot exceed 100%.');
      return;
    }
    const minOrderAmount = Math.min(
      50000,
      Math.max(0, Math.round(Number(couponForm.minOrderAmount) || 0))
    );
    const usageLimit = Math.min(
      1000000,
      Math.max(0, Math.round(Number(couponForm.usageLimit) || 0))
    );

    const fromDate = couponForm.validFrom
      ? new Date(`${couponForm.validFrom}T00:00:00`)
      : new Date(Date.now() - 60000);
    const untilDate = couponForm.validUntil
      ? new Date(`${couponForm.validUntil}T23:59:59`)
      : new Date(Date.now() + 30 * 86400000);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(untilDate.getTime())) {
      setCouponError('Please select valid start and end dates for the coupon.');
      return;
    }
    if (untilDate < fromDate) {
      setCouponError('Valid Until date must be on or after Valid From date.');
      return;
    }

    const existing = allCoupons.find((c) => c.code === code);
    try {
      if (existing) {
        await updateDoc(doc(db, 'coupons', code), {
          discountType: couponForm.discountType,
          discountValue,
          minOrderAmount,
          validFrom: Timestamp.fromDate(fromDate),
          validUntil: Timestamp.fromDate(untilDate),
          usageLimit,
          active: couponForm.active,
          updatedAt: serverTimestamp(),
        });
        showNotice(`Coupon ${code} updated.`);
      } else {
        await setDoc(doc(db, 'coupons', code), {
          code,
          discountType: couponForm.discountType,
          discountValue,
          minOrderAmount,
          validFrom: Timestamp.fromDate(fromDate),
          validUntil: Timestamp.fromDate(untilDate),
          usageLimit,
          usedCount: 0,
          active: couponForm.active,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showNotice(`Coupon ${code} created and ready for customers.`);
      }
      setCouponForm((prev) => ({ ...prev, code: '' }));
    } catch (err) {
      setCouponError(
        err instanceof Error ? err.message : `Unable to save coupon ${code}.`
      );
    }
  };

  const handleToggleCoupon = async (coupon: CouponRecord) => {
    try {
      await updateDoc(doc(db, 'coupons', coupon.code), {
        active: !coupon.active,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `coupons/${coupon.code}`);
    }
  };

  const handleDeleteCoupon = async (code: string) => {
    try {
      await deleteDoc(doc(db, 'coupons', code));
      showNotice(`Coupon ${code} deleted.`);
      await recordAdminAudit('DELETE_COUPON', `coupons/${code}`, `Deleted coupon ${code}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `coupons/${code}`);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const deliveryRow = checkoutCharges.find((c) => c.id === 'delivery');
      const handlingRow = checkoutCharges.find((c) => c.id === 'handling');
      const syncedDelivery = checkoutChargesSynced
        ? deliveryRow && deliveryRow.enabled && deliveryRow.type === 'fixed'
          ? Math.max(0, Math.round(deliveryRow.amount))
          : 0
        : Math.max(0, Math.round(Number(settingsForm.deliveryCharge)));
      const syncedHandling = checkoutChargesSynced
        ? handlingRow && handlingRow.enabled && handlingRow.type === 'fixed'
          ? Math.max(0, Math.round(handlingRow.amount))
          : 0
        : Math.max(0, Math.round(Number(settingsForm.handlingCharge)));

      await setDoc(
        doc(db, 'restaurant_settings', 'config'),
        stripUndefinedFields({
          brandName: BRAND_NAME,
          tagline: 'TASTE. TRUST. REPEAT.',
          whatsappNumber: settingsForm.whatsappNumber.trim().slice(0, 20),
          contactPhone: settingsForm.contactPhone.trim().slice(0, 20),
          contactEmail: settingsForm.contactEmail.trim().slice(0, 120),
          defaultPrepMinutes: Math.max(5, Math.round(Number(settingsForm.defaultPrepMinutes))),
          deliveryCharge: syncedDelivery,
          handlingCharge: syncedHandling,
          autoDiscountPerItem: Math.max(0, Math.round(Number(settingsForm.autoDiscountPerItem))),
          isAcceptingOrders: settingsForm.isAcceptingOrders,
          ...(settings.checkoutChargesConfigured ? { checkoutChargesConfigured: true } : {}),
          collectionNotice: settingsForm.collectionNotice.trim().slice(0, 240),
          studioPhone: settingsForm.studioPhone.trim().slice(0, 20),
          studioEmail: settingsForm.studioEmail.trim().slice(0, 120),
          studioInstagram: settingsForm.studioInstagram.trim().slice(0, 200),
          updatedAt: serverTimestamp(),
        })
      );
      await recordAdminAudit(
        'UPDATE_SETTINGS',
        'restaurant_settings/config',
        'Updated restaurant operational & Pixel Craft Studio contact settings'
      );
      showNotice('Restaurant settings saved.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'restaurant_settings/config');
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = newAdminUid.trim();
    if (!uid || !newAdminName.trim()) return;
    try {
      const adminRef = doc(db, 'admins', uid);
      const existingSnap = await getDoc(adminRef);
      if (existingSnap.exists()) {
        await updateDoc(adminRef, {
          name: newAdminName.trim().slice(0, 100),
          phone: newAdminPhone.trim().slice(0, 20),
          role: newAdminRole,
          active: true,
        });
      } else {
        await setDoc(adminRef, {
          uid,
          name: newAdminName.trim().slice(0, 100),
          phone: newAdminPhone.trim().slice(0, 20),
          role: newAdminRole,
          active: true,
          createdAt: serverTimestamp(),
        });
      }
      setNewAdminUid('');
      setNewAdminName('');
      setNewAdminPhone('');
      showNotice(`Admin access granted to ${uid}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`);
    }
  };

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handlePhotoUpload = async (
    file: File,
    category: MediaCategory,
    displayLabel: string,
    onResult: (result: { imageUrl: string; imageDerivativeUrl: string; mediaId: string }) => void
  ) => {
    if (!user) return;
    setUploadingPhoto(true);
    setUploadProgress(2);
    try {
      const asset = await uploadMediaToFirebaseStorage({
        file,
        displayLabel: displayLabel.trim() || file.name.replace(/\.[^.]+$/, ''),
        mediaCategory: category,
        uploadedByUid: user.uid,
        getAdminApiAuthHeaders,
        onProgress: (pct) => setUploadProgress(pct),
      });
      onResult({
        imageUrl: asset.downloadUrl,
        imageDerivativeUrl: asset.derivativeUrl || '',
        mediaId: asset.mediaId,
      });
      await recordAdminAudit(
        'UPLOAD_IMAGE',
        `media_library/${asset.mediaId}`,
        `Uploaded ${asset.fileFormat} (${file.size} bytes) to Firebase Storage`
      );
      showNotice('Photograph verified & saved permanently to Firebase Storage and Media Library.');
    } catch (err) {
      showNotice(
        err instanceof Error
          ? `Photo upload failed: ${err.message}`
          : 'Photo upload failed.'
      );
    } finally {
      setUploadingPhoto(false);
      setUploadProgress(0);
    }
  };

  const exportCsvReport = () => {
    const header = ['OrderID', 'Date', 'Customer', 'Phone', 'Fulfillment', 'Status', 'PaymentStatus', 'FinalAmount'];
    const rows = filteredReportsOrders.map((o) => [
      o.orderId,
      formatDateTime(o.createdAt).replace(/,/g, ''),
      o.customerName.replace(/,/g, ' '),
      o.customerPhone,
      o.fulfillmentType,
      o.status,
      o.paymentStatus,
      String(o.finalAmount),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zaikora_orders_report_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Backend-Verified Admin Authentication Gate (No Email / Google / Plaintext Passwords in Browser)
  if (!isAdmin) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12 bg-[#FAFAFA]">
        <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-[#0A0A0B] text-white p-7 text-center border-b border-zinc-800">
            <BrandLogo className="h-20 w-auto mx-auto mb-3" />
            <h1 className="text-xl font-bold tracking-tight">{BRAND_NAME} Admin Panel</h1>
            <p className="text-xs tracking-widest text-[#E88D14] mt-1">
              AUTHORISED ADMIN ACCESS
            </p>
          </div>

          <form onSubmit={handleAdminUnlock} className="p-7 space-y-4">
            {adminAuthError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="font-medium">{adminAuthError}</span>
                </div>
                {adminCybercrimeWarning && (
                  <p className="pl-6 text-[11px] font-semibold text-red-900">
                    {adminCybercrimeWarning}
                  </p>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="admin-password" className="block text-xs font-semibold text-zinc-700">
                  Admin Password *
                </label>
                <button
                  type="button"
                  onClick={() => setShowAdminPassword((p) => !p)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D97706] hover:underline"
                >
                  {showAdminPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showAdminPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <div className="flex items-center border border-zinc-300 rounded-lg overflow-hidden focus-within:border-[#E88D14]">
                <span className="pl-3.5 text-zinc-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="admin-password"
                  type={showAdminPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={unlockingAdmin}
              className="w-full py-3 px-4 bg-[#E88D14] text-black font-semibold text-sm rounded-lg hover:bg-[#f39c25] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>{unlockingAdmin ? 'Verifying...' : 'Open Admin Dashboard'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const displayedOrders =
    statusFilter === 'All'
      ? allOrders
      : allOrders.filter((o) => o.status === statusFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Admin Header */}
      <div className="bg-[#0A0A0B] text-white rounded-2xl border border-zinc-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <BrandLogo className="h-14 w-auto" />
          <div>
            <p className="text-xs font-medium tracking-widest text-[#E88D14]">
              {BRAND_NAME} · ADMIN DASHBOARD
            </p>
            <h1 className="text-xl sm:text-2xl font-bold">Kitchen & Store Operations</h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Authorised Session ({adminRecord?.name || 'ZAIKORA Admin'})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={handleEnableSound}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
              soundState === 'running'
                ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300'
                : soundState === 'blocked'
                ? 'border-red-500 bg-red-950 text-red-200 hover:bg-red-900'
                : 'border-amber-600 bg-amber-950/60 text-amber-200 hover:bg-amber-900/70'
            }`}
          >
            {soundState === 'running' ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
            <span>
              {soundState === 'running'
                ? 'Bell Sound Active'
                : soundState === 'blocked'
                ? 'Sound Blocked — Enable Sound'
                : 'Enable Sound'}
            </span>
          </button>

          {notifPermission === 'default' && (
            <button
              type="button"
              onClick={handleRequestNotifications}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-[#E88D14] hover:text-[#E88D14] transition-colors font-semibold"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Enable Browser Alerts</span>
            </button>
          )}

          <Link
            to="/admin/security"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-[#E88D14] hover:text-[#E88D14] transition-colors font-semibold"
          >
            <Shield className="w-3.5 h-3.5 text-[#E88D14]" />
            <span>Security Centre</span>
            {unreadSecurityAlerts > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 rounded bg-red-600 text-white text-[10px] font-mono tabular-nums">
                {unreadSecurityAlerts}
              </span>
            )}
          </Link>

          <span
            className={`px-3 py-1.5 rounded-lg border ${
              serverConfig.razorpayConfigured
                ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300'
                : 'border-amber-700 bg-amber-950/60 text-amber-300'
            }`}
          >
            Razorpay:{' '}
            {serverConfig.razorpayConfigured
              ? serverConfig.razorpayMode === 'live'
                ? 'Live Ready'
                : serverConfig.razorpayMode === 'test'
                ? 'Test Mode'
                : 'Configured'
              : serverConfig.razorpayMode === 'test' && serverConfig.isProductionEnv
              ? 'Test Blocked in Prod'
              : 'Keys Needed'}
          </span>
          <button
            type="button"
            onClick={lockAdminSession}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-red-400 hover:text-red-300 transition-colors font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Prominent Continuous Incoming Paid-Order Verification Panel */}
      {unacceptedOrders.length > 0 && (
        <section
          aria-live="assertive"
          className="bg-amber-50 border-2 border-[#E88D14] rounded-2xl p-5 sm:p-6 space-y-4 shadow-lg"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#E88D14] text-black flex items-center justify-center shrink-0 animate-pulse">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-900">
                  {unacceptedOrders.length} Paid{' '}
                  {unacceptedOrders.length === 1 ? 'Order' : 'Orders'} — Pending Admin Approval
                </h2>
                <p className="text-xs text-zinc-700">
                  {soundState === 'running'
                    ? 'Bell alert ("Tring! Tring! Tring! Tring!") rings continuously until accepted or rejected.'
                    : 'Your browser paused automatic audio playback. Click Enable Sound to start ringing.'}
                </p>
              </div>
            </div>

            {soundState !== 'running' && (
              <button
                type="button"
                onClick={handleEnableSound}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors shrink-0"
              >
                <Volume2 className="w-4 h-4" />
                <span>Enable Sound</span>
              </button>
            )}
          </div>

          <div className="space-y-3">
            {unacceptedOrders.map((order) => {
              const fetchedItems = unacceptedOrderItems[order.orderId] || orderItemsCache[order.orderId];
              const isRejectingOpen = rejectTargetOrderId === order.orderId;
              const isBusy =
                Boolean(acceptingOrderIds[order.orderId]) ||
                Boolean(rejectingOrderIds[order.orderId]);

              return (
                <div
                  key={order.orderId}
                  className="bg-white border border-amber-300 rounded-xl p-4 sm:p-5 space-y-3 shadow-xs"
                >
                  {order.reviewFlagged && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">
                          Review Warning — Flagged for Manual Kitchen Verification
                          {typeof order.suspiciousScore === 'number'
                            ? ` (Risk Score: ${order.suspiciousScore}/100)`
                            : ''}
                        </p>
                        {order.reviewFlagReason && (
                          <p className="mt-0.5 text-red-800">{order.reviewFlagReason}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded">
                          {order.orderId}
                        </span>
                        <span className="font-semibold text-zinc-900">{order.customerName}</span>
                        <span className="font-mono text-zinc-600">{order.customerPhone}</span>
                        {order.customerEmail && (
                          <span className="text-zinc-500">{order.customerEmail}</span>
                        )}
                        <span className="px-2 py-0.5 rounded font-semibold uppercase text-[11px] bg-emerald-100 text-emerald-900">
                          Payment: {order.paymentStatus}
                        </span>
                        {order.razorpayPaymentId && (
                          <span className="font-mono text-[11px] text-zinc-600">
                            Txn: {order.razorpayPaymentId}
                          </span>
                        )}
                        <span className="text-[11px] text-zinc-500">
                          {formatDateTime(order.createdAt)}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-700">
                        <p className="font-semibold text-zinc-900 mb-1">Items &amp; Quantities:</p>
                        {fetchedItems && fetchedItems.length > 0 ? (
                          <ul className="space-y-0.5 pl-1">
                            {fetchedItems.map((it) => (
                              <li key={it.id} className="flex items-center justify-between max-w-md gap-3">
                                <span>
                                  {it.quantity} × {it.name}
                                  {it.selectedFlavour ? ` (${it.selectedFlavour})` : ''}
                                </span>
                                <span className="font-mono tabular-nums text-zinc-900">
                                  {formatRupees(it.lineTotal)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span>{order.itemsPreview || `${order.totalItemCount} item(s)`}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
                        <span>
                          Total Paid:{' '}
                          <strong className="text-sm font-mono tabular-nums text-zinc-900">
                            {formatRupees(order.finalAmount)}
                          </strong>{' '}
                          {Array.isArray(order.appliedCharges) && order.appliedCharges.length > 0
                            ? `(${order.appliedCharges
                                .map((c) =>
                                  `${c.name}: ${c.isFree ? 'FREE' : formatRupees(c.calculatedAmount)}`
                                )
                                .join(', ')})`
                            : `(Delivery ${formatRupees(order.deliveryCharge)}, Handling ${formatRupees(order.handlingCharge)})`}
                        </span>
                        <span>
                          <strong>
                            {order.fulfillmentType === 'delivery' ? 'Delivery' : 'Self-Collection'}:
                          </strong>{' '}
                          {order.deliveryAddressSummary}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleAcceptOrder(order)}
                        className="px-5 py-2.5 bg-emerald-600 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-emerald-700 transition-colors whitespace-nowrap disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {acceptingOrderIds[order.orderId] ? 'Accepting...' : 'ACCEPT ORDER'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          clearOrderActionError();
                          if (isRejectingOpen) {
                            setRejectTargetOrderId(null);
                          } else {
                            setRejectTargetOrderId(order.orderId);
                            setRejectReasonInput('');
                          }
                        }}
                        className="px-4 py-2.5 bg-white border border-red-300 text-red-700 font-bold text-xs sm:text-sm rounded-xl hover:bg-red-50 transition-colors whitespace-nowrap disabled:opacity-60 flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>{isRejectingOpen ? 'Cancel' : 'REJECT ORDER'}</span>
                      </button>
                    </div>
                  </div>

                  {isRejectingOpen && (
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2.5">
                      <p className="text-xs font-bold text-red-950">
                        Reject Order &amp; Initiate Full Razorpay Refund ({formatRupees(order.finalAmount)})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'Item currently out of stock',
                          'Kitchen unable to fulfil right now',
                          'Duplicate or suspicious order flagged on review',
                          'Delivery location outside serviceable gate',
                        ].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setRejectReasonInput(preset)}
                            className="px-2.5 py-1 bg-white border border-red-200 rounded-md text-[11px] font-medium text-red-900 hover:bg-red-100"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={rejectReasonInput}
                          onChange={(e) => setRejectReasonInput(e.target.value)}
                          placeholder="Enter mandatory rejection reason (shown to customer)..."
                          maxLength={290}
                          className="flex-1 px-3 py-2 bg-white border border-red-300 rounded-lg text-xs"
                        />
                        <button
                          type="button"
                          disabled={isBusy || rejectReasonInput.trim().length < 3}
                          onClick={() => handleRejectOrder(order, rejectReasonInput)}
                          className="px-4 py-2 bg-red-700 text-white text-xs font-bold rounded-lg hover:bg-red-800 disabled:opacity-50 whitespace-nowrap"
                        >
                          {rejectingOrderIds[order.orderId]
                            ? 'Processing Refund...'
                            : 'Confirm Reject & Refund'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {orderActionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs sm:text-sm text-red-900 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>
              <strong className="font-mono">{orderActionError.orderId}:</strong>{' '}
              {orderActionError.message}
            </span>
          </div>
          <button
            type="button"
            onClick={clearOrderActionError}
            className="text-xs font-semibold text-red-800 underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-zinc-200">
        {(() => {
          const alertStockCount = [...foodMenu, ...cakeMenu].filter((item) => {
            const c = getInventoryStatusMeta(item).code;
            return c === 'LOW_STOCK' || c === 'SOLD_OUT';
          }).length;
          return [
            { id: 'overview', label: 'Overview', icon: BarChart3, badge: 0 },
            { id: 'orders', label: `Orders (${allOrders.length})`, icon: ClipboardList, badge: 0 },
            { id: 'inventory', label: 'Inventory / Stock', icon: Boxes, badge: alertStockCount },
            { id: 'food', label: 'Food Menu', icon: UtensilsCrossed, badge: 0 },
            { id: 'cakes', label: 'Cakes', icon: Cake, badge: 0 },
            { id: 'media', label: `Media Library (${mediaLibrary.length})`, icon: ImageIcon, badge: 0 },
            { id: 'coupons', label: 'Coupons', icon: Tag, badge: 0 },
            { id: 'charges', label: 'Charges & Fees', icon: Receipt, badge: 0 },
            { id: 'customers', label: 'Customers', icon: Users, badge: 0 },
            { id: 'reports', label: 'Reports & Settings', icon: Settings, badge: 0 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#0A0A0B] text-white'
                    : 'bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500 text-black text-[10px] font-mono font-bold">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          });
        })()}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Orders', value: metrics.totalOrders },
              { label: "Today's Orders", value: metrics.todayOrders },
              { label: 'Pending Orders', value: metrics.pendingOrders },
              { label: 'Completed Orders', value: metrics.completedOrders },
              { label: 'Cancelled Orders', value: metrics.cancelledOrders },
              { label: 'Total Revenue', value: formatRupees(metrics.totalRevenue) },
              { label: "Today's Revenue", value: formatRupees(metrics.todayRevenue) },
              { label: 'Successful Payments', value: metrics.successfulPayments },
              { label: 'Pending Payments', value: metrics.pendingPayments },
              { label: 'Failed Payments', value: metrics.failedPayments },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white border border-zinc-200 rounded-xl p-5 space-y-1.5"
              >
                <p className="text-xs text-zinc-500 font-medium">{kpi.label}</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-zinc-900">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {(!foodMenuSynced || !cakeMenuSynced) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-sm text-amber-950">
                <p className="font-semibold">Initialize Firestore Menu Catalog</p>
                <p className="text-xs mt-0.5">
                  Sync the official 26 Food Menu items and 3 Cakes into Firestore so edits reflect live.
                </p>
              </div>
              <div className="flex gap-2">
                {!foodMenuSynced && (
                  <button
                    type="button"
                    onClick={handleSeedOfficialFoodMenu}
                    className="px-4 py-2 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg"
                  >
                    Sync Food Menu
                  </button>
                )}
                {!cakeMenuSynced && (
                  <button
                    type="button"
                    onClick={handleSeedOfficialCakeMenu}
                    className="px-4 py-2 bg-[#E88D14] text-black text-xs font-semibold rounded-lg"
                  >
                    Sync Cakes
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ORDER MANAGEMENT */}
      {activeTab === 'orders' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {[
              'All',
              'PENDING ADMIN APPROVAL',
              'CONFIRMED',
              'PREPARING',
              'READY',
              'OUT FOR DELIVERY',
              'READY FOR COLLECTION',
              'DELIVERED',
              'COLLECTED',
              'REJECTED',
              'REFUND PROCESSING',
              'REFUNDED',
              'PAYMENT PENDING',
              'PAYMENT FAILED',
              ...(allOrders.some((o) =>
                [...LEGACY_ORDER_STATUS_SEQUENCE, 'Cancelled'].includes(o.status)
              )
                ? [...LEGACY_ORDER_STATUS_SEQUENCE, 'Cancelled']
                : []),
            ].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                  statusFilter === st
                    ? 'bg-[#0A0A0B] text-white border-[#0A0A0B]'
                    : 'bg-white text-zinc-700 border-zinc-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {displayedOrders.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-500">
              No orders in this filter.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedOrders.map((order) => {
                const edit = prepEdits[order.orderId] || {
                  minutes: order.estimatedPrepMinutes,
                  note: order.readySoonerNotice || '',
                };
                const orderItems = unacceptedOrderItems[order.orderId] || orderItemsCache[order.orderId];
                const awaitingApproval = isOrderPendingAdminApproval(order);
                const isRejectingHere = rejectTargetOrderId === `tab_${order.orderId}`;
                const isBusy =
                  Boolean(acceptingOrderIds[order.orderId]) ||
                  Boolean(rejectingOrderIds[order.orderId]);
                const nextStages: OrderStatus[] = [
                  'PREPARING',
                  'READY',
                  order.fulfillmentType === 'delivery'
                    ? 'OUT FOR DELIVERY'
                    : 'READY FOR COLLECTION',
                  order.fulfillmentType === 'delivery' ? 'DELIVERED' : 'COLLECTED',
                ];

                return (
                  <div
                    key={order.orderId}
                    className={`bg-white border rounded-xl p-6 space-y-4 ${
                      order.reviewFlagged
                        ? 'border-red-300'
                        : awaitingApproval
                        ? 'border-[#E88D14]'
                        : 'border-zinc-200'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span className="font-mono font-bold text-zinc-900">{order.orderId}</span>
                          <span>·</span>
                          <span>{formatDateTime(order.createdAt)}</span>
                          <span>·</span>
                          <span className="uppercase font-semibold">
                            Payment: {order.paymentStatus}
                          </span>
                          {order.razorpayPaymentId && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-[11px]">
                                Pay ID: {order.razorpayPaymentId}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-zinc-900 mt-1">
                          {order.customerName} ({order.customerPhone})
                          {order.customerEmail ? ` · ${order.customerEmail}` : ''} —{' '}
                          <span className="font-mono">{formatRupees(order.finalAmount)}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {order.reviewFlagged && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-800 rounded-md text-[11px] font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Review Flagged
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                            order.status === 'REJECTED' || order.status === 'PAYMENT FAILED'
                              ? 'bg-red-50 text-red-700'
                              : order.status === 'REFUNDED' ||
                                order.status === 'DELIVERED' ||
                                order.status === 'COLLECTED'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-amber-50 text-[#B45309]'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                    </div>

                    {order.reviewFlagged && order.reviewFlagReason && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900">
                        <strong>Review Warning:</strong> {order.reviewFlagReason}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-600">
                      <div className="space-y-1">
                        <p className="font-semibold text-zinc-900">Ordered Items</p>
                        {orderItems && orderItems.length > 0 ? (
                          <ul className="space-y-0.5">
                            {orderItems.map((it) => (
                              <li key={it.id} className="flex justify-between gap-2 max-w-md">
                                <span>
                                  {it.quantity} × {it.name}
                                  {it.selectedFlavour ? ` (${it.selectedFlavour})` : ''}
                                </span>
                                <span className="font-mono text-zinc-900">
                                  {formatRupees(it.lineTotal)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>{order.itemsPreview || `${order.totalItemCount} item(s)`}</p>
                        )}
                        <p className="text-[11px] text-zinc-500 pt-1">
                          {Array.isArray(order.appliedCharges) && order.appliedCharges.length > 0
                            ? order.appliedCharges
                                .map((c) =>
                                  `${c.name}: ${c.isFree ? 'FREE (₹0)' : formatRupees(c.calculatedAmount)}`
                                )
                                .join(' · ')
                            : `Delivery: ${formatRupees(order.deliveryCharge)} · Handling: ${formatRupees(order.handlingCharge)}`}
                          {order.couponCode
                            ? ` · Coupon ${order.couponCode}: −${formatRupees(order.couponDiscount)}`
                            : ''}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold text-zinc-900">
                          {order.fulfillmentType === 'delivery'
                            ? 'Delivery Location'
                            : 'Self-Collection Location'}
                        </p>
                        <p>{order.deliveryAddressSummary}</p>
                      </div>
                    </div>

                    {(order.rejectionReason || order.refundId || order.refundStatus) && (
                      <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs space-y-1.5">
                        {order.rejectionReason && (
                          <p className="text-red-800">
                            <strong>Rejection Reason:</strong> {order.rejectionReason}
                          </p>
                        )}
                        {(order.refundId || order.refundStatus) && (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-zinc-700">
                              <strong>Refund Status:</strong> {order.refundStatus || 'Initiated'}
                              {order.refundId ? ` · Ref: ${order.refundId}` : ''}
                              {order.refundAmount ? ` · Amount: ${formatRupees(order.refundAmount)}` : ''}
                            </p>
                            {order.refundId && order.refundStatus === 'Refund Processing' && (
                              <button
                                type="button"
                                disabled={Boolean(syncingRefundIds[order.orderId])}
                                onClick={() => handleSyncRefundStatus(order)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-300 rounded-md text-[11px] font-semibold text-zinc-900 hover:bg-zinc-100"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>
                                  {syncingRefundIds[order.orderId]
                                    ? 'Checking Razorpay...'
                                    : 'Sync Refund Status'}
                                </span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {awaitingApproval ? (
                      <div className="pt-3 border-t border-zinc-100 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs font-medium text-amber-900">
                            Verified paid order awaiting kitchen acceptance or rejection.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleAcceptOrder(order, {
                                  estimatedPrepMinutes: edit.minutes,
                                  note: edit.note.trim() || undefined,
                                })
                              }
                              className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                {acceptingOrderIds[order.orderId] ? 'Accepting...' : 'ACCEPT ORDER'}
                              </span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                clearOrderActionError();
                                if (isRejectingHere) {
                                  setRejectTargetOrderId(null);
                                } else {
                                  setRejectTargetOrderId(`tab_${order.orderId}`);
                                  setRejectReasonInput('');
                                }
                              }}
                              className="px-4 py-2 bg-white border border-red-300 text-red-700 text-xs font-bold rounded-lg hover:bg-red-50 disabled:opacity-60 inline-flex items-center gap-1.5"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{isRejectingHere ? 'Cancel' : 'REJECT ORDER'}</span>
                            </button>
                          </div>
                        </div>

                        {isRejectingHere && (
                          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg space-y-2">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={rejectReasonInput}
                                onChange={(e) => setRejectReasonInput(e.target.value)}
                                placeholder="Enter mandatory rejection reason (initiates 100% Razorpay refund)..."
                                maxLength={290}
                                className="flex-1 px-3 py-2 bg-white border border-red-300 rounded-lg text-xs"
                              />
                              <button
                                type="button"
                                disabled={isBusy || rejectReasonInput.trim().length < 3}
                                onClick={() => handleRejectOrder(order, rejectReasonInput)}
                                className="px-4 py-2 bg-red-700 text-white text-xs font-bold rounded-lg hover:bg-red-800 disabled:opacity-50"
                              >
                                {rejectingOrderIds[order.orderId]
                                  ? 'Refunding...'
                                  : 'Confirm Reject & Refund'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : order.adminAccepted === true && !isOrderCompletedOrClosed(order.status) ? (
                      <div className="pt-3 border-t border-zinc-100 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                        <div className="lg:col-span-2">
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Prep Mins
                          </label>
                          <input
                            type="number"
                            min={5}
                            max={1440}
                            value={edit.minutes}
                            onChange={(e) =>
                              setPrepEdits((prev) => ({
                                ...prev,
                                [order.orderId]: { ...edit, minutes: Number(e.target.value) },
                              }))
                            }
                            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                          />
                        </div>
                        <div className="lg:col-span-4">
                          <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                            Customer Ready-Sooner / Kitchen Note
                          </label>
                          <input
                            type="text"
                            maxLength={200}
                            value={edit.note}
                            onChange={(e) =>
                              setPrepEdits((prev) => ({
                                ...prev,
                                [order.orderId]: { ...edit, note: e.target.value },
                              }))
                            }
                            placeholder="e.g. Ready 15 mins early"
                            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                          />
                        </div>
                        <div className="lg:col-span-6 flex flex-wrap gap-2">
                          {nextStages.map((nextStatus) => (
                            <button
                              key={nextStatus}
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order, nextStatus)}
                              className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                                order.status === nextStatus
                                  ? 'bg-[#E88D14] text-black border-[#E88D14]'
                                  : 'bg-zinc-50 text-zinc-800 border-zinc-300 hover:bg-zinc-100'
                              }`}
                            >
                              {nextStatus}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FOOD MENU MANAGEMENT */}
      {activeTab === 'food' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">Add / Edit Food Item</h2>
              <button
                type="button"
                onClick={handleSeedOfficialFoodMenu}
                className="text-xs font-semibold text-[#D97706] hover:underline"
              >
                Sync 26 Official Items
              </button>
            </div>
            <form onSubmit={handleSaveFoodItem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={foodForm.name}
                  onChange={(e) => setFoodForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Category</label>
                  <select
                    value={foodForm.category}
                    onChange={(e) => setFoodForm((p) => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                  >
                    {FOOD_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Quantity</label>
                  <input
                    type="text"
                    required
                    value={foodForm.quantityLabel}
                    onChange={(e) => setFoodForm((p) => ({ ...p, quantityLabel: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Original Price (₹)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={foodForm.originalPrice}
                    onChange={(e) =>
                      setFoodForm((p) => ({ ...p, originalPrice: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Sort Order</label>
                  <input
                    type="number"
                    min={0}
                    value={foodForm.sortOrder}
                    onChange={(e) =>
                      setFoodForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-zinc-700">
                  Dish Photograph (Phone Gallery / Media Library)
                </label>

                {foodForm.imageUrl && (
                  <div className="w-full h-36 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100">
                    <FoodImage
                      src={foodForm.imageUrl}
                      derivativeSrc={foodForm.imageDerivativeUrl || undefined}
                      alt={foodForm.name || 'Food item preview'}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                <label className="w-full py-2.5 px-3 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer flex items-center justify-center gap-2">
                  <Upload className="w-3.5 h-3.5 text-[#E88D14]" />
                  <span>
                    {uploadingPhoto
                      ? `Uploading (${uploadProgress}%)...`
                      : 'Upload Photo from Phone Gallery'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    disabled={uploadingPhoto}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handlePhotoUpload(
                          file,
                          'food',
                          foodForm.name || file.name,
                          (res) =>
                            setFoodForm((p) => ({
                              ...p,
                              imageUrl: res.imageUrl,
                              imageDerivativeUrl: res.imageDerivativeUrl,
                              mediaId: res.mediaId,
                            }))
                        );
                      }
                      e.target.value = '';
                    }}
                  />
                </label>

                {mediaLibrary.some((m) => m.mediaType === 'image') && (
                  <select
                    value={foodForm.mediaId}
                    onChange={(e) => {
                      const selected = mediaLibrary.find((m) => m.mediaId === e.target.value);
                      if (selected) {
                        setFoodForm((p) => ({
                          ...p,
                          imageUrl: selected.downloadUrl,
                          imageDerivativeUrl: selected.derivativeUrl || '',
                          mediaId: selected.mediaId,
                        }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs bg-white"
                  >
                    <option value="">Or pick saved photo from Media Library...</option>
                    {mediaLibrary
                      .filter((m) => m.mediaType === 'image')
                      .map((m) => (
                        <option key={m.mediaId} value={m.mediaId}>
                          {m.displayLabel} ({m.fileFormat})
                        </option>
                      ))}
                  </select>
                )}

                <input
                  type="text"
                  value={foodForm.imageUrl}
                  onChange={(e) =>
                    setFoodForm((p) => ({
                      ...p,
                      imageUrl: e.target.value,
                      imageDerivativeUrl: '',
                      mediaId: '',
                    }))
                  }
                  placeholder="Stored image URL (auto-filled on upload)"
                  className="w-full px-3 py-1.5 border border-zinc-200 rounded-lg text-[11px] text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={foodForm.description}
                  onChange={(e) => setFoodForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-[#E88D14] text-black text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Save Food Item</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-zinc-900">
              Current Food Menu ({foodMenu.length})
            </h2>
            <div className="divide-y divide-zinc-100 max-h-[600px] overflow-y-auto">
              {foodMenu.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.name}{' '}
                      <span className="text-xs font-normal text-zinc-500">({item.quantityLabel})</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.category} · Original ₹{item.originalPrice} (Displayed ₹
                      {item.originalPrice + settings.autoDiscountPerItem})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFoodForm({
                          id: item.id,
                          name: item.name,
                          category: item.category,
                          quantityLabel: item.quantityLabel,
                          originalPrice: item.originalPrice,
                          description: item.description || '',
                          imageUrl: item.imageUrl || '',
                          imageDerivativeUrl: item.imageDerivativeUrl || '',
                          mediaId: item.mediaId || '',
                          available: item.available,
                          sortOrder: item.sortOrder,
                        })
                      }
                      className="px-2.5 py-1 text-xs border border-zinc-300 rounded-md"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleFoodAvailability(item)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                        item.available
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                      }`}
                    >
                      {item.available ? 'In Stock' : 'Hidden'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFoodItem(item.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-600"
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CAKES MANAGEMENT */}
      {activeTab === 'cakes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">Manage Cake Item</h2>
              <button
                type="button"
                onClick={handleSeedOfficialCakeMenu}
                className="text-xs font-semibold text-[#D97706] hover:underline"
              >
                Sync Official Cakes
              </button>
            </div>
            <form onSubmit={handleSaveCakeItem} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Cake Name *</label>
                <input
                  type="text"
                  required
                  value={cakeForm.name}
                  onChange={(e) => setCakeForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Type</label>
                  <select
                    value={cakeForm.cakeType}
                    onChange={(e) =>
                      setCakeForm((p) => ({
                        ...p,
                        cakeType: e.target.value as 'bento' | 'sicle' | 'party',
                      }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                  >
                    <option value="bento">Bento Cake</option>
                    <option value="sicle">Cake Sicles</option>
                    <option value="party">Party Cake (WhatsApp)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Original Price (₹)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={cakeForm.originalPrice}
                    onChange={(e) =>
                      setCakeForm((p) => ({ ...p, originalPrice: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Flavours (comma-separated)
                </label>
                <input
                  type="text"
                  value={cakeForm.flavoursCsv}
                  onChange={(e) => setCakeForm((p) => ({ ...p, flavoursCsv: e.target.value }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Ordering Notice
                </label>
                <input
                  type="text"
                  value={cakeForm.notice}
                  onChange={(e) => setCakeForm((p) => ({ ...p, notice: e.target.value }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                />
              </div>
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-zinc-700">
                  Cake Photograph (Phone Gallery / Media Library)
                </label>

                {cakeForm.imageUrl && (
                  <div className="w-full h-36 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100">
                    <FoodImage
                      src={cakeForm.imageUrl}
                      derivativeSrc={cakeForm.imageDerivativeUrl || undefined}
                      alt={cakeForm.name || 'Cake preview'}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                <label className="w-full py-2.5 px-3 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer flex items-center justify-center gap-2">
                  <Upload className="w-3.5 h-3.5 text-[#E88D14]" />
                  <span>
                    {uploadingPhoto
                      ? `Uploading (${uploadProgress}%)...`
                      : 'Upload Cake Photo from Phone Gallery'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    disabled={uploadingPhoto}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handlePhotoUpload(
                          file,
                          'cake',
                          cakeForm.name || file.name,
                          (res) =>
                            setCakeForm((p) => ({
                              ...p,
                              imageUrl: res.imageUrl,
                              imageDerivativeUrl: res.imageDerivativeUrl,
                              mediaId: res.mediaId,
                            }))
                        );
                      }
                      e.target.value = '';
                    }}
                  />
                </label>

                {mediaLibrary.some((m) => m.mediaType === 'image') && (
                  <select
                    value={cakeForm.mediaId}
                    onChange={(e) => {
                      const selected = mediaLibrary.find((m) => m.mediaId === e.target.value);
                      if (selected) {
                        setCakeForm((p) => ({
                          ...p,
                          imageUrl: selected.downloadUrl,
                          imageDerivativeUrl: selected.derivativeUrl || '',
                          mediaId: selected.mediaId,
                        }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs bg-white"
                  >
                    <option value="">Or pick saved photo from Media Library...</option>
                    {mediaLibrary
                      .filter((m) => m.mediaType === 'image')
                      .map((m) => (
                        <option key={m.mediaId} value={m.mediaId}>
                          {m.displayLabel} ({m.fileFormat})
                        </option>
                      ))}
                  </select>
                )}

                <input
                  type="text"
                  value={cakeForm.imageUrl}
                  onChange={(e) =>
                    setCakeForm((p) => ({
                      ...p,
                      imageUrl: e.target.value,
                      imageDerivativeUrl: '',
                      mediaId: '',
                    }))
                  }
                  placeholder="Stored image URL (auto-filled on upload)"
                  className="w-full px-3 py-1.5 border border-zinc-200 rounded-lg text-[11px] text-zinc-600"
                />
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={cakeForm.orderableOnline}
                    onChange={(e) =>
                      setCakeForm((p) => ({ ...p, orderableOnline: e.target.checked }))
                    }
                  />
                  <span>Orderable Online</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={cakeForm.eligibleForAutoDiscount}
                    onChange={(e) =>
                      setCakeForm((p) => ({ ...p, eligibleForAutoDiscount: e.target.checked }))
                    }
                  />
                  <span>₹10 Auto Discount</span>
                </label>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-[#E88D14] text-black text-xs font-semibold rounded-lg"
              >
                Save Cake Item
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-zinc-900">Cakes Catalog ({cakeMenu.length})</h2>
            <div className="divide-y divide-zinc-100">
              {cakeMenu.map((cake) => (
                <div key={cake.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {cake.name} — ₹{cake.originalPrice} {cake.priceUnit || ''}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {cake.orderableOnline ? 'Online Checkout' : 'WhatsApp Enquiry Only'} ·{' '}
                      {cake.notice}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCakeForm({
                          id: cake.id,
                          name: cake.name,
                          cakeType: cake.cakeType,
                          quantityLabel: cake.quantityLabel,
                          originalPrice: cake.originalPrice,
                          priceUnit: cake.priceUnit || '',
                          flavoursCsv: (cake.flavours || []).join(', '),
                          notice: cake.notice || '',
                          orderableOnline: cake.orderableOnline,
                          eligibleForAutoDiscount: cake.eligibleForAutoDiscount,
                          description: cake.description || '',
                          imageUrl: cake.imageUrl || '',
                          imageDerivativeUrl: cake.imageDerivativeUrl || '',
                          mediaId: cake.mediaId || '',
                          available: cake.available,
                          sortOrder: cake.sortOrder,
                        })
                      }
                      className="px-2.5 py-1 text-xs border border-zinc-300 rounded-md"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCakeAvailability(cake)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                        cake.available
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                      }`}
                    >
                      {cake.available ? 'Active' : 'Hidden'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2B: INVENTORY / LIMITED STOCK MANAGEMENT */}
      {activeTab === 'inventory' && (
        <InventoryManagerTab onAudit={recordAdminAudit} onNotify={showNotice} />
      )}

      {/* TAB 4B: MEDIA LIBRARY & PHONE GALLERY UPLOADS */}
      {activeTab === 'media' && (
        <MediaManagerTab onAudit={recordAdminAudit} onNotify={showNotice} />
      )}

      {/* TAB 5: COUPONS */}
      {activeTab === 'coupons' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-900">Create Coupon</h2>
            <p className="text-xs text-zinc-500">
              Create a coupon code here and share it with customers. Customers can type it in the small coupon box in Cart or Checkout to get the discount.
            </p>
            {couponError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {couponError}
              </div>
            )}
            <form onSubmit={handleCreateCoupon} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Coupon Code (A–Z, 0–9) *
                </label>
                <input
                  type="text"
                  required
                  value={couponForm.code}
                  onChange={(e) =>
                    setCouponForm((p) => ({
                      ...p,
                      code: sanitizeCouponCode(e.target.value),
                    }))
                  }
                  placeholder="e.g. ZAIKORA25"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono uppercase"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Type</label>
                  <select
                    value={couponForm.discountType}
                    onChange={(e) =>
                      setCouponForm((p) => ({
                        ...p,
                        discountType: e.target.value as 'percentage' | 'fixed',
                      }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                  >
                    <option value="fixed">Fixed (₹)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Value</label>
                  <input
                    type="number"
                    min={1}
                    max={couponForm.discountType === 'percentage' ? 100 : 50000}
                    required
                    value={couponForm.discountValue}
                    onChange={(e) =>
                      setCouponForm((p) => ({ ...p, discountValue: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Valid From</label>
                  <input
                    type="date"
                    value={couponForm.validFrom}
                    onChange={(e) => setCouponForm((p) => ({ ...p, validFrom: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Valid Until</label>
                  <input
                    type="date"
                    value={couponForm.validUntil}
                    onChange={(e) => setCouponForm((p) => ({ ...p, validUntil: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Max Times Usable (0 = unlimited)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={couponForm.usageLimit}
                    onChange={(e) =>
                      setCouponForm((p) => ({ ...p, usageLimit: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Min Order (₹, optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={couponForm.minOrderAmount}
                    onChange={(e) =>
                      setCouponForm((p) => ({ ...p, minOrderAmount: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-[#E88D14] text-black text-xs font-semibold rounded-lg"
              >
                Create / Update Coupon
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-zinc-900">Coupons ({allCoupons.length})</h2>
            {allCoupons.length === 0 ? (
              <p className="text-xs text-zinc-500">No coupons created yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {allCoupons.map((c) => {
                  const remainingText =
                    c.usageLimit === 0
                      ? 'Unlimited times left'
                      : `${Math.max(0, c.usageLimit - c.usedCount)} times remaining`;
                  const fromD = toDateSafe(c.validFrom);
                  const untilD = toDateSafe(c.validUntil);
                  return (
                    <div key={c.code} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-zinc-900">{c.code}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(c.code);
                              setCopiedCouponCode(c.code);
                              setTimeout(() => setCopiedCouponCode(''), 2000);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded text-[11px] font-medium"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedCouponCode === c.code ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                        <p className="text-zinc-700 font-medium">
                          {c.discountType === 'percentage'
                            ? `${c.discountValue}% off`
                            : `${formatRupees(c.discountValue)} off`}
                          {c.minOrderAmount > 0 ? ` · Min order ${formatRupees(c.minOrderAmount)}` : ''}
                        </p>
                        <p className="text-zinc-600">
                          Used <strong>{c.usedCount} {c.usedCount === 1 ? 'time' : 'times'}</strong>
                          {c.usageLimit > 0 ? ` out of ${c.usageLimit} times` : ''} ·{' '}
                          <span className="text-[#D97706] font-semibold">{remainingText}</span>
                        </p>
                        {fromD && untilD && (
                          <p className="text-[11px] text-zinc-500">
                            Valid: {fromD.toLocaleDateString('en-IN')} → {untilD.toLocaleDateString('en-IN')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleCoupon(c)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                            c.active
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                          }`}
                        >
                          {c.active ? 'Active' : 'Inactive'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCoupon(c.code)}
                          className="p-1.5 text-zinc-400 hover:text-red-600"
                          aria-label={`Delete coupon ${c.code}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5B: CHECKOUT CHARGES & FEES MANAGEMENT */}
      {activeTab === 'charges' && (
        <CheckoutChargesManager
          checkoutCharges={checkoutCharges}
          checkoutChargesSynced={checkoutChargesSynced}
          settings={settings}
          onNotice={showNotice}
          onAudit={recordAdminAudit}
        />
      )}

      {/* TAB 6: CUSTOMERS */}
      {activeTab === 'customers' && (() => {
        const mergedCustomers = new Map<
          string,
          {
            key: string;
            uid: string;
            name: string;
            phone: string;
            email?: string;
            loginCount: number;
            orderCount: number;
          }
        >();

        for (const pa of allPhoneAccounts) {
          mergedCustomers.set(pa.phone, {
            key: pa.phone,
            uid: pa.lastUid,
            name: pa.name,
            phone: pa.phone,
            email: pa.email,
            loginCount: pa.loginCount,
            orderCount: pa.orderCount,
          });
        }

        for (const c of allCustomers) {
          const key = c.phone || c.uid;
          if (!mergedCustomers.has(key)) {
            mergedCustomers.set(key, {
              key,
              uid: c.uid,
              name: c.name,
              phone: c.phone,
              email: c.email,
              loginCount: 1,
              orderCount: 0,
            });
          } else if (c.email && !mergedCustomers.get(key)?.email) {
            const existing = mergedCustomers.get(key)!;
            mergedCustomers.set(key, { ...existing, email: c.email });
          }
        }

        const customerRows = Array.from(mergedCustomers.values());

        return (
          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-900">
              Registered Customers ({customerRows.length})
            </h2>
            {customerRows.length === 0 ? (
              <p className="text-xs text-zinc-500">No registered customers yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-zinc-200 text-zinc-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Customer Name</th>
                      <th className="py-2 pr-4 font-medium">Mobile Number</th>
                      <th className="py-2 pr-4 font-medium">Ordered (How Many Times)</th>
                      <th className="py-2 pr-4 font-medium">Signed In</th>
                      <th className="py-2 pr-4 font-medium">Total Spend</th>
                      <th className="py-2 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {customerRows.map((c) => {
                      const custOrders = allOrders.filter(
                        (o) =>
                          o.customerId === c.uid ||
                          (c.phone && o.customerPhone === c.phone)
                      );
                      const timesOrdered = Math.max(custOrders.length, c.orderCount);
                      const totalSpend = custOrders
                        .filter((o) => o.paymentStatus === 'successful' || o.paymentStatus === 'verified')
                        .reduce((s, o) => s + o.finalAmount, 0);
                      const isExpanded = selectedCustomerId === c.uid;
                      return (
                        <React.Fragment key={c.key}>
                          <tr>
                            <td className="py-2.5 pr-4">
                              <p className="font-semibold text-zinc-900">{c.name}</p>
                              {c.email && (
                                <p className="text-[11px] text-zinc-500">{c.email}</p>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 font-mono">{c.phone}</td>
                            <td className="py-2.5 pr-4 font-mono tabular-nums font-semibold text-zinc-900">
                              {timesOrdered} {timesOrdered === 1 ? 'time' : 'times'}
                            </td>
                            <td className="py-2.5 pr-4 font-mono tabular-nums text-zinc-600">
                              {c.loginCount} {c.loginCount === 1 ? 'time' : 'times'}
                            </td>
                            <td className="py-2.5 pr-4 font-mono tabular-nums font-semibold">
                              {formatRupees(totalSpend)}
                            </td>
                            <td className="py-2.5">
                              <button
                                type="button"
                                onClick={() => handleInspectCustomer(c.uid)}
                                className="text-xs font-semibold text-[#D97706] hover:underline"
                              >
                                {isExpanded ? 'Hide' : 'Addresses & Orders'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="bg-zinc-50 p-4 space-y-3">
                                <div>
                                  <p className="font-semibold text-zinc-900 mb-1">
                                    Saved Addresses ({selectedCustomerAddresses.length})
                                  </p>
                                  {selectedCustomerAddresses.length === 0 ? (
                                    <p className="text-zinc-500">No saved addresses.</p>
                                  ) : (
                                    <ul className="space-y-1 text-zinc-700">
                                      {selectedCustomerAddresses.map((addr) => (
                                        <li key={addr.id}>
                                          • {addr.label}: {addr.apartmentName}
                                          {addr.blockOrTower ? `, ${addr.blockOrTower}` : ''}
                                          {addr.flatNumber ? `, Flat ${addr.flatNumber}` : ''} (
                                          {addr.community === 'brigade_eldorado'
                                            ? 'Brigade Eldorado'
                                            : 'Main Gate Only'}
                                          )
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                <div>
                                  <p className="font-semibold text-zinc-900 mb-1">
                                    Order History ({custOrders.length} {custOrders.length === 1 ? 'time' : 'times'})
                                  </p>
                                  {custOrders.length === 0 ? (
                                    <p className="text-zinc-500">No orders placed yet.</p>
                                  ) : (
                                    <ul className="space-y-1 text-zinc-700">
                                      {custOrders.map((o) => (
                                        <li key={o.orderId}>
                                          • <span className="font-mono">{o.orderId}</span> —{' '}
                                          {formatRupees(o.finalAmount)} ({o.status} · Payment:{' '}
                                          {o.paymentStatus})
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* TAB 7: REPORTS & SETTINGS */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Restaurant Settings */}
          <div className="lg:col-span-6 bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-900">Restaurant Settings</h2>
            <form onSubmit={handleSaveSettings} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  WhatsApp Number for Party Cakes (e.g. 9198XXXXXXXX)
                </label>
                <input
                  type="tel"
                  value={settingsForm.whatsappNumber}
                  onChange={(e) =>
                    setSettingsForm((p) => ({ ...p, whatsappNumber: e.target.value }))
                  }
                  placeholder="Enter official WhatsApp number"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={settingsForm.contactPhone}
                    onChange={(e) =>
                      setSettingsForm((p) => ({ ...p, contactPhone: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={settingsForm.contactEmail}
                    onChange={(e) =>
                      setSettingsForm((p) => ({ ...p, contactEmail: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Prep Mins
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={settingsForm.defaultPrepMinutes}
                    onChange={(e) =>
                      setSettingsForm((p) => ({
                        ...p,
                        defaultPrepMinutes: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Auto Off (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={settingsForm.autoDiscountPerItem}
                    onChange={(e) =>
                      setSettingsForm((p) => ({
                        ...p,
                        autoDiscountPerItem: Number(e.target.value),
                      }))
                    }
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 space-y-1">
                  <p className="text-[11px] font-semibold text-zinc-700">
                    Checkout Charges &amp; Fees
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {checkoutCharges.filter((c) => c.enabled).length} active charge(s)
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('charges')}
                    className="text-[11px] font-bold text-[#D97706] underline"
                  >
                    Manage Charges &amp; Fees &rarr;
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-800 pt-1">
                <input
                  type="checkbox"
                  checked={settingsForm.isAcceptingOrders}
                  onChange={(e) =>
                    setSettingsForm((p) => ({ ...p, isAcceptingOrders: e.target.checked }))
                  }
                />
                <span>Accepting New Online Orders</span>
              </label>

              <div className="pt-4 mt-2 border-t border-zinc-200 space-y-3">
                <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                  Pixel Craft Studio Credit Contact (Editable)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Studio Mobile Number
                    </label>
                    <input
                      type="text"
                      value={settingsForm.studioPhone}
                      onChange={(e) =>
                        setSettingsForm((p) => ({ ...p, studioPhone: e.target.value }))
                      }
                      placeholder="Optional business mobile"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Studio Email
                    </label>
                    <input
                      type="email"
                      value={settingsForm.studioEmail}
                      onChange={(e) =>
                        setSettingsForm((p) => ({ ...p, studioEmail: e.target.value }))
                      }
                      placeholder="Optional studio email"
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Studio Instagram Link
                  </label>
                  <input
                    type="url"
                    value={settingsForm.studioInstagram}
                    onChange={(e) =>
                      setSettingsForm((p) => ({ ...p, studioInstagram: e.target.value }))
                    }
                    placeholder="https://www.instagram.com/pixel_craft1studio/"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 bg-[#E88D14] text-black text-xs font-semibold rounded-lg"
              >
                Save Settings
              </button>
            </form>

            {/* Admin Team Management */}
            <div className="pt-6 border-t border-zinc-200 space-y-3">
              <h3 className="text-sm font-bold text-zinc-900">
                Admin Team ({allAdmins.length})
              </h3>
              <form onSubmit={handleAddAdmin} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={newAdminUid}
                  onChange={(e) => setNewAdminUid(e.target.value)}
                  placeholder="Firebase Auth UID"
                  className="px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  placeholder="Admin Name"
                  className="px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                />
                <input
                  type="text"
                  value={newAdminPhone}
                  onChange={(e) => setNewAdminPhone(e.target.value)}
                  placeholder="Phone (+91...)"
                  className="px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono"
                />
                <select
                  value={newAdminRole}
                  onChange={(e) => setNewAdminRole(e.target.value as 'super_admin' | 'manager')}
                  className="px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                >
                  <option value="manager">Manager</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                <button
                  type="submit"
                  className="sm:col-span-2 py-2 bg-[#0A0A0B] text-white text-xs font-semibold rounded-lg"
                >
                  Grant Admin Access
                </button>
              </form>
            </div>
          </div>

          {/* Date-Filtered Sales, Order & Payment Reports */}
          <div className="lg:col-span-6 bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">Sales & Payment Reports</h2>
              <button
                type="button"
                onClick={exportCsvReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-200"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">From Date</label>
                <input
                  type="date"
                  value={reportStart}
                  onChange={(e) => setReportStart(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={reportEnd}
                  onChange={(e) => setReportEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-center">
              <div>
                <p className="text-[11px] text-zinc-500">Filtered Orders</p>
                <p className="text-lg font-bold font-mono tabular-nums">
                  {filteredReportsOrders.length}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Paid Orders</p>
                <p className="text-lg font-bold font-mono tabular-nums">
                  {filteredReportsOrders.filter((o) => o.paymentStatus === 'successful' || o.paymentStatus === 'verified').length}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Paid Revenue</p>
                <p className="text-lg font-bold font-mono tabular-nums">
                  {formatRupees(
                    filteredReportsOrders
                      .filter((o) => o.paymentStatus === 'successful' || o.paymentStatus === 'verified')
                      .reduce((s, o) => s + o.finalAmount, 0)
                  )}
                </p>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 text-xs">
              {filteredReportsOrders.map((o) => (
                <div key={o.orderId} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold text-zinc-900">{o.orderId}</p>
                    <p className="text-zinc-500">
                      {o.customerName} · {o.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-zinc-900">{formatRupees(o.finalAmount)}</p>
                    <p className="uppercase text-[10px] text-zinc-500">{o.paymentStatus}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
