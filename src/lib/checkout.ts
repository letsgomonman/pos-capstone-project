import { db } from './dexie';
import { supabase } from './supabase';
import { CartItem } from '@/hooks/useCartStore';

interface CheckoutParams {
  items: CartItem[];
  totalAmount: number;
  paymentMethod: string;
  tenantId: string;
  branchId: string;
  cashierId: string;
}

export async function processCheckout({
  items,
  totalAmount,
  paymentMethod,
  tenantId,
  branchId,
  cashierId
}: CheckoutParams): Promise<{ success: boolean; offlineId: string }> {
  
  // 1. Generate UUID v4 yang sama untuk Lokal dan Cloud
  const offlineId = crypto.randomUUID();
  const now = new Date().toISOString();

  const localTx = {
    offline_id: offlineId,
    tenant_id: tenantId,    // BARU (Wajib untuk DB Cloud)
    branch_id: branchId,    // BARU (Wajib untuk DB Cloud)
    cashier_id: cashierId,  // BARU (Wajib untuk DB Cloud)
    total_amount: totalAmount,
    payment_method: paymentMethod,
    is_synced: 0,
    created_at: now
  };

  const localItems = items.map(item => ({
    id: crypto.randomUUID(),
    transaction_id: offlineId,
    product_id: item.id,
    qty: item.cartQty,
    unit_price: item.branch_price,
    subtotal: item.subtotal
  }));

  // 2. Cek apakah device terhubung ke internet
  if (navigator.onLine) {
    try {
      // BISA DIBUAT API ROUTE: Lebih aman jika Supabase dipanggil via Next.js API Route (/api/v1/transactions)
      // Di sini kita contohkan insert langsung dengan asumsi Row Level Security (RLS) sudah diatur.
      
      const { error: txError } = await supabase
        .from('transactions')
        .insert({
          offline_id: offlineId,
          tenant_id: tenantId,
          branch_id: branchId,
          cashier_id: cashierId,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          is_synced: true // Langsung true karena berhasil ke cloud
        });

      if (txError) throw txError;

      // Insert detail barang (Basket Logging / ML Ready)
      const cloudItems = items.map(item => ({
        transaction_id: offlineId, // Perlu dicocokkan dengan ID transaksi yang baru di-insert
        product_id: item.id,
        qty: item.cartQty,
        unit_price: item.branch_price,
        subtotal: item.subtotal
      }));

      const { error: itemError } = await supabase
        .from('transaction_items')
        .insert(cloudItems);

      if (itemError) throw itemError;

      return { success: true, offlineId };

    } catch (error) {
      console.warn("Koneksi online gagal, masuk ke mode offline fallback.", error);
      // JANGAN RETURN ERROR! Biarkan kode lanjut ke blok IndexedDB (Offline) di bawah
    }
  }

  // 3. OFFLINE FALLBACK: Simpan ke IndexedDB (Dexie) jika tidak ada internet atau Supabase gagal
  try {
    await db.transaction('rw', db.transactions, db.transaction_items, async () => {
      await db.transactions.add(localTx);
      await db.transaction_items.bulkAdd(localItems);
    });
    
    console.log("Tersimpan di antrean offline (Dexie)");
    return { success: true, offlineId };
  } catch (error) {
    console.error("Gagal menyimpan ke database lokal", error);
    return { success: false, offlineId: '' };
  }
}