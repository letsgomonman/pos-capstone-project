import Dexie, { type EntityTable } from 'dexie';

// Produk lokal
export interface LocalProduct {
  id: string; // UUID produk di Supabase
  sku: string;
  name: string;
  branch_price: number;
  stock_qty: number;
}

// Transaksi lokal
export interface LocalTransaction {
  offline_id: string; // UUID v4 transaksi lokal
  tenant_id: string;
  branch_id: string;
  cashier_id: string;
  customer_name?: string; // Nama pelanggan
  customer_phone?: string; // Nomor telepon pelanggan
  total_amount: number;
  discount_amount: number;
  order_note: string;
  payment_method: string;
  is_synced: number; // 0 = belum tersinkronisasi, 1 = sudah tersinkronisasi ke Supabase
  created_at: string;
}

// Item transaksi lokal
export interface LocalTransactionItem {
  id: string; // ID item transaksi lokal
  transaction_id: string; // Mengacu pada UUID transaksi lokal
  product_id: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

// Penyimpanan data offline
const db = new Dexie('POS_OfflineDatabase') as Dexie & {
  products: EntityTable<LocalProduct, 'id'>;
  transactions: EntityTable<LocalTransaction, 'offline_id'>;
  transaction_items: EntityTable<LocalTransactionItem, 'id'>;
};

// Skema database: Versi 2
db.version(2).stores({
  products: 'id, sku, name',
  transactions: 'offline_id, is_synced, created_at',
  transaction_items: 'id, transaction_id, product_id'
});

export { db };