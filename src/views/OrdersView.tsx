import { useState, useMemo } from 'react';
import {
  Search,
  Printer,
  Eye,
  AlertTriangle,
  FileText,
  Ban,
  FileSpreadsheet,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { OrderWithDetails, OrderStatus, SyncStatus } from '../types';
import { cancelOrder } from '../services/orderService';
import { exportOrdersToExcel } from '../services/excelService';
import { formatMoney, formatDateTime } from '../utils/formatters';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ReceiptModal } from '../components/pos/ReceiptModal';

export function OrdersView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [syncFilter, setSyncFilter] = useState<'ALL' | SyncStatus>('ALL');

  // Modals
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const [reprintOrder, setReprintOrder] = useState<OrderWithDetails | null>(null);
  const [orderToCancel, setOrderToCancel] = useState<OrderWithDetails | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Live queries
  const rawOrders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray(), [], []);
  const allItems = useLiveQuery(() => db.orderItems.toArray(), [], []);
  const allPayments = useLiveQuery(() => db.payments.toArray(), [], []);

  // Assemble full order details
  const ordersWithDetails = useMemo<OrderWithDetails[]>(() => {
    return rawOrders.map((order) => {
      const items = allItems.filter((i) => i.orderId === order.id);
      const payment = allPayments.find((p) => p.orderId === order.id);
      return {
        ...order,
        items,
        payment,
      };
    });
  }, [rawOrders, allItems, allPayments]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return ordersWithDetails.filter((o) => {
      const matchSearch =
        searchQuery.trim() === '' ||
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.paymentMethod.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.items.some((i) => i.productName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchSync = syncFilter === 'ALL' || o.syncStatus === syncFilter;

      return matchSearch && matchStatus && matchSync;
    });
  }, [ordersWithDetails, searchQuery, statusFilter, syncFilter]);

  // Aggregate stats
  const totalSales = useMemo(() => {
    return ordersWithDetails
      .filter((o) => o.status === 'COMPLETED')
      .reduce((acc, curr) => acc + curr.totalAmount, 0);
  }, [ordersWithDetails]);

  const completedCount = useMemo(() => {
    return ordersWithDetails.filter((o) => o.status === 'COMPLETED').length;
  }, [ordersWithDetails]);

  const cancelledCount = useMemo(() => {
    return ordersWithDetails.filter((o) => o.status === 'CANCELLED').length;
  }, [ordersWithDetails]);

  const handleOpenCancelModal = (order: OrderWithDetails) => {
    if (order.status === 'CANCELLED') {
      return; // Already cancelled
    }
    setOrderToCancel(order);
    setCancellationReason('');
    setCancelError(null);
  };

  const handleConfirmCancel = async () => {
    if (!orderToCancel) return;
    if (!cancellationReason.trim()) {
      setCancelError('Please enter a cancellation reason');
      return;
    }

    setIsSubmittingCancel(true);
    setCancelError(null);

    try {
      await cancelOrder(orderToCancel.id, cancellationReason);
      setOrderToCancel(null);
    } catch (err: unknown) {
      setCancelError(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 select-none">
      {/* Top Summary Cards */}
      <div className="p-4 bg-white border-b border-slate-200 shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Total Revenue
            </span>
            <div className="text-xl font-black text-slate-900 font-mono mt-1">
              {formatMoney(totalSales)}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/80">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
              Completed Orders
            </span>
            <div className="text-xl font-black text-emerald-800 font-mono mt-1">
              {completedCount}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80">
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wide">
              Cancelled Orders
            </span>
            <div className="text-xl font-black text-rose-800 font-mono mt-1">
              {cancelledCount}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200/80">
            <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wide">
              Total Transactions
            </span>
            <div className="text-xl font-black text-sky-800 font-mono mt-1">
              {ordersWithDetails.length}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-3.5 flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order #, items, or payment method..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | OrderStatus)}
              className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Status</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={syncFilter}
              onChange={(e) => setSyncFilter(e.target.value as 'ALL' | SyncStatus)}
              className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Sync</option>
              <option value="PENDING">Pending Sync</option>
              <option value="SYNCED">Synced</option>
              <option value="MOCK_SYNCED">Mock Synced</option>
              <option value="FAILED">Failed</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => exportOrdersToExcel()}
              className="flex items-center gap-1.5 text-xs text-purple-800 border-purple-200 hover:bg-purple-50 shrink-0"
              title="Export all orders and item sales to Excel spreadsheet"
            >
              <FileSpreadsheet className="w-4 h-4 text-purple-600" />
              <span>Export Sales (.xlsx)</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="flex-1 overflow-auto p-4">
        {filteredOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-white rounded-2xl border border-slate-200">
            <FileText className="w-12 h-12 stroke-[1.5] text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700 text-sm">No orders found</p>
            <p className="text-xs text-slate-400 mt-1">
              Transactions will appear here after checking out on the POS register.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-3">Date & Time</th>
                  <th className="py-3 px-3">Items</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-3 text-center">Payment</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Sync Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredOrders.map((order) => {
                  const isCancelled = order.status === 'CANCELLED';

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Order Number */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {order.orderNumber}
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 px-3 font-mono text-slate-600 text-[11px]">
                        {formatDateTime(order.createdAt)}
                      </td>

                      {/* Items Preview */}
                      <td className="py-3 px-3 text-slate-700 max-w-[200px] truncate" title={order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}>
                        {order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                      </td>

                      {/* Total */}
                      <td className={`py-3 px-3 text-right font-mono font-black ${isCancelled ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {formatMoney(order.totalAmount)}
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px]">
                          {order.paymentMethod}
                        </span>
                      </td>

                      {/* Order Status */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isCancelled
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>

                      {/* Sync Status */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            order.syncStatus === 'SYNCED'
                              ? 'bg-green-100 text-green-800'
                              : order.syncStatus === 'MOCK_SYNCED'
                              ? 'bg-amber-100 text-amber-900'
                              : order.syncStatus === 'FAILED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-yellow-100 text-yellow-900'
                          }`}
                        >
                          {order.syncStatus}
                        </span>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setDetailOrder(order)}
                            title="View Details"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setReprintOrder(order)}
                            title="Reprint Receipt"
                            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenCancelModal(order)}
                            disabled={isCancelled}
                            title={isCancelled ? 'Order already cancelled' : 'Cancel Order (Reverse Stock)'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isCancelled
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-rose-600 hover:text-rose-900 hover:bg-rose-50'
                            }`}
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      <Modal
        isOpen={detailOrder !== null}
        onClose={() => setDetailOrder(null)}
        title={`Order Details: ${detailOrder?.orderNumber}`}
        description={`Created at ${detailOrder ? formatDateTime(detailOrder.createdAt) : ''}`}
        size="md"
      >
        {detailOrder && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono text-slate-700">{detailOrder.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Event / Device:</span>
                <span className="font-semibold text-slate-800">
                  {detailOrder.eventId} | {detailOrder.deviceId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className={`font-bold ${detailOrder.status === 'CANCELLED' ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {detailOrder.status}
                </span>
              </div>
              {detailOrder.cancellationReason && (
                <div className="flex justify-between text-rose-600 font-medium">
                  <span>Cancel Reason:</span>
                  <span>{detailOrder.cancellationReason}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Sync Status:</span>
                <span className="font-bold">{detailOrder.syncStatus}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-800 mb-2">Order Items</h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {detailOrder.items.map((item) => (
                  <div key={item.id} className="p-2.5 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-800">{item.productName}</div>
                      <div className="text-[10px] text-slate-500">
                        {item.quantity} x {formatMoney(item.unitPrice)}
                      </div>
                    </div>
                    <span className="font-mono font-bold text-slate-900">
                      {formatMoney(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>{formatMoney(detailOrder.subtotalAmount)}</span>
              </div>
              <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t border-slate-200">
                <span>Total:</span>
                <span>{formatMoney(detailOrder.totalAmount)}</span>
              </div>
            </div>

            {detailOrder.payment && (
              <div className="p-3 bg-emerald-50/60 rounded-xl space-y-1">
                <div className="font-bold text-emerald-900 mb-1">Payment Information</div>
                <div className="flex justify-between">
                  <span>Method:</span>
                  <span className="font-bold">{detailOrder.payment.method}</span>
                </div>
                {detailOrder.payment.method === 'CASH' && (
                  <>
                    <div className="flex justify-between">
                      <span>Tendered:</span>
                      <span>{formatMoney(detailOrder.payment.amountReceived ?? detailOrder.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-800">
                      <span>Change:</span>
                      <span>{formatMoney(detailOrder.payment.changeGiven ?? 0)}</span>
                    </div>
                  </>
                )}
                {detailOrder.payment.method === 'QR' && (
                  <div className="flex justify-between">
                    <span>Reference:</span>
                    <span className="font-mono font-bold">{detailOrder.payment.reference}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Cancel Order Modal */}
      <Modal
        isOpen={orderToCancel !== null}
        onClose={() => setOrderToCancel(null)}
        title={`Cancel Order #${orderToCancel?.orderNumber}`}
        description="Warning: Cancelling will reverse sold stock back into inventory exactly once."
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Irreversible Action</p>
              <p className="mt-0.5">
                All {orderToCancel?.items.length} items from this order will be immediately returned to
                the active stock count. This operation cannot be undone.
              </p>
            </div>
          </div>

          {cancelError && (
            <div className="text-xs font-semibold text-rose-600 bg-rose-50 p-2 rounded-lg">
              {cancelError}
            </div>
          )}

          <Input
            label="Cancellation Reason *"
            placeholder="e.g. Customer changed mind, wrong item prepared, spill"
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
            helperText="Reason is mandatory for accounting and stock reconciliation"
            autoFocus
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOrderToCancel(null)} disabled={isSubmittingCancel}>
              Back
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmCancel}
              isLoading={isSubmittingCancel}
              disabled={!cancellationReason.trim()}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reprint Receipt Modal */}
      <ReceiptModal
        isOpen={reprintOrder !== null}
        order={reprintOrder}
        onClose={() => setReprintOrder(null)}
      />
    </div>
  );
}
