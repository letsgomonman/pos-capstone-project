'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Search, Eye, X, Receipt, CheckCircle, AlertCircle, FileText, Trash2 } from 'lucide-react';

// --- DEFINISI TIPE DATA ---
interface TransactionItem {
  id: string;
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
  transaction_items: TransactionItem[];
}

export default function TransactionsPage() {
  const { session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isVoiding, setIsVoiding] = useState(false); // <--- State baru untuk proses Void

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!session?.tenantId) return;

      try {
        const { data, error } = await supabase
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
            transaction_items (
              id, qty, unit_price, subtotal,
              products (name, sku)
            )
          `)
          .eq('tenant_id', session.tenantId)
          .order('created_at', { ascending: false });

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

  // --- FUNGSI VOID TRANSAKSI ---
  const handleVoidTransaction = async (txId: string) => {
    if (!session?.userId) return;
    
    const confirmVoid = window.confirm("YAKIN BATALKAN TRANSAKSI? \n\nOmzet dari transaksi ini tidak akan dihitung, dan tindakan ini tidak dapat diurungkan.");
    if (!confirmVoid) return;

    setIsVoiding(true);
    try {
      // 1. Update ke Supabase
      const { error } = await supabase
        .from('transactions')
        .update({ 
          is_void: true,
          voided_by: session.userId // Mencatat ID Manajer yang membatalkan
        })
        .eq('id', txId);

      if (error) throw error;

      // 2. Perbarui state lokal secara instan (Optimistic UI)
      setTransactions(prev => prev.map(tx => 
        tx.id === txId ? { ...tx, is_void: true } : tx
      ));
      
      setSelectedTx(prev => prev ? { ...prev, is_void: true } : null);

      alert("Transaksi berhasil dibatalkan (Void).");
    } catch (error: unknown) {
      console.error("Gagal membatalkan transaksi:", error);
      alert("Terjadi kesalahan sistem saat membatalkan transaksi.");
    } finally {
      setIsVoiding(false);
    }
  };

  const filteredTx = transactions.filter(tx => 
    tx.offline_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tx.cashier?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Laporan Transaksi</h1>
          <p className="text-gray-500 mt-1">Pantau riwayat penjualan dan audit struk Kasir.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex items-center gap-3">
        <Search className="text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Cari No. Struk atau Nama Kasir..." 
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
                <th className="p-4 font-semibold">Kasir</th>
                <th className="p-4 font-semibold">Total</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">Memuat riwayat transaksi...</td>
                </tr>
              ) : filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 flex flex-col items-center">
                    <Receipt size={32} className="mb-2 text-gray-300" />
                    Belum ada transaksi tercatat.
                  </td>
                </tr>
              ) : (
                filteredTx.map((tx) => (
                  <tr key={tx.id} className={`transition ${tx.is_void ? 'bg-red-50/50 opacity-75' : 'hover:bg-gray-50'}`}>
                    <td className="p-4 text-sm text-gray-600">
                      {new Date(tx.created_at).toLocaleString('id-ID', { 
                        timeZone: 'Asia/Jakarta', // <--- Memaksa ke Waktu Indonesia Barat
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

      {/* MODAL DETAIL STRUK */}
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
              {/* Tanda Air (Watermark) Jika Dibatalkan */}
              {selectedTx.is_void && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 rotate-[-30deg]">
                  <span className="text-6xl font-black text-red-600 border-8 border-red-600 p-4 rounded-xl">VOIDED</span>
                </div>
              )}

              <div className="text-center mb-6 border-b pb-4 border-dashed relative z-10">
                <h3 className="font-bold text-xl text-gray-900">Toko Capstone</h3>
                <p className="text-sm text-gray-500">{new Date(selectedTx.created_at).toLocaleString('id-ID')}</p>
                <p className="text-xs font-mono text-gray-400 mt-2">ID: {selectedTx.offline_id}</p>
                <p className="text-sm text-gray-600 mt-1">Kasir: <span className="font-semibold">{selectedTx.cashier?.name}</span></p>
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
              {/* Tombol Void: Hanya muncul jika transaksi BERHASIL (belum di-void) */}
              {!selectedTx.is_void && (
                <button 
                  onClick={() => handleVoidTransaction(selectedTx.id)}
                  disabled={isVoiding}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-100 text-red-700 font-bold p-3 rounded-lg hover:bg-red-200 disabled:opacity-50 transition"
                >
                  <Trash2 size={18} />
                  {isVoiding ? 'Memproses...' : 'Void Transaksi'}
                </button>
              )}
              
              <button 
                onClick={() => setSelectedTx(null)}
                className="flex-1 bg-gray-800 text-white font-bold p-3 rounded-lg hover:bg-gray-900 transition"
              >
                Tutup Modal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}