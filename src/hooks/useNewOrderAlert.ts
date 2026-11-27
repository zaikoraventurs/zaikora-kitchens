import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { isOrderPendingAdminApproval } from '../data/catalog';
import { buildUnexpectedApiResponseError, parseApiResponse } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  type AlertSoundState,
  enableAlertAudio,
  getAlertSoundState,
  playTringCycle,
} from '../lib/orderAlertAudio';
import { formatRupees } from '../lib/pricing';
import type { OrderItemRecord, OrderRecord } from '../types';

export interface OrderRejectionResult {
  status: string;
  refundStatus?: string | null;
  refundId?: string | null;
}

interface UseNewOrderAlertOptions {
  user: User | null;
  isAdmin: boolean;
  getAdminApiAuthHeaders: () => Promise<Record<string, string>>;
  onOrderAccepted?: (orderId: string) => void;
  onOrderRejected?: (orderId: string, result: OrderRejectionResult) => void;
}

export function useNewOrderAlert({
  user,
  isAdmin,
  getAdminApiAuthHeaders,
  onOrderAccepted,
  onOrderRejected,
}: UseNewOrderAlertOptions) {
  const [allOrders, setAllOrders] = useState<OrderRecord[]>([]);
  const [liveAddedOrderIds, setLiveAddedOrderIds] = useState<string[]>([]);
  const [acceptingOrderIds, setAcceptingOrderIds] = useState<Record<string, boolean>>({});
  const [rejectingOrderIds, setRejectingOrderIds] = useState<Record<string, boolean>>({});
  const [syncingRefundIds, setSyncingRefundIds] = useState<Record<string, boolean>>({});
  const [orderActionError, setOrderActionError] = useState<{
    orderId: string;
    message: string;
  } | null>(null);
  const [unacceptedOrderItems, setUnacceptedOrderItems] = useState<
    Record<string, OrderItemRecord[]>
  >({});
  const [soundState, setSoundState] = useState<AlertSoundState>(() => getAlertSoundState());
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  const ordersSnapshotInitializedRef = useRef(false);
  const notifiedOrderIdsRef = useRef<Set<string>>(new Set());
  const fetchedItemsOrderIdsRef = useRef<Set<string>>(new Set());

  // Real-time Firestore orders listener detecting paid orders awaiting Admin approval
  useEffect(() => {
    if (!user || !isAdmin) {
      ordersSnapshotInitializedRef.current = false;
      setAllOrders([]);
      setLiveAddedOrderIds([]);
      return;
    }

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as OrderRecord);
        setAllOrders(list);

        if (!ordersSnapshotInitializedRef.current) {
          ordersSnapshotInitializedRef.current = true;
        } else {
          const addedNewIds: string[] = [];
          for (const change of snap.docChanges()) {
            if (change.type === 'added' || change.type === 'modified') {
              const data = change.doc.data() as OrderRecord;
              if (isOrderPendingAdminApproval(data)) {
                addedNewIds.push(data.orderId);
              }
            }
          }
          if (addedNewIds.length > 0) {
            setLiveAddedOrderIds((prev) => Array.from(new Set([...prev, ...addedNewIds])));
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    return () => {
      unsubOrders();
    };
  }, [user, isAdmin]);

  // Only verified paid orders awaiting Admin Accept / Reject decision
  const unacceptedOrders = useMemo(() => {
    const liveSet = new Set(liveAddedOrderIds);
    return allOrders.filter((o) => {
      if (!isOrderPendingAdminApproval(o)) return false;
      if (acceptingOrderIds[o.orderId] || rejectingOrderIds[o.orderId]) return false;
      return o.adminAccepted === false || liveSet.has(o.orderId) || isOrderPendingAdminApproval(o);
    });
  }, [allOrders, liveAddedOrderIds, acceptingOrderIds, rejectingOrderIds]);

  // Fetch line items & trigger a single browser notification per unique paid pending-approval orderId
  useEffect(() => {
    if (!isAdmin || unacceptedOrders.length === 0) return;

    for (const order of unacceptedOrders) {
      if (!fetchedItemsOrderIdsRef.current.has(order.orderId)) {
        fetchedItemsOrderIdsRef.current.add(order.orderId);
        getDocs(collection(db, 'orders', order.orderId, 'items'))
          .then((snap) => {
            const rows = snap.docs.map((d) => d.data() as OrderItemRecord);
            setUnacceptedOrderItems((prev) => ({ ...prev, [order.orderId]: rows }));
          })
          .catch(() => {
            // Non-fatal; itemsPreview still displays items & quantities
          });
      }

      if (!notifiedOrderIdsRef.current.has(order.orderId)) {
        notifiedOrderIdsRef.current.add(order.orderId);
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(`New Paid Order: ${order.orderId}`, {
              body: `${order.customerName} · ${formatRupees(order.finalAmount)} · ${
                order.itemsPreview || `${order.totalItemCount} item(s)`
              }`,
            });
          } catch {
            // Ignore browser Notification constructor failures
          }
        }
      }
    }
  }, [isAdmin, unacceptedOrders]);

  // Continuous "Tring! Tring! Tring! Tring!" audio playback loop while ANY paid order awaits approval
  const hasPendingOrders = isAdmin && unacceptedOrders.length > 0;
  useEffect(() => {
    if (!hasPendingOrders) {
      return;
    }

    let cancelled = false;
    const ringOnce = async () => {
      const played = await playTringCycle();
      if (!cancelled) {
        setSoundState(played ? 'running' : 'blocked');
      }
    };

    ringOnce();
    const intervalId = window.setInterval(ringOnce, 2400);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hasPendingOrders]);

  const enableSound = async () => {
    const ok = await enableAlertAudio();
    setSoundState(ok ? 'running' : 'blocked');
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      try {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
      } catch {
        // Ignore notification permission rejection
      }
    }
    return ok;
  };

  const requestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPermission('unsupported');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
    } catch {
      // Ignore permission rejection
    }
  };

  const clearOrderActionError = () => setOrderActionError(null);

  const acceptOrder = async (
    order: OrderRecord,
    options?: { estimatedPrepMinutes?: number; note?: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: 'Admin sign-in session required.' };
    setOrderActionError(null);
    setAcceptingOrderIds((prev) => ({ ...prev, [order.orderId]: true }));
    try {
      const headers = await getAdminApiAuthHeaders();
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderId)}/accept`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          estimatedPrepMinutes: options?.estimatedPrepMinutes ?? order.estimatedPrepMinutes,
          note: options?.note,
        }),
      });
      const parsed = await parseApiResponse<{
        accepted?: boolean;
        status?: string;
        error?: string;
      }>(res);
      const data = parsed.data;
      if (!parsed.isJson || !data) {
        const msg = buildUnexpectedApiResponseError(res, 'Order approval server is unavailable');
        setOrderActionError({ orderId: order.orderId, message: msg });
        return { ok: false, error: msg };
      }
      if (!res.ok || !data.accepted) {
        const msg = data.error || 'Could not accept order. Please verify payment status.';
        setOrderActionError({ orderId: order.orderId, message: msg });
        return { ok: false, error: msg };
      }

      setLiveAddedOrderIds((prev) => prev.filter((id) => id !== order.orderId));
      onOrderAccepted?.(order.orderId);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach order approval endpoint.';
      setOrderActionError({ orderId: order.orderId, message: msg });
      return { ok: false, error: msg };
    } finally {
      setAcceptingOrderIds((prev) => {
        const next = { ...prev };
        delete next[order.orderId];
        return next;
      });
    }
  };

  const rejectOrder = async (
    order: OrderRecord,
    reason: string
  ): Promise<{
    ok: boolean;
    error?: string;
    status?: string;
    refundStatus?: string | null;
    refundId?: string | null;
  }> => {
    if (!user) return { ok: false, error: 'Admin sign-in session required.' };
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      const msg = 'Please enter a rejection reason (at least 3 characters).';
      setOrderActionError({ orderId: order.orderId, message: msg });
      return { ok: false, error: msg };
    }

    setOrderActionError(null);
    setRejectingOrderIds((prev) => ({ ...prev, [order.orderId]: true }));
    try {
      const headers = await getAdminApiAuthHeaders();
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderId)}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ reason: cleanReason }),
      });
      const parsed = await parseApiResponse<{
        rejected?: boolean;
        status?: string;
        refundId?: string | null;
        refundStatus?: string | null;
        error?: string;
      }>(res);
      const data = parsed.data;
      if (!parsed.isJson || !data) {
        const msg = buildUnexpectedApiResponseError(res, 'Order rejection & refund server is unavailable');
        setOrderActionError({ orderId: order.orderId, message: msg });
        return { ok: false, error: msg };
      }
      if (!res.ok || !data.rejected) {
        const msg = data.error || 'Could not reject order or initiate refund.';
        setOrderActionError({ orderId: order.orderId, message: msg });
        return { ok: false, error: msg };
      }

      setLiveAddedOrderIds((prev) => prev.filter((id) => id !== order.orderId));
      const result: OrderRejectionResult = {
        status: data.status || 'REJECTED',
        refundId: data.refundId ?? null,
        refundStatus: data.refundStatus ?? null,
      };
      onOrderRejected?.(order.orderId, result);
      return { ok: true, ...result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reject order right now.';
      setOrderActionError({ orderId: order.orderId, message: msg });
      return { ok: false, error: msg };
    } finally {
      setRejectingOrderIds((prev) => {
        const next = { ...prev };
        delete next[order.orderId];
        return next;
      });
    }
  };

  const syncRefundStatus = async (order: OrderRecord): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: 'Admin sign-in session required.' };
    setOrderActionError(null);
    setSyncingRefundIds((prev) => ({ ...prev, [order.orderId]: true }));
    try {
      const headers = await getAdminApiAuthHeaders();
      const res = await fetch(
        `/api/admin/orders/${encodeURIComponent(order.orderId)}/refund-sync`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
        }
      );
      const parsed = await parseApiResponse<{
        refundStatus?: string;
        error?: string;
      }>(res);
      const data = parsed.data;
      if (!parsed.isJson || !data) {
        const msg = buildUnexpectedApiResponseError(res, 'Refund status sync endpoint unavailable');
        setOrderActionError({ orderId: order.orderId, message: msg });
        return { ok: false, error: msg };
      }
      if (!res.ok) {
        const msg = data.error || 'Unable to sync refund status with Razorpay.';
        setOrderActionError({ orderId: order.orderId, message: msg });
        return { ok: false, error: msg };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Refund status sync failed.';
      setOrderActionError({ orderId: order.orderId, message: msg });
      return { ok: false, error: msg };
    } finally {
      setSyncingRefundIds((prev) => {
        const next = { ...prev };
        delete next[order.orderId];
        return next;
      });
    }
  };

  return {
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
    enableSound,
    requestNotifications,
    acceptOrder,
    rejectOrder,
    syncRefundStatus,
  };
}
