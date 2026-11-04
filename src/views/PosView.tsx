import { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  AlertCircle,
  PackageX,
  CreditCard,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Product, StockRecord, ProductCategory, OrderWithDetails } from '../types';
import { useCartStore } from '../store/cartStore';
import { formatMoney } from '../utils/formatters';
import { Button } from '../components/ui/Button';
import { PaymentModal } from '../components/pos/PaymentModal';
import { ReceiptModal } from '../components/pos/ReceiptModal';

const CATEGORIES: ProductCategory[] = ['All', 'Coffee', 'Tea', 'Food', 'Beverages', 'Bakery'];

export function PosView() {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<OrderWithDetails | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live query of products and stocks from IndexedDB
  const products = useLiveQuery(
    async () => {
      const all = await db.products.toArray();
      return all.filter((p) => p.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    },
    [],
    []
  );
  const stocks = useLiveQuery(() => db.stock.toArray(), [], []);

  // Cart store
  const { items, addItem, updateQuantity, removeItem, clearCart, getSubtotal, getTotalItems } =
    useCartStore();

  // Stock map lookup
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    stocks.forEach((s: StockRecord) => {
      map.set(s.productId, s.remainingQty);
    });
    return map;
  }, [stocks]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p: Product) => {
      const matchesCategory =
        selectedCategory === 'All' || p.category.toLowerCase() === selectedCategory.toLowerCase();
      const matchesSearch =
        searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleAddToCart = (product: Product) => {
    const available = stockMap.get(product.id) ?? 0;
    const res = addItem(product, available);
    if (!res.success && res.message) {
      showToast(res.message);
    }
  };

  const handleQtyChange = (productId: string, newQty: number) => {
    const available = stockMap.get(productId) ?? 0;
    const res = updateQuantity(productId, newQty, available);
    if (!res.success && res.message) {
      showToast(res.message);
    }
  };

  const subtotal = getSubtotal();
  const totalItemsCount = getTotalItems();

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-100 select-none">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* LEFT SIDE: Product Catalog (Tablet Landscape First) */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200/80 bg-slate-50/50">
        {/* Search & Category Header */}
        <div className="p-3.5 bg-white border-b border-slate-200 space-y-3 shrink-0">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by name or category..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="p-3.5 overflow-y-auto flex-1">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <PackageX className="w-12 h-12 stroke-[1.5] text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600 text-sm">No products found</p>
              <p className="text-xs text-slate-400 mt-1">Try another category or search term</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((product: Product) => {
                const stock = stockMap.get(product.id) ?? 0;
                const isOutOfStock = stock <= 0;
                const isLowStock = stock > 0 && stock <= 5;
                const cartQty = items.find((i) => i.product.id === product.id)?.quantity || 0;

                return (
                  <div
                    key={product.id}
                    onClick={() => !isOutOfStock && handleAddToCart(product)}
                    className={`group relative bg-white rounded-2xl border transition-all duration-150 p-3 flex flex-col justify-between select-none cursor-pointer ${
                      isOutOfStock
                        ? 'opacity-60 cursor-not-allowed border-slate-200 bg-slate-50'
                        : 'border-slate-200/90 hover:border-emerald-500 hover:shadow-md active:scale-[0.98]'
                    }`}
                  >
                    {/* In-cart indicator badge */}
                    {cartQty > 0 && (
                      <span className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shadow-xs">
                        {cartQty}
                      </span>
                    )}

                    {/* Product Image */}
                    <div className="w-full aspect-square rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center mb-2.5">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                        loading="lazy"
                      />
                    </div>

                    {/* Product Name & Category */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/80">
                        {product.category}
                      </div>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight line-clamp-1 mt-0.5">
                        {product.name}
                      </h3>
                    </div>

                    {/* Price and Stock Footer */}
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="font-black text-slate-900 text-base">
                        {formatMoney(product.price)}
                      </span>

                      {/* Stock status pill */}
                      {isOutOfStock ? (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                          Out of Stock
                        </span>
                      ) : isLowStock ? (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {stock} left
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-500">
                          {stock} in stock
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDE: Current Order Shopping Cart (Tablet Landscape 340px - 400px width) */}
      <div className="w-full md:w-[360px] lg:w-[400px] bg-white flex flex-col shrink-0 border-l border-slate-200 shadow-sm">
        {/* Cart Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Current Order</h2>
              <p className="text-[11px] text-slate-400">
                {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>

          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mb-3">
                <ShoppingCart className="w-7 h-7" />
              </div>
              <p className="font-bold text-slate-700 text-sm">Cart is empty</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                Tap product cards on the left to add items to this order
              </p>
            </div>
          ) : (
            items.map(({ product, quantity }) => {
              const available = stockMap.get(product.id) ?? 0;
              const itemTotal = product.price * quantity;

              return (
                <div key={product.id} className="py-3 first:pt-0 last:pb-0 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-800 text-xs truncate">
                      {product.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {formatMoney(product.price)} each
                    </p>
                    <div className="text-xs font-extrabold text-emerald-700 mt-0.5">
                      {formatMoney(itemTotal)}
                    </div>
                  </div>

                  {/* Quantity Touch Controls */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                    <button
                      onClick={() => handleQtyChange(product.id, quantity - 1)}
                      className="w-7 h-7 rounded-lg bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors active:scale-95 shadow-xs"
                      title="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <span className="w-7 text-center font-bold text-slate-800 text-xs">
                      {quantity}
                    </span>

                    <button
                      onClick={() => handleQtyChange(product.id, quantity + 1)}
                      disabled={quantity >= available}
                      className="w-7 h-7 rounded-lg bg-white text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors active:scale-95 shadow-xs"
                      title="Increase quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => removeItem(product.id)}
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors ml-0.5"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cart Bottom Summary & Checkout Button */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3 shrink-0">
          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-800">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Event Tax (0%)</span>
              <span className="font-semibold text-slate-800">$0.00</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
              <span className="font-extrabold text-sm text-slate-900">Total Due</span>
              <span className="text-2xl font-black text-slate-900 font-mono">
                {formatMoney(subtotal)}
              </span>
            </div>
          </div>

          <Button
            size="xl"
            disabled={items.length === 0}
            onClick={() => setIsPaymentOpen(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 text-base shadow-lg shadow-emerald-700/20 flex items-center justify-center gap-2"
          >
            <CreditCard className="w-5 h-5" />
            <span>Charge {formatMoney(subtotal)}</span>
          </Button>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        totalAmount={subtotal}
        onClose={() => setIsPaymentOpen(false)}
        onPaymentSuccess={(order) => {
          setIsPaymentOpen(false);
          setCompletedOrder(order);
        }}
      />

      {/* Receipt Modal */}
      <ReceiptModal
        isOpen={completedOrder !== null}
        order={completedOrder}
        onClose={() => setCompletedOrder(null)}
      />
    </div>
  );
}

