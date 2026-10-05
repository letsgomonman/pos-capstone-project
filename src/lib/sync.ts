import { db } from './dexie';
import { supabase } from './supabase';

export async function syncOfflineTransactions() {
  // 1. Pastikan perangkat sedang terhubung ke internet
  if (!navigator.onLine) return;

  try {
    // 2. Ambil semua transaksi yang belum terkirim
    const pendingTxs = await db.transactions.where('is_synced').equals(0).toArray();
    
    if (pendingTxs.length === 0) return; // Tidak ada yang perlu disinkronisasi
    
    console.log(`Memulai sinkronisasi ${pendingTxs.length} transaksi offline...`);

    // 3. Loop dan kirim satu per satu agar jika gagal sebagian, tidak semuanya batal
    for (const tx of pendingTxs) {
      try {
        // Ambil item/produk dari transaksi ini di Dexie
        const localItems = await db.transaction_items
          .where('transaction_id')
          .equals(tx.offline_id)
          .toArray();

        // Insert Transaksi Utama ke Supabase Cloud
        const { error: txError } = await supabase.from('transactions').insert({
          offline_id: tx.offline_id,
          tenant_id: tx.tenant_id,
          branch_id: tx.branch_id,
          cashier_id: tx.cashier_id,
          total_amount: tx.total_amount,
          payment_method: tx.payment_method,
          is_synced: true,
          created_at: tx.created_at // Pertahankan waktu transaksi asli
        });

        if (txError) throw txError;

        // Format dan Insert Items ke Supabase
        const cloudItems = localItems.map(item => ({
          transaction_id: tx.offline_id,
          product_id: item.product_id,
          qty: item.qty,
          unit_price: item.unit_price,
          subtotal: item.subtotal
        }));

        const { error: itemError } = await supabase.from('transaction_items').insert(cloudItems);
        
        if (itemError) throw itemError;

        // 4. JIKA BERHASIL: Update status di Dexie (Lokal) menjadi synced (1)
        await db.transactions.update(tx.offline_id, { is_synced: 1 });
        console.log(`✅ Transaksi ${tx.offline_id} berhasil disinkronisasi.`);

      } catch (err) {
        console.error(`❌ Gagal sinkronisasi transaksi ${tx.offline_id}:`, err);
        // Lanjut ke transaksi berikutnya tanpa menghentikan loop
      }
    }
  } catch (error) {
    console.error("Kesalahan membaca database lokal:", error);
  }
}