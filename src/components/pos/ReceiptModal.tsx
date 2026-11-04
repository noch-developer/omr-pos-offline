import { Printer, CheckCircle2, X } from 'lucide-react';
import type { OrderWithDetails } from '../../types';
import { formatMoney, formatDateTime } from '../../utils/formatters';
import { Button } from '../ui/Button';

export interface ReceiptModalProps {
  order: OrderWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ReceiptModal({ order, isOpen, onClose }: ReceiptModalProps) {
  if (!isOpen || !order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Actions */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Order Completed</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Thermal Receipt Container */}
        <div className="p-6 overflow-y-auto flex-1 bg-white font-mono text-xs text-slate-800 leading-relaxed print:p-0 print:m-0 print:w-full">
          <div className="text-center pb-4 border-b border-dashed border-slate-300">
            <h1 className="text-base font-black tracking-tight uppercase">
              ONE MORE RESTAURANT
            </h1>
            <p className="text-[11px] font-sans font-medium text-slate-500 mt-0.5">
              Event Pop-Up POS Service
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              Event: {order.eventId} | Outlet: {order.outletCode}
            </p>
            <p className="text-[10px] text-slate-500">
              Terminal: {order.deviceId}
            </p>
          </div>

          <div className="py-3 border-b border-dashed border-slate-300 space-y-1">
            <div className="flex justify-between font-bold text-slate-900 text-sm">
              <span>Receipt #:</span>
              <span>{order.orderNumber}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Date:</span>
              <span>{formatDateTime(order.createdAt)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Status:</span>
              <span className={order.status === 'CANCELLED' ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                {order.status}
              </span>
            </div>
            {order.status === 'CANCELLED' && order.cancellationReason && (
              <div className="text-rose-600 text-[10px] italic">
                Reason: {order.cancellationReason}
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="py-3 border-b border-dashed border-slate-300">
            <div className="flex justify-between font-bold text-slate-600 pb-1.5 border-b border-slate-200 text-[11px]">
              <span>Item</span>
              <span>Qty x Price</span>
              <span>Total</span>
            </div>
            <div className="divide-y divide-slate-100 py-1">
              {order.items.map((item) => (
                <div key={item.id} className="py-1.5 flex justify-between items-start">
                  <div className="flex-1 pr-2">
                    <p className="font-sans font-semibold text-slate-800 text-xs">
                      {item.productName}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {item.quantity} x {formatMoney(item.unitPrice)}
                    </p>
                  </div>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(item.totalPrice)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Totals */}
          <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>{formatMoney(order.subtotalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-black text-slate-900 pt-1 border-t border-slate-200">
              <span>TOTAL DUE:</span>
              <span>{formatMoney(order.totalAmount)}</span>
            </div>
          </div>

          {/* Payment Details */}
          <div className="py-3 border-b border-dashed border-slate-300 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-600">Payment Method:</span>
              <span className="font-bold">{order.paymentMethod}</span>
            </div>

            {order.paymentMethod === 'CASH' && order.payment && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Cash Tendered:</span>
                  <span>{formatMoney(order.payment.amountReceived ?? order.totalAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700">
                  <span>Change Given:</span>
                  <span>{formatMoney(order.payment.changeGiven ?? 0)}</span>
                </div>
              </>
            )}

            {order.paymentMethod === 'QR' && order.payment && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>QR Reference:</span>
                  <span className="font-bold truncate max-w-[150px]">{order.payment.reference || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Transfer Verified:</span>
                  <span>CONFIRMED</span>
                </div>
              </>
            )}
          </div>

          {/* Receipt Footer */}
          <div className="pt-4 text-center text-slate-500 text-[11px] font-sans">
            <p className="font-semibold text-slate-700">Thank you for dining with us!</p>
            <p className="text-[10px] text-slate-400 mt-1">Please keep this receipt for verification.</p>
            <div className="mt-2 text-[9px] text-slate-400 font-mono">
              ID: {order.id.slice(0, 18)}
            </div>
          </div>
        </div>

        {/* Modal Bottom Buttons */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-2.5 print:hidden">
          <Button
            variant="outline"
            className="flex-1 py-2.5"
            onClick={handlePrint}
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Receipt
          </Button>
          <Button
            variant="primary"
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={onClose}
          >
            Next Order
          </Button>
        </div>
      </div>
    </div>
  );
}

