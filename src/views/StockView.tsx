import { useState } from 'react';
import {
  PlusCircle,
  Trash,
  Sliders,
  History,
  AlertTriangle,
  ClipboardCheck,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { StockRecord, Product, StockMovement } from '../types';
import {
  setOpeningStock,
  addStockIn,
  recordWaste,
  recordPhysicalClosingCount,
  getStockMovements,
} from '../services/stockService';
import { exportStockToExcel } from '../services/excelService';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { formatDateTime } from '../utils/formatters';

export function StockView() {
  const products = useLiveQuery(
    async () => {
      const all = await db.products.toArray();
      return all.filter((p) => p.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    },
    [],
    []
  );
  const stocks = useLiveQuery(() => db.stock.toArray(), [], []);

  // Selected product for action modals
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalType, setModalType] = useState<'OPENING' | 'STOCK_IN' | 'WASTE' | 'CLOSING_COUNT' | null>(null);
  const [inputQty, setInputQty] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Movement history modal
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [movementList, setMovementList] = useState<StockMovement[]>([]);
  const [historyProductName, setHistoryProductName] = useState<string>('');

  const stockMap = new Map<string, StockRecord>();
  stocks.forEach((s) => stockMap.set(s.productId, s));

  const showSuccess = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const openActionModal = (
    product: Product,
    type: 'OPENING' | 'STOCK_IN' | 'WASTE' | 'CLOSING_COUNT'
  ) => {
    setSelectedProduct(product);
    setModalType(type);
    setErrorMessage(null);
    const stock = stockMap.get(product.id);

    if (type === 'OPENING') {
      setInputQty(String(stock?.openingQty || 0));
      setReason('Event Opening Stock Count');
    } else if (type === 'STOCK_IN') {
      setInputQty('10');
      setReason('Event Mid-day Restock');
    } else if (type === 'WASTE') {
      setInputQty('1');
      setReason('');
    } else if (type === 'CLOSING_COUNT') {
      setInputQty(String(stock?.remainingQty || 0));
      setReason('End of Event Physical Count Reconciliation');
    }
  };

  const handleOpenHistory = async (product?: Product) => {
    if (product) {
      setHistoryProductName(product.name);
      const list = await getStockMovements(product.id);
      setMovementList(list);
    } else {
      setHistoryProductName('All Products');
      const list = await getStockMovements();
      setMovementList(list);
    }
    setIsHistoryOpen(true);
  };

  const handleSubmitModal = async () => {
    if (!selectedProduct) return;
    const qty = parseInt(inputQty, 10);
    if (isNaN(qty) || qty < 0) {
      setErrorMessage('Please enter a valid non-negative number');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (modalType === 'OPENING') {
        await setOpeningStock(selectedProduct.id, qty, reason || 'Set Opening Stock');
        showSuccess(`Opening stock for ${selectedProduct.name} set to ${qty}`);
      } else if (modalType === 'STOCK_IN') {
        await addStockIn(selectedProduct.id, qty, reason || 'Restock');
        showSuccess(`Added +${qty} units of ${selectedProduct.name}`);
      } else if (modalType === 'WASTE') {
        if (!reason.trim()) {
          throw new Error('A reason is required to record waste');
        }
        await recordWaste(selectedProduct.id, qty, reason);
        showSuccess(`Recorded -${qty} waste for ${selectedProduct.name}`);
      } else if (modalType === 'CLOSING_COUNT') {
        await recordPhysicalClosingCount(selectedProduct.id, qty, reason);
        showSuccess(`Physical closing count for ${selectedProduct.name} updated to ${qty}`);
      }
      setModalType(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 select-none">
      {/* Toast banner */}
      {successToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Banner / Formula Bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-slate-900 tracking-tight">Stock Control</h1>
            <span className="text-xs bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded-md border border-slate-200">
              Remaining = Opening + Stock In - Sold - Waste
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time local inventory tracking, waste recording, and event closing stock count
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportStockToExcel()}
            className="flex items-center gap-1.5 text-emerald-800 border-emerald-300 hover:bg-emerald-50"
            title="Download stock inventory as an Excel spreadsheet"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Excel</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenHistory()}
            className="flex items-center gap-1.5"
          >
            <History className="w-4 h-4 text-slate-600" />
            <span>Audit Ledger</span>
          </Button>
        </div>
      </div>

      {/* Stock Table */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-3 text-center">Category</th>
                <th className="py-3 px-3 text-right">Opening</th>
                <th className="py-3 px-3 text-right text-emerald-700">Stock In (+)</th>
                <th className="py-3 px-3 text-right text-sky-700">Sold (-)</th>
                <th className="py-3 px-3 text-right text-rose-700">Waste (-)</th>
                <th className="py-3 px-4 text-right">Remaining</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {products.map((product) => {
                const stock = stockMap.get(product.id) || {
                  productId: product.id,
                  openingQty: 0,
                  stockIn: 0,
                  soldQty: 0,
                  wasteQty: 0,
                  remainingQty: 0,
                  updatedAt: '',
                };

                const isLow = stock.remainingQty > 0 && stock.remainingQty <= 5;
                const isOut = stock.remainingQty <= 0;

                return (
                  <tr key={product.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Product Name & Thumbnail */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-10 h-10 rounded-xl object-cover bg-slate-100 shrink-0 border border-slate-200/60"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{product.name}</div>
                          <span className="text-[10px] text-slate-400 font-mono">{product.sku}</span>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-[10px]">
                        {product.category}
                      </span>
                    </td>

                    {/* Opening */}
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-700">
                      {stock.openingQty}
                    </td>

                    {/* Stock In */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                      +{stock.stockIn}
                    </td>

                    {/* Sold */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-sky-700 bg-sky-50/30">
                      -{stock.soldQty}
                    </td>

                    {/* Waste */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-rose-700 bg-rose-50/30">
                      -{stock.wasteQty}
                    </td>

                    {/* Remaining */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span
                          className={`font-mono text-sm font-black px-2 py-0.5 rounded-lg ${
                            isOut
                              ? 'bg-rose-100 text-rose-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {stock.remainingQty}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openActionModal(product, 'OPENING')}
                          title="Set Opening Stock"
                          className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                          <Sliders className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openActionModal(product, 'STOCK_IN')}
                          title="Add Stock In"
                          className="p-1.5 rounded-lg text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 transition-colors"
                        >
                          <PlusCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openActionModal(product, 'WASTE')}
                          title="Record Waste"
                          className="p-1.5 rounded-lg text-rose-700 hover:text-rose-900 hover:bg-rose-50 transition-colors"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openActionModal(product, 'CLOSING_COUNT')}
                          title="Physical Closing Count"
                          className="p-1.5 rounded-lg text-amber-700 hover:text-amber-900 hover:bg-amber-50 transition-colors"
                        >
                          <ClipboardCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenHistory(product)}
                          title="Movement History"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Modal (Opening, Stock In, Waste, Closing Count) */}
      <Modal
        isOpen={modalType !== null}
        onClose={() => setModalType(null)}
        title={
          modalType === 'OPENING'
            ? `Set Opening Stock — ${selectedProduct?.name}`
            : modalType === 'STOCK_IN'
            ? `Add Stock In — ${selectedProduct?.name}`
            : modalType === 'WASTE'
            ? `Record Waste — ${selectedProduct?.name}`
            : `Physical Closing Count — ${selectedProduct?.name}`
        }
        description={
          modalType === 'OPENING'
            ? 'Initialize opening units for the start of the event.'
            : modalType === 'STOCK_IN'
            ? 'Add restocked inventory items.'
            : modalType === 'WASTE'
            ? 'Record spoiled, dropped, or damaged units with reason.'
            : 'Enter physically counted units remaining at the end of the event.'
        }
      >
        <div className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <Input
            type="number"
            min="0"
            label={
              modalType === 'OPENING'
                ? 'Opening Quantity'
                : modalType === 'STOCK_IN'
                ? 'Quantity to Add'
                : modalType === 'WASTE'
                ? 'Quantity Wasted'
                : 'Physical Count Quantity'
            }
            value={inputQty}
            onChange={(e) => setInputQty(e.target.value)}
            className="text-lg font-mono font-bold"
            autoFocus
          />

          <Input
            type="text"
            label="Reason / Note"
            placeholder={
              modalType === 'WASTE'
                ? 'e.g. Expired milk, dropped cup, burn'
                : 'e.g. Delivered from main kitchen'
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText={modalType === 'WASTE' ? 'Mandatory for waste tracking' : undefined}
          />

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalType(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className={modalType === 'WASTE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}
              onClick={handleSubmitModal}
              isLoading={isSubmitting}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      {/* Movement History Audit Modal */}
      <Modal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        title={`Stock Movement Ledger: ${historyProductName}`}
        description="Immutable audit trail of all inventory events and adjustments"
        size="lg"
      >
        <div className="max-h-[60vh] overflow-y-auto">
          {movementList.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No stock movements recorded yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-400">
                  <th className="py-2">Date & Time</th>
                  <th className="py-2">Type</th>
                  <th className="py-2 text-right">Change</th>
                  <th className="py-2 text-right">Remaining</th>
                  <th className="py-2 pl-4">Reason / Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movementList.map((m) => {
                  const isPositive = m.quantity > 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-2.5 font-mono text-slate-500 text-[11px]">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.type === 'SALE'
                              ? 'bg-sky-100 text-sky-800'
                              : m.type === 'WASTE'
                              ? 'bg-rose-100 text-rose-800'
                              : m.type === 'STOCK_IN'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.type === 'SALE_CANCELLED_RETURN'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 text-right font-mono font-bold ${
                          isPositive ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isPositive ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-slate-800">
                        {m.newQty}
                      </td>
                      <td className="py-2.5 pl-4 text-slate-600 truncate max-w-[200px]" title={m.reason}>
                        {m.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
    </div>
  );
}
