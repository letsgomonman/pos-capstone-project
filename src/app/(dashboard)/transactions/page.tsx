'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Search, Eye, X, Receipt, CheckCircle, AlertCircle, FileText, Trash2, Calculator, CreditCard, Banknote, PieChart, User } from 'lucide-react';

// Tipe data transaksi
interface TransactionItem {
  id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  subtotal: number;
  products: { name: string; sku: string };
}

interface Transaction {
  id: string;
  offline_id: string;
  created_at: string;
  total_amount: number;
  discount_amount: number; 
  order_note: string | null;      
  payment_method: string;
  is_synced: boolean;
  is_void: boolean;
  cashier: { name: string };
  // Data pelanggan transaksi
  customers: { name: string; phone: string } | null;
  transaction_items: TransactionItem[];
}

export default function TransactionsPage() {
  const { session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!session?.tenantId) return;

      try {
        let query = supabase
          .from('transactions')
          .select(`
            id, 
            offline_id, 
            created_at, 
            total_amount, 
            discount_amount,
            order_note,
            payment_method, 
            is_synced, 
            is_void,
            cashier:users!transactions_cashier_id_fkey (name),
            customers (name, phone), 
            transaction_items (
              id, product_id, qty, unit_price, subtotal,
              products (name, sku)
            )
          `)
          .eq('tenant_id', session.tenantId)
          .order('created_at', { ascending: false });

        if (session.role === 'manager') {
          query = query.eq('branch_id', session.branchId);
        }

        const { data, error } = await query;
        if (error) throw error;
        setTransactions(data as unknown as Transaction[]);
      } catch (error) {
        console.error("Gagal memuat transaksi:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, [session]);

  const handleVoidTransaction = async (txId: string) => {
    if (!session?.userId || !selectedTx) return;
    
    const confirmVoid = window.confirm("YAKIN BATALKAN TRANSAKSI? \n\nOmzet akan dibatalkan, STOK BARANG AKAN DIKEMBALIKAN, dan Jurnal Akuntansi (SAK EMKM) akan dibalik secara otomatis.");
    if (!confirmVoid) return;

    setIsVoiding(true);
    try {
      // Status pembatalan transaksi
      const { error } = await supabase
        .from('transactions')
        .update({ 
          is_void: true,
          voided_by: session.userId 
        })
        .eq('id', txId);

      if (error) throw error;

      // Pemulihan stok dan perhitungan HPP
      let totalCOGS = 0; // Total HPP untuk jurnal pembalik.
      for (const item of selectedTx.transaction_items) {
        // Perhitungan HPP produk
        const { data: prod } = await supabase.from('products').select('base_price').eq('id', item.product_id).single();
        const basePrice = prod?.base_price || 0;
        totalCOGS += (basePrice * item.qty);

        const { data: currentInv } = await supabase
          .from('branch_inventory')
          .select('id, stock_qty')
          .eq('branch_id', session.branchId)
          .eq('product_id', item.product_id)
          .single();

        if (currentInv) {
          await supabase
            .from('branch_inventory')
            .update({ stock_qty: currentInv.stock_qty + item.qty })
            .eq('id', currentInv.id);
        }
      }

      // Jurnal pembalik SAK EMKM
      try {
         // Pemetaan akun buku besar
         const { data: accounts } = await supabase
           .from('chart_of_accounts')
           .select('id, account_code')
           .eq('tenant_id', session.tenantId);
           
         if (accounts && accounts.length > 0) {
           const accMap = accounts.reduce((acc, curr) => {
             acc[curr.account_code] = curr.id;
             return acc;
           }, {} as Record<string, string>);

           // Akun untuk jurnal pembalik
           const assetAccountId = selectedTx.payment_method === 'cash' ? accMap['111'] : accMap['112']; 
           const revenueAccountId = accMap['411']; 
           const inventoryAccountId = accMap['114']; 
           const cogsAccountId = accMap['511']; 

           if (assetAccountId && revenueAccountId && inventoryAccountId && cogsAccountId) {
             
             // Header jurnal pembalik
             const { data: journal, error: journalErr } = await supabase
               .from('journals')
               .insert({
                 tenant_id: session.tenantId,
                 branch_id: session.branchId,
                 reference_type: 'VOID_TRANSACTION',
                 reference_id: txId,
                 description: `Pembatalan POS - Referensi ID: ${selectedTx.offline_id.split('-')[0]}`,
                 created_by: session.userId
               })
               .select().single();

             if (!journalErr && journal) {
               // Baris jurnal pembalik
               const journalLines = [];
               
               // Pembalikan kas dan pendapatan
               if (selectedTx.total_amount > 0) {
                   journalLines.push(
                       { journal_id: journal.id, account_id: revenueAccountId, debit: selectedTx.total_amount, credit: 0 },
                       { journal_id: journal.id, account_id: assetAccountId, debit: 0, credit: selectedTx.total_amount }
                   );
               }
               
               // Pembalikan HPP dan persediaan
               if (totalCOGS > 0) {
                   journalLines.push(
                       { journal_id: journal.id, account_id: inventoryAccountId, debit: totalCOGS, credit: 0 },
                       { journal_id: journal.id, account_id: cogsAccountId, debit: 0, credit: totalCOGS }
                   );
               }
               
               if (journalLines.length > 0) {
                   await supabase.from('journal_lines').insert(journalLines);
               }
             }
           }
         }
      } catch (accErr) {
        console.error("Gagal melakukan jurnal pembalik:", accErr);
      }
      setTransactions(prev => prev.map(tx => tx.id === txId ? { ...tx, is_void: true } : tx));
      setSelectedTx(prev => prev ? { ...prev, is_void: true } : null);
      
      // Penyegaran tampilan kasir dan inventaris
      window.dispatchEvent(new Event('refreshProductGrid'));
      alert("Transaksi berhasil dibatalkan. Stok dan Jurnal Akuntansi telah dikembalikan.");
      
    } catch (error: unknown) {
      console.error("Gagal membatalkan transaksi:", error);
      alert("Terjadi kesalahan sistem saat membatalkan transaksi.");
    } finally {
      setIsVoiding(false);
    }
  };

  const validTx = transactions.filter(tx => !tx.is_void);
  const totalValidCount = validTx.length;
  const totalRevenue = validTx.reduce((sum, tx) => sum + tx.total_amount, 0);
  
  const averageOrderValue = totalValidCount > 0 ? totalRevenue / totalValidCount : 0;
  
  const qrisCount = validTx.filter(tx => tx.payment_method.toLowerCase() === 'qris').length;
  const cashCount = validTx.filter(tx => tx.payment_method.toLowerCase() === 'cash').length;
  const qrisPercentage = totalValidCount > 0 ? Math.round((qrisCount / totalValidCount) * 100) : 0;
  const cashPercentage = totalValidCount > 0 ? Math.round((cashCount / totalValidCount) * 100) : 0;

  // Filter pencarian transaksi
  const filteredTx = transactions.filter(tx => 
    tx.offline_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tx.cashier?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tx.customers?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Laporan Transaksi</h1>
          <p className="text-gray-500 mt-1">Pantau riwayat penjualan, audit struk Kasir, dan metrik pesanan rata-rata.</p>
        </div>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Receipt size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Total Struk Sukses</p>
              <h3 className="text-2xl font-bold text-gray-900">{totalValidCount}</h3>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg"><Calculator size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Rata-Rata Nilai Struk (AOV)</p>
              <h3 className="text-2xl font-bold text-gray-900">Rp {averageOrderValue.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg"><PieChart size={24} /></div>
            <div className="w-full">
              <p className="text-sm font-medium text-gray-500 mb-2">Preferensi Pembayaran</p>
              <div className="flex justify-between items-center text-sm font-bold text-gray-800 mb-1">
                <span className="flex items-center gap-1"><CreditCard size={14} className="text-blue-500"/> QRIS ({qrisPercentage}%)</span>
                <span className="flex items-center gap-1"><Banknote size={14} className="text-green-500"/> Tunai ({cashPercentage}%)</span>
              </div>
              <div className="w-full h-2 bg-green-200 rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500" style={{ width: `${qrisPercentage}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex items-center gap-3">
        <Search className="text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Cari No. Struk, Nama Kasir, atau Pelanggan..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full focus:outline-none text-gray-900 bg-transparent"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 font-semibold">Tanggal</th>
                <th className="p-4 font-semibold">No. Struk (ID)</th>
                <th className="p-4 font-semibold">Pelanggan</th>
                <th className="p-4 font-semibold">Kasir</th>
                <th className="p-4 font-semibold">Total</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">Memuat riwayat transaksi...</td>
                </tr>
              ) : filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500 flex flex-col items-center">
                    <Receipt size={32} className="mb-2 text-gray-300" />
                    Belum ada transaksi tercatat.
                  </td>
                </tr>
              ) : (
                filteredTx.map((tx) => (
                  <tr key={tx.id} className={`transition ${tx.is_void ? 'bg-red-50/50 opacity-75' : 'hover:bg-gray-50'}`}>
                    <td className="p-4 text-sm text-gray-600">
                      {new Date(tx.created_at).toLocaleString('id-ID', { 
                        timeZone: 'Asia/Jakarta', 
                        day: 'numeric', 
                        month: 'short', 
                        year: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </td>
                    <td className="p-4 font-mono text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <span className={tx.is_void ? 'line-through' : ''}>
                          {tx.offline_id ? tx.offline_id.split('-')[0].toUpperCase() : 'N/A'}...
                        </span>
                        {tx.order_note && (
                          <span title="Ada Catatan Pesanan">
                            <FileText size={14} className="text-blue-500" />
                          </span>
                        )}
                      </div>
                    </td>
                    
                    {/* Kolom pelanggan transaksi */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-gray-400" />
                        <div>
                          <div className="font-medium text-gray-900">{tx.customers?.name || 'Umum'}</div>
                          {tx.customers?.phone && <div className="text-xs text-gray-500">{tx.customers.phone}</div>}
                        </div>
                      </div>
                    </td>

                    <td className="p-4 font-medium text-gray-900">{tx.cashier?.name || 'Anonim'}</td>
                    <td className="p-4 font-bold text-gray-900">
                      Rp {tx.total_amount.toLocaleString('id-ID')}
                    </td>
                    <td className="p-4">
                      {tx.is_void ? (
                        <span className="flex items-center w-fit gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold"><AlertCircle size={12}/> Dibatalkan</span>
                      ) : (
                        <span className="flex items-center w-fit gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold"><CheckCircle size={12}/> Sukses</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => setSelectedTx(tx)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition bg-white border shadow-sm"
                        title="Lihat Detail Struk"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b bg-gray-50 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Receipt size={20} className="text-blue-600"/> Detail Struk
              </h2>
              <button onClick={() => setSelectedTx(null)} className="text-gray-400 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 relative">
              {/* Watermark transaksi dibatalkan */}
              {selectedTx.is_void && (
                <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none opacity-40 rotate-[-30deg]">
                  <span className="text-6xl font-black text-red-600 border-8 border-red-600 p-4 rounded-xl shadow-sm">BATAL</span>
                </div>
              )}

              <div className="text-center mb-6 border-b pb-4 border-dashed relative z-10">
                <h3 className="font-bold text-xl text-gray-900">Toko Capstone</h3>
                <p className="text-sm text-gray-500">{new Date(selectedTx.created_at).toLocaleString('id-ID')}</p>
                <p className="text-xs font-mono text-gray-400 mt-2">ID: {selectedTx.offline_id}</p>
                
                {/* Informasi kasir dan pelanggan struk */}
                <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-600 flex flex-col gap-1">
                  <p className="flex justify-between"><span>Kasir:</span> <span className="font-semibold">{selectedTx.cashier?.name}</span></p>
                  <p className="flex justify-between">
                    <span>Pelanggan:</span> 
                    <span className="font-semibold text-right">
                      {selectedTx.customers?.name || 'Umum'}
                      {selectedTx.customers?.phone && <span className="block text-xs font-normal text-gray-500">{selectedTx.customers.phone}</span>}
                    </span>
                  </p>
                </div>
              </div>

              {selectedTx.order_note && (
                <div className="mb-4 bg-yellow-50 p-3 rounded-lg border border-yellow-200 relative z-10">
                  <p className="text-xs font-bold text-yellow-800 mb-1 flex items-center gap-1">
                    <FileText size={12} /> CATATAN KASIR:
                  </p>
                  <p className="text-sm text-gray-800 italic">&quot;{selectedTx.order_note}&quot;</p>
                </div>
              )}

              <div className="space-y-3 mb-6 relative z-10">
                {selectedTx.transaction_items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div>
                      <p className="font-semibold text-gray-900">{item.products?.name}</p>
                      <p className="text-gray-500">{item.qty} x Rp {item.unit_price.toLocaleString('id-ID')}</p>
                    </div>
                    <p className="font-bold text-gray-900">Rp {item.subtotal.toLocaleString('id-ID')}</p>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 relative z-10">
                <div className="space-y-1 mb-3 text-sm">
                   <div className="flex justify-between text-gray-600">
                      <span>Subtotal Harga</span>
                      <span>Rp {(selectedTx.total_amount + selectedTx.discount_amount).toLocaleString('id-ID')}</span>
                   </div>
                   {selectedTx.discount_amount > 0 && (
                       <div className="flex justify-between text-red-500 font-medium">
                          <span>Potongan Diskon</span>
                          <span>- Rp {selectedTx.discount_amount.toLocaleString('id-ID')}</span>
                       </div>
                   )}
                </div>

                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Metode Bayar</span>
                  <span className="font-medium text-gray-900 uppercase">{selectedTx.payment_method}</span>
                </div>
                <div className="flex justify-between items-center text-lg mt-2 pt-2 border-t">
                  <span className="font-bold text-gray-900">Grand Total</span>
                  <span className={`font-bold ${selectedTx.is_void ? 'text-red-500 line-through' : 'text-blue-600'}`}>
                    Rp {selectedTx.total_amount.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t bg-gray-50 shrink-0 flex gap-2">
              {!selectedTx.is_void && (
                <button 
                  onClick={() => handleVoidTransaction(selectedTx.id)}
                  disabled={isVoiding}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-100 text-red-700 font-bold p-3 rounded-lg hover:bg-red-200 disabled:opacity-50 transition"
                >
                  <Trash2 size={18} />
                  {isVoiding ? 'Memproses...' : 'Batalkan Transaksi'}
                </button>
              )}
              
              <button 
                onClick={() => setSelectedTx(null)}
                className="flex-1 bg-gray-800 text-white font-bold p-3 rounded-lg hover:bg-gray-900 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}