import { db } from './dexie';
import { supabase } from './supabase';
import { CartItem } from '@/hooks/useCartStore';

interface CheckoutPayload {
  items: CartItem[];
  totalAmount: number;
  paymentMethod: string;
  tenantId: string;
  branchId: string;
  cashierId: string;
  customerName?: string;
  customerPhone?: string;
  discountAmount: number; 
  orderNote: string;
}

// Helper: Membatasi waktu tunggu (timeout) agar aplikasi tidak hang saat internet lambat/putus
const withTimeout = <T>(promise: Promise<T>, ms = 4000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Request Timeout")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

export async function processCheckout(payload: CheckoutPayload) {
  const offlineId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  let customerId = null;

  try {
    // 1. CRM pelanggan online (Dibungkus Timeout 3 Detik)
    if (navigator.onLine && (payload.customerPhone || payload.customerName)) {
      try {
        await withTimeout((async () => {
          let existingCust = null;

          if (payload.customerPhone) {
            const { data } = await supabase
              .from('customers')
              .select('id, total_orders, total_spend')
              .eq('phone', payload.customerPhone)
              .eq('tenant_id', payload.tenantId)
              .single();
            existingCust = data;
          }

          if (existingCust) {
            customerId = existingCust.id;
            await supabase.from('customers')
              .update({
                total_orders: existingCust.total_orders + 1,
                total_spend: Number(existingCust.total_spend) + payload.totalAmount,
                last_purchase_date: new Date().toISOString()
              })
              .eq('id', customerId);
          } else {
            const { data: newCust } = await supabase
              .from('customers')
              .insert({
                tenant_id: payload.tenantId,
                name: payload.customerName || 'Pelanggan Member',
                phone: payload.customerPhone || null,
                total_orders: 1,
                total_spend: payload.totalAmount,
                last_purchase_date: new Date().toISOString()
              })
              .select().single();
            
            if (newCust) customerId = newCust.id;
          }
        })(), 3000);
      } catch (crmErr) {
        console.warn("CRM Timeout: Internet lambat, mengabaikan poin pelanggan sementara.", crmErr);
      }
    }

    // 2. Simpan transaksi LOKAL secara aman (Inti dari Offline-First)
    await db.transactions.add({
      offline_id: offlineId,
      tenant_id: payload.tenantId,    
      branch_id: payload.branchId,    
      cashier_id: payload.cashierId,
      customer_name: payload.customerName,
      customer_phone: payload.customerPhone,
      total_amount: payload.totalAmount,
      discount_amount: payload.discountAmount,
      order_note: payload.orderNote,
      payment_method: payload.paymentMethod,
      is_synced: 0,
      created_at: new Date().toISOString(),
    });

    const localTxItems = payload.items.map(item => ({
      id: `ITEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      transaction_id: offlineId,
      product_id: item.id,
      qty: item.cartQty,
      unit_price: item.branch_price,
      subtotal: item.subtotal
    }));
    await db.transaction_items.bulkAdd(localTxItems);

    // 3. Sinkronisasi CLOUD otomatis (Dibungkus Timeout 5 Detik)
    if (navigator.onLine) {
      try {
        await withTimeout((async () => {
          const { data: tx, error: txErr } = await supabase
            .from('transactions')
            .insert({
              offline_id: offlineId,
              tenant_id: payload.tenantId,
              branch_id: payload.branchId,
              cashier_id: payload.cashierId,
              customer_id: customerId, 
              total_amount: payload.totalAmount,
              discount_amount: payload.discountAmount, 
              order_note: payload.orderNote,
              payment_method: payload.paymentMethod,
              is_synced: true
            })
            .select().single();

          if (txErr) throw txErr;

          const txItems = payload.items.map(item => ({
            transaction_id: tx.id,
            product_id: item.id,
            qty: item.cartQty,
            unit_price: item.branch_price,
            subtotal: item.subtotal
          }));

          await supabase.from('transaction_items').insert(txItems);
          
          await db.transactions.where('offline_id').equals(offlineId).modify({ is_synced: 1 });

          // Jurnal Akuntansi 
          try {
            const { data: accounts } = await supabase
              .from('chart_of_accounts')
              .select('id, account_code, tenant_id')
              .eq('tenant_id', payload.tenantId);

            if (accounts && accounts.length > 0) {
              const accMap = accounts.reduce((acc, curr) => {
                acc[curr.account_code] = curr.id;
                return acc;
              }, {} as Record<string, string>);

              const assetAccountId = payload.paymentMethod === 'cash' ? accMap['111'] : accMap['112']; 
              const revenueAccountId = accMap['411']; 
              const inventoryAccountId = accMap['114']; 
              const cogsAccountId = accMap['511']; 

              if (assetAccountId && revenueAccountId && inventoryAccountId && cogsAccountId) {
                let totalCOGS = 0;
                for (const item of payload.items) {
                   const { data: prod } = await supabase.from('products').select('base_price').eq('id', item.id).single();
                   const basePrice = prod?.base_price || 0;
                   totalCOGS += (basePrice * item.cartQty);
                }

                const { data: journal, error: journalErr } = await supabase
                  .from('journals')
                  .insert({
                    tenant_id: payload.tenantId,
                    branch_id: payload.branchId,
                    reference_type: 'POS_TRANSACTION',
                    reference_id: tx.id,
                    description: `Penjualan POS - ID: ${offlineId.split('-')[0]}`,
                    created_by: payload.cashierId
                  })
                  .select().single();

                if (!journalErr && journal) {
                  const journalLines = [];
                  if (payload.totalAmount > 0) {
                      journalLines.push(
                          { journal_id: journal.id, account_id: assetAccountId, debit: payload.totalAmount, credit: 0 },
                          { journal_id: journal.id, account_id: revenueAccountId, debit: 0, credit: payload.totalAmount }
                      );
                  }
                  if (totalCOGS > 0) {
                      journalLines.push(
                          { journal_id: journal.id, account_id: cogsAccountId, debit: totalCOGS, credit: 0 },
                          { journal_id: journal.id, account_id: inventoryAccountId, debit: 0, credit: totalCOGS }
                      );
                  }
                  if (journalLines.length > 0) await supabase.from('journal_lines').insert(journalLines);
                }
              }
            }
          } catch (accError) {
            console.error("[AKUNTANSI] Gagal mencatat jurnal akuntansi:", accError);
          }
        })(), 5000);
      } catch (syncErr) {
        console.warn("Sync Timeout: Koneksi internet tersendat. Transaksi aman tersimpan secara Offline.", syncErr);
      }
    }

    // Selalu kembalikan "Sukses" karena transaksi LOKAL sudah berhasil dieksekusi di awal
    return { success: true, offlineId };
  } catch (error) {
    console.error("Checkout FATAL Error:", error);
    return { success: false, offlineId };
  }
}