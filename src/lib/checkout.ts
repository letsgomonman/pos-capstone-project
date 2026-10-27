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

export async function processCheckout(payload: CheckoutPayload) {
  const offlineId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  let customerId = null;

  try {
    // CRM pelanggan online
    if (navigator.onLine && (payload.customerPhone || payload.customerName)) {
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
    }

    // Simpan header transaksi lokal (offline-first)
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

    // Simpan rincian barang transaksi lokal
    const localTxItems = payload.items.map(item => ({
      id: `ITEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      transaction_id: offlineId,
      product_id: item.id,
      qty: item.cartQty,
      unit_price: item.branch_price,
      subtotal: item.subtotal
    }));
    await db.transaction_items.bulkAdd(localTxItems);

    // Sinkronkan transaksi ke cloud saat online
    if (navigator.onLine) {
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
       
       // Tandai transaksi lokal sebagai tersinkronisasi
       await db.transactions.where('offline_id').equals(offlineId).modify({ is_synced: 1 });

       // Buat jurnal akuntansi otomatis (SAK EMKM)
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
                const { data: prod } = await supabase
                  .from('products')
                  .select('base_price')
                  .eq('id', item.id)
                  .single();
                
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
               
               if (journalLines.length > 0) {
                   await supabase.from('journal_lines').insert(journalLines);
               }
             }
           }
         }
       } catch (accError) {
         console.error("[AKUNTANSI] FATAL ERROR Gagal mencatat jurnal akuntansi:", accError);
       }
    }

    return { success: true, offlineId };
  } catch (error) {
    console.error("Checkout Error:", error);
    return { success: false, offlineId };
  }
}