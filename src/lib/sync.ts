import { db } from './dexie';
import { supabase } from './supabase';

export async function syncOfflineTransactions() {
  // Sinkronisasi transaksi offline
  // Validasi koneksi internet
  if (!navigator.onLine) return;

  try {
    // Ambil transaksi yang belum disinkronkan
    const pendingTxs = await db.transactions.where('is_synced').equals(0).toArray();
    
    if (pendingTxs.length === 0) return;
    
    console.log(`Memulai sinkronisasi ${pendingTxs.length} transaksi offline...`);

    // Proses setiap transaksi secara terpisah agar kegagalan tidak menghentikan transaksi lain
    for (const tx of pendingTxs) {
      try {
        // Ambil item transaksi dari database lokal
        const localItems = await db.transaction_items
          .where('transaction_id')
          .equals(tx.offline_id)
          .toArray();

        // Kirim data transaksi utama ke Supabase
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

        // Format dan kirim item transaksi ke Supabase
        const cloudItems = localItems.map(item => ({
          transaction_id: tx.offline_id,
          product_id: item.product_id,
          qty: item.qty,
          unit_price: item.unit_price,
          subtotal: item.subtotal
        }));

        const { error: itemError } = await supabase.from('transaction_items').insert(cloudItems);
        
        if (itemError) throw itemError;

        // Tandai transaksi lokal sebagai tersinkronisasi setelah semua data berhasil dikirim
        await db.transactions.update(tx.offline_id, { is_synced: 1 });
        console.log(`✅ Transaksi ${tx.offline_id} berhasil disinkronisasi.`);

      } catch (err) {
        console.error(`❌ Gagal sinkronisasi transaksi ${tx.offline_id}:`, err);
        // Lanjutkan ke transaksi berikutnya jika transaksi ini gagal
      }
    }
  } catch (error) {
    console.error("Kesalahan membaca database lokal:", error);
  }
}