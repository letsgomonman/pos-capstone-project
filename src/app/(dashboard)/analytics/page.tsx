'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { TrendingUp, ShoppingBag, AlertCircle, MapPin, Package, Clock, BarChart3 } from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

interface Branch { id: string; name: string; }
interface ChartData { name: string; total: number; }
interface HourlyData { hour: string; count: number; }
interface TopProduct { name: string; sold: number; }

// PERBAIKAN: Perluas interface agar menerima objek tunggal ATAU array
interface TransactionItemData {
  qty: number;
  products?: { name: string } | { name: string }[] | null;
}

export default function AnalyticsDashboard() {
  const { session } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Metrik Utama
  const [stats, setStats] = useState({ totalRevenue: 0, totalTransactions: 0, lowStockItems: 0 });
  
  // Metrik Grafik (ML-Ready Data)
  const [revenueTrend, setRevenueTrend] = useState<ChartData[]>([]);
  const [hourlyTrend, setHourlyTrend] = useState<HourlyData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!session?.tenantId) return;
      setIsLoading(true);

      try {
        let activeBranchIds: string[] = [];

        // 1. FILTER CABANG (Sesuai Role)
        if (session.role === 'owner') {
          const { data: branchData } = await supabase.from('branches').select('id, name').eq('tenant_id', session.tenantId);
          setBranches(branchData || []);
          activeBranchIds = selectedFilter === 'all' ? (branchData?.map(b => b.id) || []) : [selectedFilter];
        } else {
          activeBranchIds = [session.branchId];
        }

        // Ambil Batas Waktu 7 Hari Terakhir
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        const isoStartDate = sevenDaysAgo.toISOString();

        // 2. QUERY BERSARANG
        let txQuery = supabase
          .from('transactions')
          .select(`
            id, total_amount, created_at,
            transaction_items ( qty, products ( name ) )
          `)
          .eq('tenant_id', session.tenantId)
          .eq('is_void', false)
          .gte('created_at', isoStartDate); 
        
        if (session.role === 'owner' && selectedFilter !== 'all') txQuery = txQuery.eq('branch_id', selectedFilter);
        else if (session.role === 'manager') txQuery = txQuery.eq('branch_id', session.branchId);

        const { data: txData, error: txError } = await txQuery;
        if (txError) throw txError;

        // 3. PENGOLAHAN DATA MENTAH MENJADI INSIGHT
        let totalRev = 0;
        const revMap: Record<string, number> = {};
        const hourMap: Record<string, number> = {};
        const prodMap: Record<string, number> = {};

        // Inisialisasi label 7 hari terakhir agar grafik tidak putus
        for(let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          revMap[d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })] = 0;
        }

        // Inisialisasi label 24 jam
        for(let i = 8; i <= 22; i++) { 
          hourMap[`${i.toString().padStart(2, '0')}:00`] = 0;
        }

        (txData || []).forEach(tx => {
          totalRev += Number(tx.total_amount);
          
          const date = new Date(tx.created_at);
          const dateStr = date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
          const hourStr = `${date.getHours().toString().padStart(2, '0')}:00`;

          if (revMap[dateStr] !== undefined) revMap[dateStr] += Number(tx.total_amount);
          if (hourMap[hourStr] !== undefined) hourMap[hourStr] += 1;

          // PERBAIKAN TS2352: Gunakan 'as unknown' ganda sesuai saran compiler
          const items = (tx.transaction_items as unknown as TransactionItemData[]) || [];
          items.forEach((item) => {
            // Amankan data jika seandainya Supabase merespons dengan array
            const prod = Array.isArray(item.products) ? item.products[0] : item.products;
            const pName = prod?.name || 'Produk Dihapus';
            prodMap[pName] = (prodMap[pName] || 0) + item.qty;
          });
        });

        // 4. HITUNG STOK MENIPIS
        let lowStockCount = 0;
        if (activeBranchIds.length > 0) {
          const { count } = await supabase.from('branch_inventory').select('*', { count: 'exact', head: true }).in('branch_id', activeBranchIds).lt('stock_qty', 10);
          lowStockCount = count || 0;
        }

        setStats({ totalRevenue: totalRev, totalTransactions: (txData || []).length, lowStockItems: lowStockCount });
        setRevenueTrend(Object.keys(revMap).map(k => ({ name: k, total: revMap[k] })));
        setHourlyTrend(Object.keys(hourMap).map(k => ({ hour: k, count: hourMap[k] })));
        setTopProducts(Object.keys(prodMap).map(k => ({ name: k, sold: prodMap[k] })).sort((a, b) => b.sold - a.sold).slice(0, 5));

      } catch (error) {
        console.error("Gagal memuat analitik:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [session, selectedFilter]);

  if (isLoading) return <div className="p-8 text-gray-500 animate-pulse flex items-center justify-center h-full">Memproses Data Analitik...</div>;

  return (
    <div className="p-8 pb-20">
      {/* HEADER & FILTER */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ringkasan Data (7 Hari Terakhir)</h1>
          <p className="text-gray-500 mt-1">Pantau performa tren penjualan dan analisis pergerakan pelanggan.</p>
        </div>
        {session?.role === 'owner' && branches.length > 0 && (
          <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-200 shadow-sm shrink-0">
            <MapPin size={18} className="text-gray-400 ml-2" />
            <select value={selectedFilter} onChange={(e) => setSelectedFilter(e.target.value)} className="bg-transparent text-gray-800 font-medium outline-none cursor-pointer pr-4 py-1">
              <option value="all">Keseluruhan Usaha</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
      </header>

      {/* KARTU METRIK UTAMA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg"><TrendingUp size={24} /></div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Omzet 7 Hari Terakhir</p>
            <h3 className="text-2xl font-bold text-gray-900">Rp {stats.totalRevenue.toLocaleString('id-ID')}</h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><ShoppingBag size={24} /></div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Total Transaksi</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats.totalTransactions} <span className="text-sm font-normal text-gray-500">struk</span></h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><AlertCircle size={24} /></div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Peringatan Stok Menipis</p>
            <h3 className="text-2xl font-bold text-gray-900">{stats.lowStockItems} <span className="text-sm font-normal text-gray-500">item</span></h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRAFIK 1: Tren Pendapatan */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 size={20} className="text-blue-600"/>
            <h2 className="text-lg font-bold text-gray-900">Tren Pendapatan Harian</h2>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(val) => `Rp${val/1000}k`} />
                <Tooltip 
                  formatter={(value: unknown) => {
                    const numVal = Number(value) || 0;
                    return [`Rp ${numVal.toLocaleString('id-ID')}`, 'Omzet'];
                  }} 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          
          {/* TABEL 1: Top 5 Produk */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex-1">
            <div className="flex items-center gap-2 mb-4">
              <Package size={20} className="text-purple-600"/>
              <h2 className="text-lg font-bold text-gray-900">Top 5 Produk Terlaris</h2>
            </div>
            {topProducts.length === 0 ? (
              <p className="text-gray-500 text-sm text-center mt-10">Belum ada data penjualan minggu ini.</p>
            ) : (
              <div className="space-y-4 mt-6">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-600'}`}>{i + 1}</span>
                      <span className="font-medium text-gray-800 text-sm line-clamp-1">{p.name}</span>
                    </div>
                    <span className="font-bold text-gray-900 text-sm">{p.sold} <span className="font-normal text-gray-500 text-xs">terjual</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* GRAFIK 2: Jam Sibuk */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex-1">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={20} className="text-orange-600"/>
              <h2 className="text-lg font-bold text-gray-900">Distribusi Jam Sibuk</h2>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyTrend}>
                  <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd"/>
                  <Tooltip 
                    cursor={{ fill: '#f3f4f6' }} 
                    formatter={(value: unknown) => {
                      const numVal = Number(value) || 0;
                      return [`${numVal} Transaksi`, 'Intensitas'];
                    }} 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="count" fill="#fb923c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}