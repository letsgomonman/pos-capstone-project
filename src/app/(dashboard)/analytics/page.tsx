'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { TrendingUp, ShoppingBag, AlertCircle } from 'lucide-react';

export default function AnalyticsDashboard() {
  const { session } = useSession();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalTransactions: 0,
    lowStockItems: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!session?.tenantId) return;

      try {
        // 1. Ambil Total Transaksi & Omzet untuk Tenant ini
        // (Dalam praktiknya, bisa difilter by Date/Bulan)
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .select('total_amount')
          .eq('tenant_id', session.tenantId)
          .eq('is_void', false);

        if (txError) throw txError;

        const totalRev = txData.reduce((sum, tx) => sum + Number(tx.total_amount), 0);
        const totalTx = txData.length;

        // 2. Cek Barang yang Stoknya Menipis (< 10)
        const { count: lowStockCount, error: invError } = await supabase
          .from('branch_inventory')
          .select('*', { count: 'exact', head: true }) // head:true berarti kita hanya ambil jumlah barisnya saja (hemat bandwidth)
          .lt('stock_qty', 10);

        if (invError) throw invError;

        setStats({
          totalRevenue: totalRev,
          totalTransactions: totalTx,
          lowStockItems: lowStockCount || 0
        });
      } catch (error) {
        console.error("Gagal memuat data analitik:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [session]);

  if (isLoading) {
    return <div className="p-8 text-gray-500 animate-pulse">Menghitung analitik data...</div>;
  }

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Ringkasan Data</h1>
        <p className="text-gray-500 mt-1">Pantau performa bisnis dan operasional toko Anda.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Kartu Omzet */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Total Omzet</p>
            <h3 className="text-2xl font-bold text-gray-900">
              Rp {stats.totalRevenue.toLocaleString('id-ID')}
            </h3>
          </div>
        </div>

        {/* Kartu Transaksi */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
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
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
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

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Ruang Fitur ML-Ready (Data-Driven)</h2>
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p className="text-gray-500 text-sm">
            Di area ini, nantinya Anda bisa mengimplementasikan diagram (Charts) berbasis data dari Supabase, 
            seperti grafik <strong>Time-Series Forecasting (Jam Sibuk Toko)</strong> atau <strong>Market Basket Analysis</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}