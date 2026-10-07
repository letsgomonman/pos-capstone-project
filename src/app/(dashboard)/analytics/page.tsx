'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { TrendingUp, ShoppingBag, AlertCircle, MapPin } from 'lucide-react';

// Tipe Data untuk Dropdown Cabang Owner
interface Branch {
  id: string;
  name: string;
}

export default function AnalyticsDashboard() {
  const { session } = useSession();
  
  // State untuk menyimpan daftar cabang (Khusus Owner)
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalTransactions: 0,
    lowStockItems: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!session?.tenantId) return;
      setIsLoading(true);

      try {
        let activeBranchIds: string[] = [];

        // 1. SIAPKAN FILTER BERDASARKAN JABATAN
        if (session.role === 'owner') {
          // Owner: Tarik daftar cabang untuk menu dropdown
          const { data: branchData } = await supabase
            .from('branches')
            .select('id, name')
            .eq('tenant_id', session.tenantId);
          
          const availableBranches = branchData || [];
          setBranches(availableBranches);

          if (selectedFilter === 'all') {
            activeBranchIds = availableBranches.map(b => b.id);
          } else {
            activeBranchIds = [selectedFilter];
          }
        } else {
          // Manajer: Kunci mutlak ke cabangnya sendiri
          activeBranchIds = [session.branchId];
        }

        // 2. BANGUN QUERY TRANSAKSI
        let txQuery = supabase
          .from('transactions')
          .select('total_amount')
          .eq('tenant_id', session.tenantId)
          .eq('is_void', false);
        
        // Terapkan filter spesifik jika bukan mode "Semua Cabang"
        if (session.role === 'owner' && selectedFilter !== 'all') {
          txQuery = txQuery.eq('branch_id', selectedFilter);
        } else if (session.role === 'manager') {
          txQuery = txQuery.eq('branch_id', session.branchId);
        }

        // 3. BANGUN QUERY INVENTARIS (Stok Menipis)
        let lowStockCount = 0;
        if (activeBranchIds.length > 0) {
          const { count, error: invError } = await supabase
            .from('branch_inventory')
            .select('*', { count: 'exact', head: true })
            .in('branch_id', activeBranchIds) // Gunakan IN agar mendukung multi-cabang untuk Owner
            .lt('stock_qty', 10);
          
          if (!invError) lowStockCount = count || 0;
        }

        // 4. EKSEKUSI DATA
        const { data: txData, error: txError } = await txQuery;
        if (txError) throw txError;

        const totalRev = (txData || []).reduce((sum, tx) => sum + Number(tx.total_amount), 0);
        const totalTx = (txData || []).length;

        setStats({
          totalRevenue: totalRev,
          totalTransactions: totalTx,
          lowStockItems: lowStockCount
        });

      } catch (error) {
        console.error("Gagal memuat data analitik:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [session, selectedFilter]); // React akan me-load ulang data otomatis saat selectedFilter berubah

  if (isLoading) {
    return <div className="p-8 text-gray-500 animate-pulse flex items-center justify-center h-full">Menghitung analitik data...</div>;
  }

  return (
    <div className="p-8">
      
      {/* HEADER & FILTER CABANG (KHUSUS OWNER) */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ringkasan Data</h1>
          <p className="text-gray-500 mt-1">Pantau performa bisnis dan operasional toko Anda.</p>
        </div>

        {session?.role === 'owner' && branches.length > 0 && (
          <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-200 shadow-sm shrink-0">
            <MapPin size={18} className="text-gray-400 ml-2" />
            <select 
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="bg-transparent text-gray-800 font-medium outline-none cursor-pointer pr-4 py-1"
            >
              <option value="all">Keseluruhan Usaha (Semua Cabang)</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* KARTU METRIK */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Kartu Omzet */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4 transition hover:shadow-md">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">
              {selectedFilter === 'all' ? 'Total Omzet Usaha' : 'Omzet Cabang'}
            </p>
            <h3 className="text-2xl font-bold text-gray-900">
              Rp {stats.totalRevenue.toLocaleString('id-ID')}
            </h3>
          </div>
        </div>

        {/* Kartu Transaksi */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4 transition hover:shadow-md">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <ShoppingBag size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Total Transaksi</p>
            <h3 className="text-2xl font-bold text-gray-900">
              {stats.totalTransactions} <span className="text-sm font-normal text-gray-500">struk</span>
            </h3>
          </div>
        </div>

        {/* Kartu Peringatan Stok */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4 transition hover:shadow-md">
          <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Peringatan Stok Menipis</p>
            <h3 className="text-2xl font-bold text-gray-900">
              {stats.lowStockItems} <span className="text-sm font-normal text-gray-500">item</span>
            </h3>
          </div>
        </div>
      </div>

      {/* RUANG PENGEMBANGAN FITUR SELANJUTNYA */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Ruang Fitur ML-Ready (Data-Driven)</h2>
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p className="text-gray-500 text-sm">
            Saat Anda memasang grafik (Charts) di masa mendatang, grafik tersebut juga harus menggunakan variabel <strong>activeBranchIds</strong> agar visualisasinya otomatis ter-filter sesuai pilihan Dropdown di atas!
          </p>
        </div>
      </div>
    </div>
  );
}