'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Search, Eye, X, Receipt, CheckCircle, Clock } from 'lucide-react';

// --- TIPE DATA ---
interface TransactionItem {
  id: string;
  qty: number;
  unit_price: number;
  subtotal: number;
  products: {
    name: string;
    sku: string;
  };
}

interface Transaction {
  id: string;
  offline_id: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  is_synced: boolean;
  cashier: { name: string } | null;
  transaction_items: TransactionItem[];
}

export default function TransactionsReportPage() {
  const { session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // State untuk Modal Detail Struk
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  useEffect(() => {
    const fetchTransactions = async () => {
      if (!session?.tenantId) return;

      try {
        // Mengambil transaksi + Item Keranjang + Relasi Nama Kasir
        const { data, error } = await supabase
          .from('transactions')
          .select(`
            id, offline_id, created_at, total_amount, payment_method, is_synced,
            cashier:users!transactions_cashier_id_fkey(name),
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
        console.error('Error fetching transactions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
  }, [session?.tenantId]);

  // Filter pencarian berdasarkan ID Struk atau Nama Kasir
  const filteredTx = transactions.filter(tx => 
    tx.offline_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tx.cashier?.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Laporan Transaksi</h1>
        <p className="text-gray-500 mt-1">Pantau riwayat penjualan dan detail struk Kasir.</p>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex items-center gap-3">
        <Search className="text-gray-400" size={20} />
        <input 
          type="text" 
          placeholder="Cari berdasarkan No. Struk atau Nama Kasir..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full focus:outline-none text-gray-900 bg-transparent"
        />
      </div>

      {/* Tabel Transaksi */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 font-semibold">Waktu / No. Struk</th>
                <th className="p-4 font-semibold">Kasir</th>
                <th className="p-4 font-semibold">Total Nilai</th>
                <th className="p-4 font-semibold">Metode</th>
                <th className="p-4 font-semibold">Status Sync</th>
                <th className="p-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">Memuat data transaksi...</td>
                </tr>
              ) : filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 flex flex-col items-center">
                    <Receipt size={32} className="mb-2 text-gray-300" />
                    Belum ada transaksi.
                  </td>
                </tr>
              ) : (
                filteredTx.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition">
                    <td className="p-4">
                      <div className="text-gray-900 font-medium">{formatDate(tx.created_at)}</div>
                      <div className="text-xs text-gray-500 font-mono mt-1" title="ID Offline PWA">
                        {tx.offline_id?.split('-')[0]}...
                      </div>
                    </td>
                    <td className="p-4 text-gray-800">{tx.cashier?.name || 'Anonim'}</td>
                    <td className="p-4 font-bold text-blue-600">
                      Rp {tx.total_amount.toLocaleString('id-ID')}
                    </td>
                    <td className="p-4 text-gray-600 uppercase text-sm font-medium">
                      {tx.payment_method}
                    </td>
                    <td className="p-4">
                      {tx.is_synced ? (
                        <span className="flex items-center gap-1 text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded-full w-max">
                          <CheckCircle size={12} /> Tersinkron
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-orange-600 text-xs font-bold bg-orange-50 px-2 py-1 rounded-full w-max">
                          <Clock size={12} /> Menunggu
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => setSelectedTx(tx)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
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

      {/* --- MODAL DETAIL STRUK --- */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b bg-gray-50 shrink-0">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Receipt size={20} className="text-blue-600" /> Detail Struk
              </h2>
              <button onClick={() => setSelectedTx(null)} className="text-gray-400 hover:text-gray-700 transition">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="text-center mb-6">
                <h3 className="font-bold text-xl text-gray-800">Toko Capstone</h3>
                <p className="text-sm text-gray-500">{formatDate(selectedTx.created_at)}</p>
                <p className="text-xs text-gray-400 font-mono mt-1">ID: {selectedTx.offline_id}</p>
                <p className="text-sm text-gray-600 mt-2">Kasir: {selectedTx.cashier?.name}</p>
              </div>

              <div className="border-t border-dashed border-gray-300 py-4 mb-4">
                {selectedTx.transaction_items.map(item => (
                  <div key={item.id} className="flex justify-between items-start mb-3 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{item.products?.name}</p>
                      <p className="text-gray-500">{item.qty} x Rp {item.unit_price.toLocaleString('id-ID')}</p>
                    </div>
                    <p className="font-bold text-gray-900">
                      Rp {item.subtotal.toLocaleString('id-ID')}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-300 pt-4">
                <div className="flex justify-between items-center text-lg font-bold text-gray-900">
                  <span>TOTAL</span>
                  <span className="text-blue-600">Rp {selectedTx.total_amount.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium text-gray-500 mt-2">
                  <span>Metode Pembayaran</span>
                  <span className="uppercase">{selectedTx.payment_method}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 shrink-0">
              <button 
                onClick={() => setSelectedTx(null)} 
                className="w-full bg-gray-800 text-white font-bold p-3 rounded-lg hover:bg-gray-900 transition"
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