import { create } from 'zustand';
import type { Product } from '../types';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product, availableStock: number) => { success: boolean; message?: string };
  updateQuantity: (productId: string, quantity: number, availableStock: number) => { success: boolean; message?: string };
  removeItem: (productId: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product: Product, availableStock: number) => {
    if (availableStock <= 0) {
      return { success: false, message: `"${product.name}" is out of stock` };
    }

    const { items } = get();
    const existingIndex = items.findIndex((i) => i.product.id === product.id);

    if (existingIndex > -1) {
      const currentQty = items[existingIndex].quantity;
      if (currentQty + 1 > availableStock) {
        return {
          success: false,
          message: `Cannot add more. Only ${availableStock} in stock.`,
        };
      }

      const updated = [...items];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: currentQty + 1,
      };
      set({ items: updated });
      return { success: true };
    } else {
      set({ items: [...items, { product, quantity: 1 }] });
      return { success: true };
    }
  },

  updateQuantity: (productId: string, quantity: number, availableStock: number) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return { success: true };
    }

    if (quantity > availableStock) {
      return {
        success: false,
        message: `Maximum available stock is ${availableStock}`,
      };
    }

    const { items } = get();
    const updated = items.map((item) =>
      item.product.id === productId ? { ...item, quantity } : item
    );
    set({ items: updated });
    return { success: true };
  },

  removeItem: (productId: string) => {
    const { items } = get();
    set({ items: items.filter((i) => i.product.id !== productId) });
  },

  clearCart: () => {
    set({ items: [] });
  },

  getSubtotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  },

  getTotalItems: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));

