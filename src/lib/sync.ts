import { db } from './dexie';
import { supabase } from './supabase';

export async function syncOfflineTransactions() {
  // Validasi koneksi internet
  if (!navigator.onLine) return;

  try {
    // Ambil transaksi yang belum disinkronkan dari database lokal
    const pendingTxs = await db.transactions.where('is_synced').equals(0).toArray();
    
    if (pendingTxs.length === 0) return;
    
    console.log(`Memulai sinkronisasi ${pendingTxs.length} transaksi offline beserta jurnal keuangan...`);

    // Proses setiap transaksi secara terpisah
    for (const tx of pendingTxs) {
      try {
        let customerId = null;

        // 0. PERBAIKAN: Proses CRM (Data Pelanggan) yang tertunda saat offline
        if (tx.customer_phone || tx.customer_name) {
          let existingCust = null;

          if (tx.customer_phone) {
            const { data } = await supabase
              .from('customers')
              .select('id, total_orders, total_spend')
              .eq('phone', tx.customer_phone)
              .eq('tenant_id', tx.tenant_id)
              .single();
            existingCust = data;
          }

          if (existingCust) {
            customerId = existingCust.id;
            await supabase.from('customers')
              .update({
                total_orders: existingCust.total_orders + 1,
                total_spend: Number(existingCust.total_spend) + tx.total_amount,
                last_purchase_date: tx.created_at // Jaga kronologi
              })
              .eq('id', customerId);
          } else {
            const { data: newCust } = await supabase
              .from('customers')
              .insert({
                tenant_id: tx.tenant_id,
                name: tx.customer_name || 'Pelanggan Member',
                phone: tx.customer_phone || null,
                total_orders: 1,
                total_spend: tx.total_amount,
                last_purchase_date: tx.created_at
              })
              .select().single();
            if (newCust) customerId = newCust.id;
          }
        }

        // Ambil item transaksi dari database lokal (Sekarang data ini sudah pasti ADA karena perbaikan checkout)
        const localItems = await db.transaction_items
          .where('transaction_id')
          .equals(tx.offline_id)
          .toArray();

        // 1. Kirim data transaksi utama (beserta customer_id) ke Supabase 
        const { data: cloudTx, error: txError } = await supabase.from('transactions').insert({
          offline_id: tx.offline_id,
          tenant_id: tx.tenant_id,
          branch_id: tx.branch_id,
          cashier_id: tx.cashier_id,
          customer_id: customerId, // Relasi ke pelanggan yang baru dibuat/diperbarui di atas
          total_amount: tx.total_amount,
          discount_amount: tx.discount_amount || 0,
          order_note: tx.order_note || null,
          payment_method: tx.payment_method,
          is_synced: true,
          created_at: tx.created_at 
        }).select().single();

        if (txError) throw txError;

        // 2. Format dan kirim item transaksi menggunakan UUID dari Cloud
        if (localItems.length > 0) {
            const cloudItems = localItems.map(item => ({
              transaction_id: cloudTx.id,
              product_id: item.product_id,
              qty: item.qty,
              unit_price: item.unit_price,
              subtotal: item.subtotal
            }));

            const { error: itemError } = await supabase.from('transaction_items').insert(cloudItems);
            if (itemError) throw itemError;
        }

        // 3. Buat Jurnal Otomatis Akuntansi (SAK EMKM) untuk transaksi Offline
        try {
          const { data: accounts } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code')
            .eq('tenant_id', tx.tenant_id);

          if (accounts && accounts.length > 0) {
            const accMap = accounts.reduce((acc, curr) => {
              acc[curr.account_code] = curr.id;
              return acc;
            }, {} as Record<string, string>);

            const assetAccountId = tx.payment_method === 'cash' ? accMap['111'] : accMap['112']; 
            const revenueAccountId = accMap['411']; 
            const inventoryAccountId = accMap['114']; 
            const cogsAccountId = accMap['511']; 

            if (assetAccountId && revenueAccountId && inventoryAccountId && cogsAccountId) {
              
              let totalCOGS = 0;
              for (const item of localItems) {
                const { data: prod } = await supabase
                  .from('products')
                  .select('base_price')
                  .eq('id', item.product_id)
                  .single();
                
                const basePrice = prod?.base_price || 0;
                totalCOGS += (basePrice * item.qty);
              }

              // Header jurnal (Tanggal disesuaikan dengan waktu transaksi offline)
              const { data: journal, error: journalErr } = await supabase
                .from('journals')
                .insert({
                  tenant_id: tx.tenant_id,
                  branch_id: tx.branch_id,
                  reference_type: 'POS_TRANSACTION',
                  reference_id: cloudTx.id,
                  description: `Penjualan POS (Sinkronisasi Offline) - ID: ${tx.offline_id.split('-')[0]}`,
                  created_by: tx.cashier_id,
                  created_at: tx.created_at // Kunci menjaga kronologi keuangan
                })
                .select().single();

              if (!journalErr && journal) {
                const journalLines = [];
                
                if (tx.total_amount > 0) {
                    journalLines.push(
                        { journal_id: journal.id, account_id: assetAccountId, debit: tx.total_amount, credit: 0 },
                        { journal_id: journal.id, account_id: revenueAccountId, debit: 0, credit: tx.total_amount }
                    );
                }
                
                if (totalCOGS > 0) {
                    journalLines.push(
                        { journal_id: journal.id, account_id: cogsAccountId, debit: totalCOGS, credit: 0 },
                        { journal_id: journal.id, account_id: inventoryAccountId, debit: 0, credit: totalCOGS }
                    );
                }
                
                if (journalLines.length > 0) {
                    await supabase.from('journal_lines').insert(journalLines);
                }
              }
            }
          }
        } catch (accErr) {
          console.error(`Gagal mencatat jurnal akuntansi untuk TX Offline ${tx.offline_id}:`, accErr);
        }

        // 4. Tandai transaksi lokal sebagai tersinkronisasi
        await db.transactions.update(tx.offline_id, { is_synced: 1 });
        console.log(`✅ Transaksi ${tx.offline_id} beserta Pelanggan & Barang berhasil disinkronisasi.`);

      } catch (err) {
        console.error(`❌ Gagal sinkronisasi transaksi ${tx.offline_id}:`, err);
        // Lanjutkan ke transaksi berikutnya jika transaksi ini gagal
      }
    }
  } catch (error) {
    console.error("Kesalahan membaca database lokal:", error);
  }
}