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
    // --- 1. CRM & ML-READY LOGIC (PERBAIKAN) ---
    // Proses jika Kasir online DAN (ada No HP ATAU ada Nama)
    if (navigator.onLine && (payload.customerPhone || payload.customerName)) {
      
      let existingCust = null;

      // Hanya cari pelanggan lama jika No HP diisi
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
        // Pelanggan Lama: Update RFM Metrics
        customerId = existingCust.id;
        await supabase.from('customers')
          .update({
            total_orders: existingCust.total_orders + 1,
            total_spend: Number(existingCust.total_spend) + payload.totalAmount,
            last_purchase_date: new Date().toISOString()
          })
          .eq('id', customerId);
      } else {
        // Pelanggan Baru (Dari No HP baru, ATAU hanya input Nama saja)
        const { data: newCust } = await supabase
          .from('customers')
          .insert({
            tenant_id: payload.tenantId,
            name: payload.customerName || 'Pelanggan Member',
            phone: payload.customerPhone || null, // Biarkan null jika tidak ada no HP
            total_orders: 1,
            total_spend: payload.totalAmount,
            last_purchase_date: new Date().toISOString()
          })
          .select().single();
        
        if (newCust) customerId = newCust.id;
      }
    }

    // --- 2. SIMPAN KE LOKAL (Offline-First) ---
    await db.transactions.add({
      offline_id: offlineId,
      tenant_id: payload.tenantId,    
      branch_id: payload.branchId,    
      cashier_id: payload.cashierId,  
      total_amount: payload.totalAmount,
      discount_amount: payload.discountAmount,
      order_note: payload.orderNote,
      payment_method: payload.paymentMethod,
      is_synced: 0,
      created_at: new Date().toISOString(),
    });

    // --- 3. SIMPAN KE CLOUD (Jika Online) ---
    if (navigator.onLine) {
       const { data: tx, error: txErr } = await supabase
         .from('transactions')
         .insert({
           offline_id: offlineId,
           tenant_id: payload.tenantId,
           branch_id: payload.branchId,
           cashier_id: payload.cashierId,
           customer_id: customerId, // <--- Relasi akan aman sekarang!
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
       
       // Tandai lokal sudah tersinkronisasi
       await db.transactions.where('offline_id').equals(offlineId).modify({ is_synced: 1 });
    }

    return { success: true, offlineId };
  } catch (error) {
    console.error("Checkout Error:", error);
    return { success: false, offlineId };
  }
}