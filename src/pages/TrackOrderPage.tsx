import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { AlertTriangle, Bell, CheckCircle2, Clock, Package, RefreshCw, Search, ShieldAlert, Truck } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { FssaiLicenceSection } from '../components/FssaiLicenceSection';
import { OrderSupportChat } from '../components/OrderSupportChat';
import { useApp } from '../context/AppContext';
import {
  BRAND_NAME,
  COLLECTION_READY_MESSAGE,
  DELIVERY_TRANSIT_MESSAGE,
  LEGACY_ORDER_STATUS_SEQUENCE,
  ORDER_REJECTED_NOTIFICATION_MESSAGE,
  ORDER_STATUS_SEQUENCE,
  PENDING_APPROVAL_CUSTOMER_MESSAGE,
} from '../data/catalog';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatDateTime, formatRupees } from '../lib/pricing';
import type { OrderItemRecord, OrderRecord, OrderStatusHistoryRecord } from '../types';

export function TrackOrderPage() {
  const { orderId: routeOrderId } = useParams<{ orderId?: string }>();
  const navigate = useNavigate();
  const { user, isCustomerAuthenticated, orders, notifications } = useApp();

  const [lookupInput, setLookupInput] = useState(routeOrderId || '');
  const [trackedOrder, setTrackedOrder] = useState<OrderRecord | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemRecord[]>([]);
  const [statusHistory, setStatusHistory] = useState<OrderStatusHistoryRecord[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [trackError, setTrackError] = useState('');

  const activeOrderId = routeOrderId || orders[0]?.orderId || '';

  useEffect(() => {
    if (routeOrderId) {
      setLookupInput(routeOrderId);
    }
  }, [routeOrderId]);

  const isValidOrderId = /^[a-zA-Z0-9_-]{1,128}$/.test(activeOrderId);

  useEffect(() => {
    if (!user || !activeOrderId) {
      setTrackedOrder(null);
      setOrderItems([]);
      setStatusHistory([]);
      setTrackError('');
      return;
    }

    if (!isValidOrderId) {
      setTrackedOrder(null);
      setOrderItems([]);
      setStatusHistory([]);
      setTrackError('Invalid Order ID format.');
      return;
    }

    setLoadingOrder(true);
    setTrackError('');

    const unsubOrder = onSnapshot(
      doc(db, 'orders', activeOrderId),
      (snap) => {
        if (!snap.exists()) {
          setTrackedOrder(null);
          setOrderItems([]);
          setStatusHistory([]);
          setTrackError(`Order ${activeOrderId} was not found.`);
        } else {
          setTrackedOrder(snap.data() as OrderRecord);
          setTrackError('');
        }
        setLoadingOrder(false);
      },
      (err) => {
        setLoadingOrder(false);
        setTrackedOrder(null);
        setOrderItems([]);
        setStatusHistory([]);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
          setTrackError('You can only track orders belonging to your signed-in account.');
        } else {
          handleFirestoreError(err, OperationType.GET, `orders/${activeOrderId}`);
        }
      }
    );

    return () => {
      unsubOrder();
    };
  }, [user, activeOrderId, isValidOrderId]);

  useEffect(() => {
    if (!user || !trackedOrder || trackedOrder.orderId !== activeOrderId) {
      return;
    }

    const unsubItems = onSnapshot(
      collection(db, 'orders', activeOrderId, 'items'),
      (snap) => {
        setOrderItems(snap.docs.map((d) => d.data() as OrderItemRecord));
      },
      (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
          setOrderItems([]);
        } else {
          handleFirestoreError(err, OperationType.LIST, `orders/${activeOrderId}/items`);
        }
      }
    );

    const historyQuery = query(
      collection(db, 'orders', activeOrderId, 'status_history'),
      orderBy('createdAt', 'asc')
    );
    const unsubHistory = onSnapshot(
      historyQuery,
      (snap) => {
        setStatusHistory(snap.docs.map((d) => d.data() as OrderStatusHistoryRecord));
      },
      (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
          setStatusHistory([]);
        } else {
          handleFirestoreError(err, OperationType.LIST, `orders/${activeOrderId}/status_history`);
        }
      }
    );

    return () => {
      unsubItems();
      unsubHistory();
    };
  }, [user, trackedOrder, activeOrderId]);

  const handleTrackSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = lookupInput.trim();
    if (cleaned) {
      navigate(`/track/${encodeURIComponent(cleaned)}`);
    }
  };

  const orderNotifs = notifications.filter((n) => n.orderId === activeOrderId);

  const baseSequence =
    trackedOrder && LEGACY_ORDER_STATUS_SEQUENCE.includes(trackedOrder.status)
      ? LEGACY_ORDER_STATUS_SEQUENCE
      : ORDER_STATUS_SEQUENCE;

  const relevantSteps = baseSequence.filter((status) => {
    if (!trackedOrder) return true;
    if (
      trackedOrder.fulfillmentType === 'delivery' &&
      (status === 'Ready for Collection' ||
        status === 'READY FOR COLLECTION' ||
        status === 'COLLECTED')
    ) {
      return false;
    }
    if (
      trackedOrder.fulfillmentType === 'collection' &&
      (status === 'Out for Delivery' || status === 'OUT FOR DELIVERY' || status === 'DELIVERED')
    ) {
      return false;
    }
    return true;
  });

  const currentStepIdx = trackedOrder ? relevantSteps.indexOf(trackedOrder.status) : -1;
  const isPaymentPending = trackedOrder?.status === 'PAYMENT PENDING';
  const isPaymentFailed = trackedOrder?.status === 'PAYMENT FAILED';
  const isAwaitingAdminApproval =
    trackedOrder?.status === 'PAYMENT VERIFIED' || trackedOrder?.status === 'PENDING ADMIN APPROVAL';
  const isRejectedOrRefund =
    trackedOrder?.status === 'REJECTED' ||
    trackedOrder?.status === 'REFUND PROCESSING' ||
    trackedOrder?.status === 'REFUNDED' ||
    trackedOrder?.status === 'Cancelled';
  const isOutForDelivery =
    trackedOrder?.status === 'OUT FOR DELIVERY' || trackedOrder?.status === 'Out for Delivery';
  const isReadyForCollection =
    trackedOrder?.status === 'READY FOR COLLECTION' ||
    trackedOrder?.status === 'Ready for Collection';
  const hidePrepEstimate = isPaymentPending || isPaymentFailed || isRejectedOrRefund;

  return (
    <>
      {/* Mobile Order Tracking View (< 768px) */}
      <div className="md:hidden px-3.5 pt-4 pb-16 space-y-5">
        <div className="space-y-3 border-b border-zinc-200 pb-4">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Live Order Tracking</h1>
          <form onSubmit={handleTrackSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                placeholder="Order ID (e.g. ZK_...)"
                className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-white border border-zinc-300 rounded-xl text-base font-mono"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] px-4 bg-[#0A0A0B] text-white text-xs font-bold rounded-xl shrink-0"
            >
              Track
            </button>
          </form>
        </div>

        {!isCustomerAuthenticated ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center space-y-3.5">
            <Package className="w-9 h-9 text-[#D97706] mx-auto" />
            <h2 className="text-base font-bold text-zinc-900">Sign In to Track Your Orders</h2>
            <p className="text-xs text-zinc-600">
              Live order tracking is protected and linked to your signed-in +91 mobile number.
            </p>
            <Link
              to={`/login?redirect=${encodeURIComponent(activeOrderId ? `/track/${activeOrderId}` : '/track')}`}
              className="w-full min-h-[46px] inline-flex items-center justify-center px-5 bg-[#E88D14] text-black font-bold text-sm rounded-xl"
            >
              Login with Mobile &amp; PIN
            </Link>
          </div>
        ) : loadingOrder ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-xs text-zinc-600">
            Loading live order status...
          </div>
        ) : trackError ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-zinc-900">{trackError}</p>
            <Link to="/orders" className="inline-block text-xs font-semibold text-[#D97706] underline">
              View My Orders
            </Link>
          </div>
        ) : !trackedOrder ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center space-y-3.5">
            <Package className="w-9 h-9 text-zinc-400 mx-auto" />
            <h2 className="text-base font-bold text-zinc-900">No Active Orders Yet</h2>
            <p className="text-xs text-zinc-600">
              Place an order from our Food Menu or Cakes page to track it live here.
            </p>
            <Link
              to="/menu"
              className="w-full min-h-[46px] inline-flex items-center justify-center px-5 bg-[#0A0A0B] text-white text-sm font-bold rounded-xl"
            >
              Browse Menu
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active Status Banner */}
            <div className="bg-[#0A0A0B] text-white rounded-2xl p-4 border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                <span className="font-mono truncate">{trackedOrder.orderId}</span>
                <span className="shrink-0">{formatDateTime(trackedOrder.createdAt)}</span>
              </div>

              <div>
                <p className="text-[11px] font-semibold tracking-widest text-[#E88D14]">
                  CURRENT ORDER STATUS
                </p>
                <h2 className="text-xl font-bold mt-0.5">{trackedOrder.status}</h2>
              </div>

              {isPaymentPending && (
                <div className="p-3 bg-amber-950/60 border border-amber-500/40 text-amber-100 rounded-xl text-xs space-y-2">
                  <p className="font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#E88D14] shrink-0" />
                    <span>Payment is not completed yet</span>
                  </p>
                  <p className="text-amber-200/90">
                    This order has not been sent to the kitchen yet. Complete Razorpay payment to submit your order for kitchen approval.
                  </p>
                  <Link
                    to="/checkout"
                    className="inline-flex items-center justify-center px-3 py-1.5 bg-[#E88D14] text-black font-bold rounded-lg text-[11px]"
                  >
                    Return to Checkout &amp; Pay
                  </Link>
                </div>
              )}

              {isPaymentFailed && (
                <div className="p-3 bg-red-950/70 border border-red-500/50 text-red-100 rounded-xl text-xs space-y-2">
                  <p className="font-semibold flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                    <span>Payment Failed — Order Not Submitted</span>
                  </p>
                  <p className="text-red-200/90">
                    Your Razorpay payment did not complete or could not be verified. No order was confirmed. Please try again from your cart.
                  </p>
                  <Link
                    to="/cart"
                    className="inline-flex items-center justify-center px-3 py-1.5 bg-white text-zinc-900 font-bold rounded-lg text-[11px]"
                  >
                    Go to Cart
                  </Link>
                </div>
              )}

              {isAwaitingAdminApproval && (
                <div className="p-3 bg-amber-950/60 border border-[#E88D14]/60 text-amber-50 rounded-xl text-xs space-y-1.5">
                  <p className="font-bold text-[#E88D14] flex items-center gap-2">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>Awaiting Kitchen Admin Approval</span>
                  </p>
                  <p className="leading-relaxed text-zinc-200">
                    {PENDING_APPROVAL_CUSTOMER_MESSAGE}
                  </p>
                </div>
              )}

              {isRejectedOrRefund && (
                <div className="p-3 bg-red-950/70 border border-red-500/50 text-red-50 rounded-xl text-xs space-y-2">
                  <p className="font-bold text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {trackedOrder.status === 'REFUNDED'
                        ? 'Order Rejected — Refund Completed'
                        : trackedOrder.status === 'REFUND PROCESSING'
                        ? 'Order Rejected — Refund Processing'
                        : 'Order Rejected by Kitchen'}
                    </span>
                  </p>
                  <p className="leading-relaxed text-red-100">
                    {ORDER_REJECTED_NOTIFICATION_MESSAGE}
                  </p>
                  {trackedOrder.rejectionReason && (
                    <p className="text-red-200">
                      <strong>Reason:</strong> {trackedOrder.rejectionReason}
                    </p>
                  )}
                  <div className="pt-2 border-t border-red-500/30 space-y-1 text-[11px] text-red-100">
                    {trackedOrder.refundStatus && (
                      <p className="flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 shrink-0" />
                        <span>
                          Refund Status: <strong>{trackedOrder.refundStatus}</strong>
                        </span>
                      </p>
                    )}
                    {trackedOrder.refundAmount !== undefined && (
                      <p>
                        Refund Amount: <strong>{formatRupees(trackedOrder.refundAmount)}</strong>
                      </p>
                    )}
                    {trackedOrder.refundId && (
                      <p className="font-mono">Refund Ref: {trackedOrder.refundId}</p>
                    )}
                    <Link
                      to="/refund-policy"
                      className="inline-block text-[#E88D14] font-semibold underline pt-0.5"
                    >
                      View Refund &amp; Cancellation Policy
                    </Link>
                  </div>
                </div>
              )}

              {isOutForDelivery && (
                <div className="p-3 bg-[#E88D14] text-black rounded-xl font-semibold text-xs flex items-center gap-2.5">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span>{DELIVERY_TRANSIT_MESSAGE}</span>
                </div>
              )}

              {isReadyForCollection && (
                <div className="p-3 bg-[#E88D14] text-black rounded-xl font-semibold text-xs flex items-center gap-2.5">
                  <Package className="w-4 h-4 shrink-0" />
                  <span>{COLLECTION_READY_MESSAGE}</span>
                </div>
              )}

              <div className="pt-2.5 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
                {!hidePrepEstimate && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#E88D14]" />
                    Prep: {trackedOrder.estimatedPrepMinutes} mins
                  </span>
                )}
                <span>
                  Payment:{' '}
                  <strong className="uppercase text-white">{trackedOrder.paymentStatus}</strong>
                </span>
              </div>

              {trackedOrder.readySoonerNotice && (
                <p className="text-xs text-[#E88D14] font-medium">
                  Kitchen Update: {trackedOrder.readySoonerNotice}
                </p>
              )}
            </div>

            {/* Progress Timeline */}
            <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3.5">
              <h3 className="text-sm font-bold text-zinc-900">Order Progress</h3>
              <ol className="space-y-3">
                {relevantSteps.map((step, idx) => {
                  const historyMatch = statusHistory.find((h) => h.status === step);
                  const isCompleted =
                    Boolean(historyMatch) || (currentStepIdx >= 0 && idx <= currentStepIdx);
                  const isCurrent = trackedOrder.status === step;

                  return (
                    <li key={step} className="flex items-start gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border ${
                          isCompleted
                            ? 'bg-[#E88D14] border-[#E88D14] text-black'
                            : 'bg-zinc-50 border-zinc-300 text-zinc-400'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                      <div className="flex-1 pb-2.5 border-b border-zinc-100 last:border-b-0">
                        <p
                          className={`text-xs font-semibold ${
                            isCurrent
                              ? 'text-[#D97706]'
                              : isCompleted
                              ? 'text-zinc-900'
                              : 'text-zinc-400'
                          }`}
                        >
                          {step}
                        </p>
                        {historyMatch && (
                          <p className="text-[11px] font-mono tabular-nums text-zinc-500 mt-0.5">
                            {formatDateTime(historyMatch.createdAt)}
                          </p>
                        )}
                        {historyMatch?.note && (
                          <p className="text-[11px] text-zinc-600 mt-0.5">{historyMatch.note}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Order Summary */}
            <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 border-b border-zinc-100 pb-2">
                Order Details
              </h3>
              <div className="text-xs space-y-1 text-zinc-600">
                <p>
                  <span className="font-semibold text-zinc-900">Customer:</span>{' '}
                  {trackedOrder.customerName} ({trackedOrder.customerPhone})
                </p>
                <p>
                  <span className="font-semibold text-zinc-900">Mode:</span>{' '}
                  {trackedOrder.fulfillmentType === 'delivery' ? 'Delivery' : 'Collection'}
                </p>
                <p>
                  <span className="font-semibold text-zinc-900">Address:</span>{' '}
                  {trackedOrder.deliveryAddressSummary}
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-100 space-y-1.5 text-xs">
                {orderItems.length > 0 ? (
                  orderItems.map((item) => (
                    <div key={item.id} className="flex justify-between gap-2">
                      <span className="text-zinc-700">
                        {item.quantity} × {item.name}
                        {item.selectedFlavour ? ` (${item.selectedFlavour})` : ''}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-zinc-900">
                        {formatRupees(item.lineTotal)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-600">{trackedOrder.itemsPreview}</p>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-200 space-y-1 text-xs">
                {Array.isArray(trackedOrder.appliedCharges) && trackedOrder.appliedCharges.length > 0 ? (
                  trackedOrder.appliedCharges.map((charge) => (
                    <div key={charge.id} className="flex justify-between text-zinc-600">
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
                  ))
                ) : (
                  <div className="flex justify-between text-zinc-600">
                    <span>Delivery + Handling</span>
                    <span className="font-mono tabular-nums text-zinc-900">
                      {formatRupees(trackedOrder.deliveryCharge + trackedOrder.handlingCharge)}
                    </span>
                  </div>
                )}
                <div className="pt-1 flex justify-between text-sm font-bold text-zinc-900">
                  <span>Total Paid / Payable</span>
                  <span className="font-mono tabular-nums">
                    {formatRupees(trackedOrder.finalAmount)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 pt-1">
                Need help with cancellation or refunds?{' '}
                <Link to="/refund-policy" className="text-[#D97706] font-semibold underline">
                  Refund &amp; Cancellation Policy
                </Link>
              </p>
            </div>

            {/* Notifications */}
            <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#D97706]" />
                <h3 className="text-sm font-bold text-zinc-900">Notifications</h3>
              </div>
              {orderNotifs.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Real-time updates for this order will appear here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {orderNotifs.map((n) => (
                    <li key={n.id} className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs">
                      <p className="font-semibold text-zinc-900">{n.title}</p>
                      <p className="text-zinc-700 mt-0.5">{n.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <FssaiLicenceSection
          id="food-licence-track-mobile"
          testId="fssai-licence-number-track-mobile"
        />
      </div>

      {/* Desktop Order Tracking View (>= 768px — untouched) */}
      <div className="hidden md:block max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-zinc-200">
        <div className="flex items-center gap-4">
          <BrandLogo className="h-14 w-auto rounded-lg" />
          <div>
            <p className="text-xs font-medium tracking-widest text-[#D97706]">{BRAND_NAME}</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              Live Order Tracking
            </h1>
          </div>
        </div>

        <form onSubmit={handleTrackSearch} className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="Enter Order ID (e.g. ZK_...)"
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-[#0A0A0B] text-white text-sm font-semibold rounded-lg hover:bg-[#E88D14] hover:text-black transition-colors"
          >
            Track
          </button>
        </form>
      </div>

      {!isCustomerAuthenticated ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-4">
          <Package className="w-10 h-10 text-[#D97706] mx-auto" />
          <h2 className="text-xl font-bold text-zinc-900">Sign In to Track Your Orders</h2>
          <p className="text-sm text-zinc-600 max-w-md mx-auto">
            For customer privacy, live order tracking is tied to your verified +91 mobile number.
          </p>
          <Link
            to={`/login?redirect=${encodeURIComponent(activeOrderId ? `/track/${activeOrderId}` : '/track')}`}
            className="inline-block px-6 py-3 bg-[#E88D14] text-black font-semibold text-sm rounded-lg"
          >
            Login with Mobile &amp; 4-Digit PIN
          </Link>
        </div>
      ) : loadingOrder ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-600">
          Loading live order status...
        </div>
      ) : trackError ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-base font-semibold text-zinc-900">{trackError}</p>
          <Link to="/orders" className="inline-block text-sm font-semibold text-[#D97706] underline">
            View My Orders
          </Link>
        </div>
      ) : !trackedOrder ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-4">
          <Package className="w-10 h-10 text-zinc-400 mx-auto" />
          <h2 className="text-xl font-semibold text-zinc-900">No Active Orders Yet</h2>
          <p className="text-sm text-zinc-600">
            Place an order from our Food Menu or Cakes page to track it live here.
          </p>
          <Link
            to="/menu"
            className="inline-block px-5 py-2.5 bg-[#0A0A0B] text-white text-sm font-semibold rounded-lg"
          >
            Browse Menu
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Live Status Banner & Step Timeline */}
          <div className="lg:col-span-7 space-y-6">
            {/* Active Status Callout */}
            <div className="bg-[#0A0A0B] text-white rounded-2xl p-6 sm:p-8 border border-zinc-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
                <span className="font-mono">Order ID: {trackedOrder.orderId}</span>
                <span>Placed: {formatDateTime(trackedOrder.createdAt)}</span>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-widest text-[#E88D14]">
                  CURRENT ORDER STATUS
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold">{trackedOrder.status}</h2>
              </div>

              {isPaymentPending && (
                <div className="p-4 bg-amber-950/60 border border-amber-500/40 text-amber-100 rounded-xl text-sm space-y-2">
                  <p className="font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#E88D14] shrink-0" />
                    <span>Payment Not Completed Yet</span>
                  </p>
                  <p className="text-xs text-amber-200/90">
                    Your order has not been sent to the kitchen yet. Complete Razorpay payment at checkout to submit your order for kitchen approval.
                  </p>
                  <Link
                    to="/checkout"
                    className="inline-flex items-center px-3.5 py-2 bg-[#E88D14] text-black font-bold rounded-lg text-xs"
                  >
                    Return to Checkout &amp; Pay
                  </Link>
                </div>
              )}

              {isPaymentFailed && (
                <div className="p-4 bg-red-950/70 border border-red-500/50 text-red-100 rounded-xl text-sm space-y-2">
                  <p className="font-semibold flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                    <span>Payment Failed — Order Not Confirmed</span>
                  </p>
                  <p className="text-xs text-red-200/90">
                    Your Razorpay payment did not succeed or failed signature verification. This order was not placed with the kitchen.
                  </p>
                  <Link
                    to="/cart"
                    className="inline-flex items-center px-3.5 py-2 bg-white text-zinc-900 font-bold rounded-lg text-xs"
                  >
                    Return to Cart
                  </Link>
                </div>
              )}

              {isAwaitingAdminApproval && (
                <div className="p-4 bg-amber-950/60 border border-[#E88D14]/60 text-amber-50 rounded-xl text-sm space-y-1.5">
                  <p className="font-bold text-[#E88D14] flex items-center gap-2">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>Payment Verified · Awaiting Kitchen Confirmation</span>
                  </p>
                  <p className="text-xs leading-relaxed text-zinc-200">
                    {PENDING_APPROVAL_CUSTOMER_MESSAGE}
                  </p>
                </div>
              )}

              {isRejectedOrRefund && (
                <div className="p-4 bg-red-950/70 border border-red-500/50 text-red-50 rounded-xl text-sm space-y-2.5">
                  <p className="font-bold text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {trackedOrder.status === 'REFUNDED'
                        ? 'Order Rejected — Refund Completed'
                        : trackedOrder.status === 'REFUND PROCESSING'
                        ? 'Order Rejected — Refund Processing'
                        : 'Order Rejected by Kitchen'}
                    </span>
                  </p>
                  <p className="text-xs leading-relaxed text-red-100">
                    {ORDER_REJECTED_NOTIFICATION_MESSAGE}
                  </p>
                  {trackedOrder.rejectionReason && (
                    <p className="text-xs text-red-200">
                      <strong>Reason:</strong> {trackedOrder.rejectionReason}
                    </p>
                  )}
                  <div className="pt-2.5 border-t border-red-500/30 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-red-100">
                    {trackedOrder.refundStatus && (
                      <span className="inline-flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Refund Status: <strong>{trackedOrder.refundStatus}</strong>
                      </span>
                    )}
                    {trackedOrder.refundAmount !== undefined && (
                      <span>
                        Amount: <strong>{formatRupees(trackedOrder.refundAmount)}</strong>
                      </span>
                    )}
                    {trackedOrder.refundId && (
                      <span className="font-mono">Refund Ref: {trackedOrder.refundId}</span>
                    )}
                    <Link to="/refund-policy" className="text-[#E88D14] font-semibold underline">
                      Refund &amp; Cancellation Policy
                    </Link>
                  </div>
                </div>
              )}

              {isOutForDelivery && (
                <div className="p-4 bg-[#E88D14] text-black rounded-xl font-semibold text-sm flex items-center gap-3">
                  <Truck className="w-5 h-5 shrink-0" />
                  <span>{DELIVERY_TRANSIT_MESSAGE}</span>
                </div>
              )}

              {isReadyForCollection && (
                <div className="p-4 bg-[#E88D14] text-black rounded-xl font-semibold text-sm flex items-center gap-3">
                  <Package className="w-5 h-5 shrink-0" />
                  <span>{COLLECTION_READY_MESSAGE}</span>
                </div>
              )}

              <div className="pt-3 border-t border-zinc-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-300">
                {!hidePrepEstimate && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#E88D14]" />
                    Estimated preparation: {trackedOrder.estimatedPrepMinutes} minutes
                  </span>
                )}
                <span>
                  Payment:{' '}
                  <strong className="uppercase text-white">{trackedOrder.paymentStatus}</strong>
                </span>
              </div>

              {trackedOrder.readySoonerNotice && (
                <p className="text-xs text-[#E88D14] font-medium">
                  Kitchen Update: {trackedOrder.readySoonerNotice}
                </p>
              )}
            </div>

            {/* Order Progress Timeline */}
            <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
              <h3 className="text-base font-bold text-zinc-900">Order Progress & Timestamps</h3>
              <ol className="space-y-4">
                {relevantSteps.map((step, idx) => {
                  const historyMatch = statusHistory.find((h) => h.status === step);
                  const isCompleted = Boolean(historyMatch) || (currentStepIdx >= 0 && idx <= currentStepIdx);
                  const isCurrent = trackedOrder.status === step;

                  return (
                    <li key={step} className="flex items-start gap-3.5">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 border ${
                          isCompleted
                            ? 'bg-[#E88D14] border-[#E88D14] text-black'
                            : 'bg-zinc-50 border-zinc-300 text-zinc-400'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 pb-3 border-b border-zinc-100 last:border-b-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`text-sm font-semibold ${
                              isCurrent
                                ? 'text-[#D97706]'
                                : isCompleted
                                ? 'text-zinc-900'
                                : 'text-zinc-400'
                            }`}
                          >
                            {step}
                          </span>
                          {historyMatch && (
                            <span className="text-xs font-mono tabular-nums text-zinc-500">
                              {formatDateTime(historyMatch.createdAt)}
                            </span>
                          )}
                        </div>
                        {historyMatch?.note && (
                          <p className="text-xs text-zinc-600 mt-1">{historyMatch.note}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          {/* Right: Order Details & Notifications */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-2.5">
                Order Details
              </h3>

              <div className="text-xs space-y-1.5 text-zinc-600">
                <p>
                  <span className="font-semibold text-zinc-900">Customer:</span>{' '}
                  {trackedOrder.customerName} ({trackedOrder.customerPhone})
                </p>
                <p>
                  <span className="font-semibold text-zinc-900">Fulfillment:</span>{' '}
                  {trackedOrder.fulfillmentType === 'delivery' ? 'Delivery' : 'Collection'}
                </p>
                <p>
                  <span className="font-semibold text-zinc-900">Location:</span>{' '}
                  {trackedOrder.deliveryAddressSummary}
                </p>
              </div>

              <div className="pt-3 border-t border-zinc-100 space-y-2">
                <p className="text-xs font-semibold text-zinc-900">Ordered Items</p>
                {orderItems.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {orderItems.map((item) => (
                      <li key={item.id} className="flex justify-between gap-3">
                        <span className="text-zinc-700">
                          {item.quantity} × {item.name}
                          {item.selectedFlavour ? ` (${item.selectedFlavour})` : ''}
                        </span>
                        <span className="font-mono tabular-nums font-medium text-zinc-900">
                          {formatRupees(item.lineTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-zinc-600">{trackedOrder.itemsPreview}</p>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-700 font-medium">
                  <span>Item Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatRupees(
                      Math.max(0, trackedOrder.displayedSubtotal - trackedOrder.autoDiscountTotal)
                    )}
                  </span>
                </div>
                {trackedOrder.couponDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Coupon ({trackedOrder.couponCode})</span>
                    <span className="font-mono tabular-nums">
                      −{formatRupees(trackedOrder.couponDiscount)}
                    </span>
                  </div>
                )}
                {Array.isArray(trackedOrder.appliedCharges) && trackedOrder.appliedCharges.length > 0 ? (
                  trackedOrder.appliedCharges.map((charge) => (
                    <div key={charge.id} className="flex justify-between text-zinc-600">
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
                  ))
                ) : (
                  <div className="flex justify-between text-zinc-600">
                    <span>Delivery + Handling</span>
                    <span className="font-mono tabular-nums">
                      {formatRupees(trackedOrder.deliveryCharge + trackedOrder.handlingCharge)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-zinc-900 pt-2 border-t border-zinc-100">
                  <span>Total Payable</span>
                  <span className="font-mono tabular-nums">
                    {formatRupees(trackedOrder.finalAmount)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-zinc-500 pt-1">
                Cancellations &amp; refunds are governed by our{' '}
                <Link to="/refund-policy" className="text-[#D97706] font-semibold underline">
                  Refund &amp; Cancellation Policy
                </Link>
                .
              </p>
            </div>

            {/* In-Website Order Notifications */}
            <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#D97706]" />
                <h3 className="text-base font-bold text-zinc-900">Order Notifications</h3>
              </div>
              {orderNotifs.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Updates for this order will appear here in real time.
                </p>
              ) : (
                <ul className="space-y-3">
                  {orderNotifs.map((n) => (
                    <li key={n.id} className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-zinc-900">{n.title}</span>
                        <span className="text-zinc-500 font-mono">{formatDateTime(n.createdAt)}</span>
                      </div>
                      <p className="text-zinc-700">{n.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <FssaiLicenceSection
        id="food-licence-track"
        testId="fssai-licence-number-track"
      />
      </div>

      {isCustomerAuthenticated && (
        <OrderSupportChat activeOrderId={trackedOrder?.orderId || activeOrderId || undefined} />
      )}
    </>
  );
}
