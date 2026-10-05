import { create } from 'zustand';
import { LocalProduct } from '@/lib/dexie';

// Extend tipe produk dari Dexie untuk menambahkan qty di keranjang
export interface CartItem extends LocalProduct {
  cartQty: number;
  subtotal: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: LocalProduct) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  
  addItem: (product) => set((state) => {
    const existingItem = state.items.find(item => item.id === product.id);
    if (existingItem) {
      // Jika barang sudah ada, tambah qty saja
      return {
        items: state.items.map(item => 
          item.id === product.id 
            ? { ...item, cartQty: item.cartQty + 1, subtotal: (item.cartQty + 1) * item.branch_price }
            : item
        )
      };
    }
    // Jika barang baru
    return { 
      items: [...state.items, { ...product, cartQty: 1, subtotal: product.branch_price }] 
    };
  }),

  removeItem: (productId) => set((state) => ({
    items: state.items.filter(item => item.id !== productId)
  })),

  updateQuantity: (productId, qty) => set((state) => ({
    items: state.items.map(item =>
      item.id === productId
        ? { ...item, cartQty: qty, subtotal: qty * item.branch_price }
        : item
    )
  })),

  clearCart: () => set({ items: [] }),

  getTotal: () => {
    return get().items.reduce((total, item) => total + item.subtotal, 0);
  }
}));