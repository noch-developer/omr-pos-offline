import { useState, useEffect } from 'react';
import {
  Banknote,
  QrCode,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import type { PaymentMethod, OrderWithDetails } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { createOrderAndPayment } from '../../services/orderService';
import { useCartStore } from '../../store/cartStore';
import { db } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number; // in cents
  onPaymentSuccess: (order: OrderWithDetails) => void;
}

export function PaymentModal({
  isOpen,
  onClose,
  totalAmount,
  onPaymentSuccess,
}: PaymentModalProps) {
  const { items, clearCart } = useCartStore();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');

  // Cash state
  const [amountReceivedInput, setAmountReceivedInput] = useState<string>('');
  const [changeAmount, setChangeAmount] = useState<number>(0);

  // QR state
  const [qrReference, setQrReference] = useState<string>('');
  const [isQrVerified, setIsQrVerified] = useState<boolean>(false);

  // State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Merchant settings for QR display
  const merchantSettings = useLiveQuery(
    async () => {
      const name = await db.settings.get('qrMerchantName');
      const account = await db.settings.get('qrAccountNumber');
      return {
        name: (name?.value as string) || 'ONE MORE RESTAURANT EVENT',
        account: (account?.value as string) || '099 888 777',
      };
    },
    [],
    { name: 'ONE MORE RESTAURANT EVENT', account: '099 888 777' }
  );

  // Reset inputs when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedMethod('CASH');
      const defaultDollars = (totalAmount / 100).toFixed(2);
      setAmountReceivedInput(defaultDollars);
      setChangeAmount(0);
      setQrReference('');
      setIsQrVerified(false);
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, totalAmount]);

  // Recalculate cash change
  useEffect(() => {
    if (selectedMethod === 'CASH') {
      const parsedDollars = parseFloat(amountReceivedInput);
      if (!isNaN(parsedDollars)) {
        const receivedCents = Math.round(parsedDollars * 100);
        setChangeAmount(receivedCents - totalAmount);
      } else {
        setChangeAmount(-totalAmount);
      }
    }
  }, [amountReceivedInput, totalAmount, selectedMethod]);

  if (!isOpen) return null;

  const receivedCents = Math.round((parseFloat(amountReceivedInput) || 0) * 100);
  const isCashSufficient = receivedCents >= totalAmount;

  const handleQuickCash = (amountInDollars: number) => {
    setAmountReceivedInput(amountInDollars.toFixed(2));
  };

  const handleExactCash = () => {
    setAmountReceivedInput((totalAmount / 100).toFixed(2));
  };

  const handleNextMultiple = (multiple: number) => {
    const totalDollars = totalAmount / 100;
    const rounded = Math.ceil(totalDollars / multiple) * multiple;
    setAmountReceivedInput(rounded.toFixed(2));
  };

  const handleConfirmPayment = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const checkoutItems = items.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
      }));

      const completedOrder = await createOrderAndPayment({
        items: checkoutItems,
        paymentMethod: selectedMethod,
        amountReceived: selectedMethod === 'CASH' ? receivedCents : undefined,
        qrReference: selectedMethod === 'QR' ? qrReference : undefined,
        qrVerified: selectedMethod === 'QR' ? isQrVerified : undefined,
      });

      clearCart();
      onPaymentSuccess(completedOrder);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header with Amount */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-800 to-emerald-700 text-white flex items-center justify-between shrink-0">
          <div>
            <span className="text-xs font-semibold tracking-wider uppercase text-emerald-200">
              Total Payable Amount
            </span>
            <div className="text-3xl font-black tracking-tight mt-0.5">
              {formatMoney(totalAmount)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/70 text-xs font-bold transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Method Toggle Buttons */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setSelectedMethod('CASH')}
              className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                selectedMethod === 'CASH'
                  ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-500'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Banknote className="w-5 h-5" />
              <span>Cash Payment</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedMethod('QR')}
              className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl font-bold text-sm transition-all ${
                selectedMethod === 'QR'
                  ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-500'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <QrCode className="w-5 h-5" />
              <span>QR Payment</span>
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-700 text-xs font-medium shrink-0 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Method Specific Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {selectedMethod === 'CASH' ? (
            <div className="space-y-5">
              {/* Cash Received Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Amount Received (USD $)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amountReceivedInput}
                    onChange={(e) => setAmountReceivedInput(e.target.value)}
                    className="w-full pl-9 pr-4 py-3.5 rounded-2xl border-2 border-slate-300 font-mono text-2xl font-black text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 transition-all"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              {/* Quick Cash Presets */}
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                  Quick Cash Tenders
                </span>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  <button
                    type="button"
                    onClick={handleExactCash}
                    className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 font-bold text-xs transition-colors"
                  >
                    Exact
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNextMultiple(5)}
                    className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 font-bold text-xs transition-colors"
                  >
                    Round $5
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNextMultiple(10)}
                    className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 font-bold text-xs transition-colors"
                  >
                    Round $10
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickCash(10)}
                    className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 font-bold text-xs transition-colors"
                  >
                    $10
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickCash(20)}
                    className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 font-bold text-xs transition-colors"
                  >
                    $20
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickCash(50)}
                    className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 font-bold text-xs transition-colors"
                  >
                    $50
                  </button>
                </div>
              </div>

              {/* Change Calculation Box */}
              <div
                className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
                  isCashSufficient
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider block">
                    {isCashSufficient ? 'Change to Return' : 'Shortage (Insufficient Cash)'}
                  </span>
                  <p className="text-xs opacity-75 mt-0.5">
                    {isCashSufficient
                      ? 'Hand this change back to the customer'
                      : 'Please collect more cash from the customer'}
                  </p>
                </div>
                <div
                  className={`text-2xl font-black font-mono ${
                    isCashSufficient ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {formatMoney(Math.abs(changeAmount))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* QR Code and Instructions */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                {/* Visual QR Code Card */}
                <div className="w-36 h-36 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center shrink-0">
                  <div className="w-full h-full bg-slate-900 rounded-lg p-2 flex flex-col items-center justify-between relative overflow-hidden">
                    {/* Simulated Clean QR matrix pattern */}
                    <div className="w-full h-full flex flex-wrap gap-1 p-1 bg-white rounded">
                      <div className="w-6 h-6 bg-slate-900 border-2 border-emerald-600 rounded-xs"></div>
                      <div className="flex-1 flex gap-0.5"><div className="w-2 h-2 bg-slate-900"></div><div className="w-3 h-1 bg-slate-900"></div></div>
                      <div className="w-6 h-6 bg-slate-900 border-2 border-emerald-600 rounded-xs"></div>
                      <div className="w-full flex justify-between px-1"><div className="w-2 h-4 bg-slate-800"></div><div className="w-3 h-2 bg-slate-900"></div><div className="w-2 h-3 bg-slate-800"></div></div>
                      <div className="w-6 h-6 bg-slate-900 border-2 border-emerald-600 rounded-xs"></div>
                      <div className="flex-1 flex items-center justify-center font-bold text-[8px] text-emerald-700 font-mono">
                        OMR
                      </div>
                      <div className="w-2 h-2 bg-slate-900"></div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 text-center sm:text-left space-y-1.5">
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    KHQR / Universal Pay
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-sm">
                    {merchantSettings.name}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono">
                    Account: {merchantSettings.account}
                  </p>
                  <p className="text-xs font-bold text-emerald-700">
                    Amount: {formatMoney(totalAmount)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Show QR on tablet or customer scans the printed stand.
                  </p>
                </div>
              </div>

              {/* Reference Input */}
              <div>
                <Input
                  label="Bank Payment Reference / Transaction ID *"
                  placeholder="e.g. TXN-89412 or App Ref #"
                  value={qrReference}
                  onChange={(e) => setQrReference(e.target.value)}
                  className="font-mono text-sm py-3"
                  helperText="Required: Type the reference code shown on customer's payment slip"
                />
              </div>

              {/* Manual Staff Verification Checkbox */}
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300/80">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isQrVerified}
                    onChange={(e) => setIsQrVerified(e.target.checked)}
                    className="mt-0.5 h-5 w-5 rounded-md border-amber-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-amber-950 block">
                      Staff Verification Confirmation *
                    </span>
                    <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                      I have personally verified that {formatMoney(totalAmount)} has been credited
                      into the restaurant event bank account.
                    </p>
                  </div>
                </label>
              </div>

              {/* Mandatory warning */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500 italic">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Security rule: Unverified QR transfers are strictly blocked from completion.</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>

          <Button
            variant="primary"
            size="lg"
            className="px-8 bg-emerald-600 hover:bg-emerald-700"
            isLoading={isSubmitting}
            disabled={
              selectedMethod === 'CASH'
                ? !isCashSufficient
                : !qrReference.trim() || !isQrVerified
            }
            onClick={handleConfirmPayment}
          >
            <span>Confirm & Complete Order</span>
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
