import Dexie, { type EntityTable } from 'dexie';

// 1. Tipe Data (Interface) Lokal
export interface LocalProduct {
  id: string; // UUID dari Supabase
  sku: string;
  name: string;
  branch_price: number;
  stock_qty: number;
}

export interface LocalTransaction {
  offline_id: string; // ID unik lokal (UUID v4)
  tenant_id: string;  // BARU
  branch_id: string;  // BARU
  cashier_id: string; // BARU
  total_amount: number;
  discount_amount: number; // <--- BARU
  order_note: string;
  payment_method: string;
  is_synced: number; // 0 = false (offline), 1 = true (sudah dikirim ke Supabase)
  created_at: string;
}

export interface LocalTransactionItem {
  id: string; // ID unik lokal
  transaction_id: string; // Relasi ke LocalTransaction.offline_id
  product_id: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

// 2. Definisi Skema Database Lokal
const db = new Dexie('POS_OfflineDatabase') as Dexie & {
  products: EntityTable<LocalProduct, 'id'>;
  transactions: EntityTable<LocalTransaction, 'offline_id'>;
  transaction_items: EntityTable<LocalTransactionItem, 'id'>;
};

// 3. Konfigurasi Versi & Indexing (Penting untuk performa pencarian produk)
db.version(1).stores({
  // Kolom pertama adalah Primary Key. Kolom berikutnya adalah index pencarian.
  products: 'id, sku, name', 
  transactions: 'offline_id, is_synced, created_at',
  transaction_items: 'id, transaction_id, product_id'
});

export { db };