import { Link } from 'react-router-dom';
import { ArrowRight, Package } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import { BRAND_NAME, isOrderCompletedOrClosed } from '../data/catalog';
import { formatDateTime, formatRupees } from '../lib/pricing';

export function OrdersPage() {
  const { isCustomerAuthenticated, orders, customerName, verifiedPhone, phoneAccount } = useApp();

  const currentOrders = orders.filter((o) => !isOrderCompletedOrClosed(o.status));
  const pastOrders = orders.filter((o) => isOrderCompletedOrClosed(o.status));
  const totalTimesOrdered = Math.max(orders.length, phoneAccount?.orderCount ?? 0);

  return (
    <>
      {/* Mobile Orders View (< 768px) */}
      <div className="md:hidden px-3.5 pt-4 pb-8 space-y-5">
        <div className="border-b border-zinc-200 pb-3">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">My Orders</h1>
          {isCustomerAuthenticated ? (
            <p className="text-xs text-zinc-500 mt-0.5 truncate">
              {customerName || 'Customer'} · {verifiedPhone} ·{' '}
              <strong className="text-zinc-900">
                {totalTimesOrdered} {totalTimesOrdered === 1 ? 'order' : 'orders'}
              </strong>
            </p>
          ) : (
            <p className="text-xs text-zinc-500 mt-0.5">Active &amp; past kitchen orders</p>
          )}
        </div>

        {!isCustomerAuthenticated ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-center space-y-3.5">
            <Package className="w-9 h-9 text-[#D97706] mx-auto" />
            <h2 className="text-base font-bold text-zinc-900">Sign In to View Your Orders</h2>
            <p className="text-xs text-zinc-600">
              Sign in with your +91 mobile number and 4-digit PIN to check live and past orders.
            </p>
            <Link
              to="/login?redirect=/orders"
              className="w-full min-h-[46px] inline-flex items-center justify-center px-5 bg-[#E88D14] text-black font-bold text-sm rounded-xl"
            >
              Login with Mobile &amp; PIN
            </Link>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center space-y-3.5">
            <Package className="w-9 h-9 text-zinc-400 mx-auto" />
            <h2 className="text-base font-bold text-zinc-900">No orders placed yet</h2>
            <Link
              to="/menu"
              className="w-full min-h-[46px] inline-flex items-center justify-center px-5 bg-[#0A0A0B] text-white text-sm font-bold rounded-xl"
            >
              Explore Food Menu
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-zinc-900">
                Active Orders ({currentOrders.length})
              </h2>
              {currentOrders.length === 0 ? (
                <p className="text-xs text-zinc-500">No active orders in progress.</p>
              ) : (
                <div className="space-y-3">
                  {currentOrders.map((order) => (
                    <div
                      key={order.orderId}
                      className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                        <span className="font-mono font-semibold text-zinc-900 truncate">
                          {order.orderId}
                        </span>
                        <span className="shrink-0">{formatDateTime(order.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-[#D97706]">{order.status}</p>
                        {order.status === 'PENDING ADMIN APPROVAL' && (
                          <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            Awaiting Kitchen Approval
                          </span>
                        )}
                        {order.refundStatus && (
                          <span className="text-[11px] font-medium text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                            {order.refundStatus}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-600 line-clamp-2">{order.itemsPreview}</p>
                      {order.rejectionReason && (
                        <p className="text-[11px] text-red-700">Reason: {order.rejectionReason}</p>
                      )}
                      <div className="pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-mono font-bold text-sm text-zinc-900 tabular-nums">
                            {formatRupees(order.finalAmount)}
                          </span>
                          <span className="text-zinc-500 ml-2 uppercase text-[11px]">
                            {order.paymentStatus}
                          </span>
                        </div>
                        <Link
                          to={`/track/${order.orderId}`}
                          className="min-h-[36px] px-3 bg-[#0A0A0B] text-white rounded-lg inline-flex items-center gap-1 text-xs font-semibold"
                        >
                          <span>Track Live</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-bold text-zinc-900">
                Past Orders ({pastOrders.length})
              </h2>
              {pastOrders.length === 0 ? (
                <p className="text-xs text-zinc-500">No completed orders yet.</p>
              ) : (
                <div className="space-y-3">
                  {pastOrders.map((order) => (
                    <div
                      key={order.orderId}
                      className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                        <span className="font-mono font-semibold text-zinc-900 truncate">
                          {order.orderId}
                        </span>
                        <span className="shrink-0">{formatDateTime(order.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900">{order.status}</p>
                        {order.refundStatus && (
                          <span className="text-[11px] font-medium text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                            {order.refundStatus}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-600 line-clamp-2">{order.itemsPreview}</p>
                      {order.rejectionReason && (
                        <p className="text-[11px] text-red-700">
                          Reason: {order.rejectionReason}{' '}
                          <Link to="/refund-policy" className="underline font-semibold text-[#D97706] ml-1">
                            Refund Policy
                          </Link>
                        </p>
                      )}
                      <div className="pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-sm text-zinc-900 tabular-nums">
                          {formatRupees(order.finalAmount)}
                        </span>
                        <Link
                          to={`/track/${order.orderId}`}
                          className="min-h-[36px] px-3 bg-zinc-100 text-zinc-900 rounded-lg inline-flex items-center gap-1 text-xs font-semibold"
                        >
                          <span>View Order</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Desktop Orders View (>= 768px — untouched) */}
      <div className="hidden md:block max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex items-center gap-4 pb-6 border-b border-zinc-200">
        <BrandLogo className="h-14 w-auto rounded-lg" />
        <div>
          <p className="text-xs font-medium tracking-widest text-[#D97706]">{BRAND_NAME}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            My Orders
          </h1>
          {isCustomerAuthenticated && (
            <p className="text-xs text-zinc-600 mt-0.5">
              Customer: <strong className="text-zinc-900">{customerName || 'Customer'}</strong> ·{' '}
              <span className="font-mono">{verifiedPhone}</span> · Ordered{' '}
              <strong>{totalTimesOrdered} {totalTimesOrdered === 1 ? 'time' : 'times'}</strong>
            </p>
          )}
        </div>
      </div>

      {!isCustomerAuthenticated ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center space-y-4">
          <Package className="w-10 h-10 text-[#D97706] mx-auto" />
          <h2 className="text-xl font-bold text-zinc-900">Sign In to View Your Orders</h2>
          <Link
            to="/login?redirect=/orders"
            className="inline-block px-6 py-3 bg-[#E88D14] text-black font-semibold text-sm rounded-lg"
          >
            Login with Mobile &amp; 4-Digit PIN
          </Link>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-4">
          <Package className="w-10 h-10 text-zinc-400 mx-auto" />
          <h2 className="text-xl font-semibold text-zinc-900">No orders placed yet</h2>
          <Link
            to="/menu"
            className="inline-block px-5 py-2.5 bg-[#0A0A0B] text-white text-sm font-semibold rounded-lg"
          >
            Order from Menu
          </Link>
        </div>
      ) : (
        <div className="space-y-10">
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-zinc-900">
              Current Orders ({currentOrders.length})
            </h2>
            {currentOrders.length === 0 ? (
              <p className="text-sm text-zinc-500">No active orders in progress.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentOrders.map((order) => (
                  <div
                    key={order.orderId}
                    className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span className="font-mono font-semibold text-zinc-900">{order.orderId}</span>
                        <span>{formatDateTime(order.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-[#D97706]">{order.status}</p>
                        {order.status === 'PENDING ADMIN APPROVAL' && (
                          <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            Awaiting Kitchen Approval
                          </span>
                        )}
                        {order.refundStatus && (
                          <span className="text-[11px] font-medium text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                            {order.refundStatus}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-600 line-clamp-2">{order.itemsPreview}</p>
                      {order.rejectionReason && (
                        <p className="text-[11px] text-red-700">Reason: {order.rejectionReason}</p>
                      )}
                    </div>
                    <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="font-mono font-bold text-sm text-zinc-900">
                          {formatRupees(order.finalAmount)}
                        </span>
                        <span className="text-zinc-500 ml-2 uppercase">
                          Payment: {order.paymentStatus}
                        </span>
                      </div>
                      <Link
                        to={`/track/${order.orderId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 hover:text-[#D97706]"
                      >
                        <span>Track Live</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-zinc-900">
              Previous Orders ({pastOrders.length})
            </h2>
            {pastOrders.length === 0 ? (
              <p className="text-sm text-zinc-500">No completed orders yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pastOrders.map((order) => (
                  <div
                    key={order.orderId}
                    className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span className="font-mono font-semibold text-zinc-900">{order.orderId}</span>
                        <span>{formatDateTime(order.createdAt)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900">{order.status}</p>
                        {order.refundStatus && (
                          <span className="text-[11px] font-medium text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                            {order.refundStatus}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-600 line-clamp-2">{order.itemsPreview}</p>
                      {order.rejectionReason && (
                        <p className="text-[11px] text-red-700">
                          Reason: {order.rejectionReason}{' '}
                          <Link to="/refund-policy" className="underline font-semibold text-[#D97706] ml-1">
                            Refund Policy
                          </Link>
                        </p>
                      )}
                    </div>
                    <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                      <span className="font-mono font-bold text-sm text-zinc-900">
                        {formatRupees(order.finalAmount)}
                      </span>
                      <Link
                        to={`/track/${order.orderId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 hover:text-[#D97706]"
                      >
                        <span>View Receipt</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      </div>
    </>
  );
}
