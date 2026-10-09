'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { ArrowLeftRight, Plus, X, Package, CheckCircle, Truck, FileText, TrendingUp, AlertCircle, BarChart2, Info } from 'lucide-react';

interface TransferItem {
  id: string;
  product_id: string;
  qty: number;
  products: { name: string; sku: string };
}

interface TransferRecord {
  id: string;
  status: 'draft' | 'in_transit' | 'received';
  created_at: string;
  from_branch_id: string;
  to_branch_id: string;
  from_branch: { name: string };
  to_branch: { name: string };
  stock_transfer_items: TransferItem[];
}

interface Branch { id: string; name: string; }
interface LocalInv { product_id: string; stock_qty: number; products: { name: string; sku: string; base_price: number } }

export default function TransfersPage() {
  const { session } = useSession();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventory, setInventory] = useState<LocalInv[]>([]);
  
  const [isLoading, setIsLoading] = useState(true); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [selectedToBranch, setSelectedToBranch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [transferQty, setTransferQty] = useState(1);

  // STATE BARU: Menyimpan data analitik (Fondasi ML) untuk Cabang Tujuan
  const [smartRec, setSmartRec] = useState<{ destStock: number, avgSales: number } | null>(null);
  const [isRecLoading, setIsRecLoading] = useState(false);

  const [analytics, setAnalytics] = useState({
    pendingTransfers: 0,
    totalVolumeTransferred: 0,
    topMovedProduct: 'Belum Ada'
  });

  useEffect(() => {
    const fetchLogisticsData = async () => {
      if (!session?.tenantId || !session?.branchId) return;

      try {
        const { data: txData, error: txError } = await supabase
          .from('stock_transfers')
          .select(`
            id, status, created_at, from_branch_id, to_branch_id,
            from_branch:branches!from_branch_id(name),
            to_branch:branches!to_branch_id(name),
            stock_transfer_items ( id, product_id, qty, products(name, sku) )
          `)
          .eq('tenant_id', session.tenantId)
          .order('created_at', { ascending: false });

        if (txError) throw txError;
        
        const records = txData as unknown as TransferRecord[];
        
        let pending = 0;
        let volume = 0;
        const productCounts: Record<string, number> = {};

        records.forEach(tx => {
          if (tx.status !== 'received') {
            pending++;
          } else {
            tx.stock_transfer_items.forEach(item => {
              volume += item.qty;
              const pName = item.products?.name || 'Produk Dihapus';
              productCounts[pName] = (productCounts[pName] || 0) + item.qty;
            });
          }
        });

        let topProduct = 'Belum Ada';
        let maxQty = 0;
        Object.entries(productCounts).forEach(([name, qty]) => {
          if (qty > maxQty) {
            maxQty = qty;
            topProduct = name;
          }
        });

        const { data: branchData, error: branchError } = await supabase
          .from('branches')
          .select('id, name')
          .eq('tenant_id', session.tenantId)
          .neq('id', session.branchId);

        if (branchError) throw branchError;
        
        const { data: invData, error: invError } = await supabase
          .from('branch_inventory')
          .select('product_id, stock_qty, products(name, sku, base_price)')
          .eq('branch_id', session.branchId)
          .gt('stock_qty', 0);

        if (invError) throw invError;
        
        setTransfers(records);
        setAnalytics({
          pendingTransfers: pending,
          totalVolumeTransferred: volume,
          topMovedProduct: maxQty > 0 ? `${topProduct} (${maxQty} unit)` : 'Belum Ada'
        });
        setBranches(branchData);
        setInventory(invData as unknown as LocalInv[]);

      } catch (error) {
        console.error("Gagal memuat data logistik:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogisticsData();
  }, [session, refreshTrigger]);

  // LOGIKA BARU (ML Foundation): Menarik data prediktif saat input Modal berubah
  useEffect(() => {
    const fetchRecommendation = async () => {
      if (!selectedToBranch || !selectedProduct) {
        setSmartRec(null);
        return;
      }
      setIsRecLoading(true);
      try {
        // 1. Cek Sisa Stok di Cabang Tujuan
        const { data: destInv } = await supabase
          .from('branch_inventory')
          .select('stock_qty')
          .eq('branch_id', selectedToBranch)
          .eq('product_id', selectedProduct)
          .single();

        const destStock = destInv ? destInv.stock_qty : 0;

        // 2. Cek Rata-Rata Penjualan Harian di Cabang Tujuan (Dari SQL View)
        const { data: stats } = await supabase
          .from('product_sales_stats')
          .select('avg_daily_sales')
          .eq('branch_id', selectedToBranch)
          .eq('product_id', selectedProduct)
          .single();

        const avgSales = stats ? stats.avg_daily_sales : 0;

        setSmartRec({ destStock, avgSales });
      } catch (err) {
        console.error("Gagal menarik data rekomendasi:", err);
        setSmartRec({ destStock: 0, avgSales: 0 }); // Fallback
      } finally {
        setIsRecLoading(false);
      }
    };

    fetchRecommendation();
  }, [selectedToBranch, selectedProduct]);

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setIsProcessing(true);

    try {
      const itemInv = inventory.find(i => i.product_id === selectedProduct);
      if (!itemInv || itemInv.stock_qty < transferQty) {
        throw new Error("Stok tidak mencukupi untuk ditransfer!");
      }

      const { data: transferHeader, error: headerErr } = await supabase
        .from('stock_transfers')
        .insert({
          tenant_id: session.tenantId,
          from_branch_id: session.branchId,
          to_branch_id: selectedToBranch,
          status: 'draft'
        })
        .select().single();

      if (headerErr) throw headerErr;

      const { error: itemErr } = await supabase
        .from('stock_transfer_items')
        .insert({
          transfer_id: transferHeader.id,
          product_id: selectedProduct,
          qty: transferQty
        });

      if (itemErr) throw itemErr;

      setIsModalOpen(false);
      setSelectedToBranch('');
      setSelectedProduct('');
      setTransferQty(1);
      setSmartRec(null);
      setRefreshTrigger(prev => prev + 1); 

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      alert('Gagal membuat transfer: ' + msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateStatus = async (transferId: string, currentStatus: string, fromBranchId: string, toBranchId: string, items: TransferItem[]) => {
    setIsProcessing(true);
    try {
      if (currentStatus === 'draft') {
        for (const item of items) {
          const { data: senderInv } = await supabase
            .from('branch_inventory')
            .select('id, stock_qty')
            .eq('branch_id', fromBranchId)
            .eq('product_id', item.product_id)
            .single();
            
          if (senderInv) {
            await supabase.from('branch_inventory')
              .update({ stock_qty: senderInv.stock_qty - item.qty })
              .eq('id', senderInv.id);
          }
        }
        await supabase.from('stock_transfers').update({ status: 'in_transit' }).eq('id', transferId);

      } else if (currentStatus === 'in_transit') {
        for (const item of items) {
          const { data: receiverInv } = await supabase
            .from('branch_inventory')
            .select('id, stock_qty')
            .eq('branch_id', toBranchId)
            .eq('product_id', item.product_id)
            .single();
            
          if (receiverInv) {
            await supabase.from('branch_inventory')
              .update({ stock_qty: receiverInv.stock_qty + item.qty })
              .eq('id', receiverInv.id);
          } else {
            const { data: prodMaster } = await supabase.from('products').select('base_price').eq('id', item.product_id).single();
            await supabase.from('branch_inventory').insert({
              branch_id: toBranchId,
              product_id: item.product_id,
              stock_qty: item.qty,
              branch_price: prodMaster?.base_price || 0
            });
          }
        }
        await supabase.from('stock_transfers').update({ status: 'received', received_at: new Date().toISOString() }).eq('id', transferId);
      }
      
      setRefreshTrigger(prev => prev + 1);
    } catch (error: unknown) {
      console.error("Gagal update status:", error);
      alert('Terjadi kesalahan saat memproses logistik.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <span className="flex items-center w-fit gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold"><FileText size={12}/> Draft</span>;
      case 'in_transit': return <span className="flex items-center w-fit gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold"><Truck size={12}/> Dikirim</span>;
      case 'received': return <span className="flex items-center w-fit gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold"><CheckCircle size={12}/> Selesai</span>;
      default: return null;
    }
  };

  return (
    <div className="p-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transfer Stok</h1>
          <p className="text-gray-500 mt-1">Kelola logistik dan pantau pergerakan aset antar-cabang.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
          <Plus size={20} /> Buat Transfer
        </button>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><BarChart2 size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Total Volume Selesai</p>
              <h3 className="text-2xl font-bold text-gray-900">{analytics.totalVolumeTransferred} <span className="text-sm font-normal text-gray-500">unit</span></h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg"><TrendingUp size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Paling Sering Dipindah</p>
              <h3 className="text-lg font-bold text-gray-900 line-clamp-1" title={analytics.topMovedProduct}>{analytics.topMovedProduct}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><AlertCircle size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Antrean Logistik (Pending)</p>
              <h3 className="text-2xl font-bold text-gray-900">{analytics.pendingTransfers} <span className="text-sm font-normal text-gray-500">truk</span></h3>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 font-semibold">Tujuan</th>
                <th className="p-4 font-semibold">Detail Barang</th>
                <th className="p-4 font-semibold">Tanggal</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">Memuat logistik...</td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 flex flex-col items-center">
                    <Package size={32} className="mb-2 text-gray-300" />
                    Belum ada riwayat transfer stok.
                  </td>
                </tr>
              ) : (
                transfers.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition">
                    <td className="p-4">
                      <div className="text-gray-900 font-semibold">{tx.to_branch?.name || 'Cabang Dihapus'}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        <ArrowLeftRight size={12} /> Dari: {tx.from_branch?.name || 'Cabang Dihapus'}
                      </div>
                    </td>
                    <td className="p-4">
                      {tx.stock_transfer_items.map(item => (
                        <div key={item.id} className="text-sm text-gray-800">
                          {item.qty}x <span className="font-medium">{item.products?.name || 'Produk Dihapus'}</span>
                        </div>
                      ))}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {new Date(tx.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-4">
                      {getStatusBadge(tx.status)}
                    </td>
                    <td className="p-4 text-center">
                      {tx.status === 'draft' && (
                        <button 
                          onClick={() => handleUpdateStatus(tx.id, 'draft', tx.from_branch_id, tx.to_branch_id, tx.stock_transfer_items)}
                          disabled={isProcessing}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 transition"
                        >
                          Kirim Barang
                        </button>
                      )}
                      {tx.status === 'in_transit' && (
                        <button 
                          onClick={() => handleUpdateStatus(tx.id, 'in_transit', tx.from_branch_id, tx.to_branch_id, tx.stock_transfer_items)}
                          disabled={isProcessing}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 transition"
                        >
                          Terima Barang
                        </button>
                      )}
                      {tx.status === 'received' && (
                        <span className="text-gray-400 text-sm font-medium">Selesai</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Buat Transfer Stok</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateTransfer} className="p-4 space-y-4">
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cabang Tujuan</label>
                <select 
                  required 
                  value={selectedToBranch} 
                  onChange={(e) => setSelectedToBranch(e.target.value)}
                  className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="">-- Pilih Cabang --</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {branches.length === 0 && <p className="text-xs text-red-500 mt-1">Anda harus membuat cabang lain di database terlebih dahulu.</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Produk (Dari stok Anda)</label>
                <select 
                  required 
                  value={selectedProduct} 
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="">-- Pilih Produk --</option>
                  {inventory.map(inv => (
                    <option key={inv.product_id} value={inv.product_id}>
                      {inv.products.name} (Sisa Stok: {inv.stock_qty})
                    </option>
                  ))}
                </select>
              </div>

              {/* KOTAK REKOMENDASI CERDAS (FONDASI ML) MUNCUL DI SINI */}
              {selectedToBranch && selectedProduct && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm flex items-start gap-3">
                  <Info size={20} className="shrink-0 mt-0.5 text-blue-600" />
                  {isRecLoading ? (
                    <p className="text-gray-500">Menganalisis kebutuhan Cabang Tujuan...</p>
                  ) : (
                    <p className="text-gray-700 leading-relaxed">
                      Sisa stok di tujuan: <span className="font-bold text-red-600">{smartRec?.destStock} unit</span>.<br/>
                      Kecepatan jual (30 hari): <span className="font-bold text-blue-600">{smartRec?.avgSales} unit/hari</span>.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Transfer (Qty)</label>
                <input 
                  required 
                  type="number" 
                  min="1"
                  value={transferQty} 
                  onChange={(e) => setTransferQty(Number(e.target.value))} 
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" 
                />
              </div>

              <div className="pt-4 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 font-medium">Batal</button>
                <button type="submit" disabled={isProcessing || !selectedToBranch || !selectedProduct} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400 transition">
                  {isProcessing ? 'Menyimpan...' : 'Simpan Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}