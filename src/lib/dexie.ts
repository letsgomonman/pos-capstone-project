import Dexie, { type EntityTable } from 'dexie';

// Model data: produk lokal
export interface LocalProduct {
  id: string; // UUID produk dari Supabase
  sku: string;
  name: string;
  branch_price: number;
  stock_qty: number;
}

// Model data: transaksi lokal
export interface LocalTransaction {
  offline_id: string; // ID transaksi lokal (UUID v4)
  tenant_id: string;
  branch_id: string;
  cashier_id: string;
  customer_name?: string;  // PERBAIKAN: Menyimpan nama pelanggan
  customer_phone?: string; // PERBAIKAN: Menyimpan nomor HP
  total_amount: number;
  discount_amount: number;
  order_note: string;
  payment_method: string;
  is_synced: number; // 0 = belum tersinkronisasi, 1 = sudah dikirim ke Supabase
  created_at: string;
}

// Model data: item transaksi lokal
export interface LocalTransactionItem {
  id: string; // ID item transaksi lokal
  transaction_id: string; // Mengacu pada LocalTransaction.offline_id
  product_id: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

// Database lokal untuk penyimpanan data offline
const db = new Dexie('POS_OfflineDatabase') as Dexie & {
  products: EntityTable<LocalProduct, 'id'>;
  transactions: EntityTable<LocalTransaction, 'offline_id'>;
  transaction_items: EntityTable<LocalTransactionItem, 'id'>;
};

// Skema database: versi 2 (Pembaruan Skema)
db.version(2).stores({
  products: 'id, sku, name',
  transactions: 'offline_id, is_synced, created_at',
  transaction_items: 'id, transaction_id, product_id'
});

export { db };