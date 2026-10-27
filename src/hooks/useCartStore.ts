import { create } from 'zustand';
import { LocalProduct } from '@/lib/dexie';

export interface CartItem {
  id: string;
  sku: string;
  name: string;
  branch_price: number;
  cartQty: number;
  subtotal: number;
  stock_qty: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: LocalProduct) => void;
  updateQuantity: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  
  // Tambah produk ke keranjang atau naikkan jumlah produk yang sudah ada.
  addItem: (product: LocalProduct) => set((state) => {
    const existingItem = state.items.find(i => i.id === product.id);
    
    if (existingItem) {
      return {
        items: state.items.map(i => i.id === product.id 
          ? { ...i, cartQty: i.cartQty + 1, subtotal: (i.cartQty + 1) * i.branch_price } 
          : i
        )
      };
    }
    
    return {
      items: [...state.items, {
        id: product.id,
        sku: product.sku,
        name: product.name,
        branch_price: product.branch_price,
        cartQty: 1,
        subtotal: product.branch_price,
        stock_qty: product.stock_qty
      }]
    };
  }),

  // Perbarui jumlah produk dan hitung ulang subtotalnya.
  updateQuantity: (id: string, qty: number) => set((state) => ({
    items: state.items.map(item =>
      item.id === id
        ? { ...item, cartQty: qty, subtotal: qty * item.branch_price }
        : item
    ),
  })),

  // Hapus produk tertentu dari keranjang.
  removeItem: (id: string) => set((state) => ({
    items: state.items.filter(item => item.id !== id),
  })),

  // Kosongkan seluruh item keranjang.
  clearCart: () => set({ items: [] }),

  // Hitung total transaksi dari subtotal seluruh item.
  getTotal: () => {
    return get().items.reduce((total, item) => total + item.subtotal, 0);
  },
}));