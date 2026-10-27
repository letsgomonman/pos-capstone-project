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

// Tipe data item transaksi
interface TransactionItemData {
  qty: number;
  products?: { name: string } | { name: string }[] | null;
}

export default function AnalyticsDashboard() {
  const { session } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  
  // Filter rentang waktu
  const [timeRange, setTimeRange] = useState<string>('7d');
  const [isLoading, setIsLoading] = useState(true);

  // Metrik utama
  const [stats, setStats] = useState({ totalRevenue: 0, totalTransactions: 0, lowStockItems: 0 });
  
  // Data grafik dan produk terlaris
  const [revenueTrend, setRevenueTrend] = useState<ChartData[]>([]);
  const [hourlyTrend, setHourlyTrend] = useState<HourlyData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  // Label rentang waktu untuk judul
  const timeRangeText = {
    '7d': '7 Hari Terakhir',
    '30d': '30 Hari Terakhir',
    '6m': '6 Bulan Terakhir',
    '1y': '1 Tahun Terakhir'
  }[timeRange];

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!session?.tenantId) return;
      setIsLoading(true);

      try {
        let activeBranchIds: string[] = [];

        // Tentukan cabang berdasarkan peran pengguna
        if (session.role === 'owner') {
          const { data: branchData } = await supabase.from('branches').select('id, name').eq('tenant_id', session.tenantId);
          setBranches(branchData || []);
          activeBranchIds = selectedFilter === 'all' ? (branchData?.map(b => b.id) || []) : [selectedFilter];
        } else {
          activeBranchIds = [session.branchId];
        }

        // Tentukan rentang waktu dan inisialisasi label grafik
        const now = new Date();
        let startDate = new Date();
        const revMap: Record<string, number> = {};
        let isMonthView = false; // Tentukan pengelompokan grafik bulanan atau harian

        if (timeRange === '7d') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
          for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            revMap[d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })] = 0;
          }
        } else if (timeRange === '30d') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
          for (let i = 29; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            revMap[d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })] = 0;
          }
        } else if (timeRange === '6m') {
          isMonthView = true;
          startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1); // Mulai dari awal bulan 5 bulan sebelumnya
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            revMap[d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })] = 0;
          }
        } else if (timeRange === '1y') {
          isMonthView = true;
          startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1); // Mulai dari awal bulan 11 bulan sebelumnya
          for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            revMap[d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })] = 0;
          }
        }
        
        startDate.setHours(0, 0, 0, 0);
        const isoStartDate = startDate.toISOString();

        // Ambil transaksi dalam rentang waktu terpilih
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

        // Olah transaksi menjadi metrik dan tren
        let totalRev = 0;
        const hourMap: Record<string, number> = {};
        const prodMap: Record<string, number> = {};

        // Inisialisasi label distribusi transaksi per jam
        for(let i = 8; i <= 22; i++) { 
          hourMap[`${i.toString().padStart(2, '0')}:00`] = 0;
        }

        (txData || []).forEach(tx => {
          totalRev += Number(tx.total_amount);
          
          const date = new Date(tx.created_at);
          // Tentukan kunci tren sesuai rentang waktu harian atau bulanan
          const dateStr = isMonthView 
            ? date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })
            : date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
            
          const hourStr = `${date.getHours().toString().padStart(2, '0')}:00`;

          if (revMap[dateStr] !== undefined) revMap[dateStr] += Number(tx.total_amount);
          if (hourMap[hourStr] !== undefined) hourMap[hourStr] += 1;

          // Hitung produk terlaris dari item transaksi
          const items = (tx.transaction_items as unknown as TransactionItemData[]) || [];
          items.forEach((item) => {
            // Tangani relasi produk dalam bentuk objek atau array
            const prod = Array.isArray(item.products) ? item.products[0] : item.products;
            const pName = prod?.name || 'Produk Dihapus';
            prodMap[pName] = (prodMap[pName] || 0) + item.qty;
          });
        });

        // Hitung stok menipis pada cabang aktif
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
  }, [session, selectedFilter, timeRange]); // Muat ulang saat sesi, cabang, atau rentang waktu berubah

  if (isLoading) return <div className="p-8 text-gray-500 animate-pulse flex items-center justify-center h-full">Memproses Data Analitik...</div>;

  return (
    <div className="p-8 pb-20">
      {/* Header dan filter */}
      <header className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ringkasan Data ({timeRangeText})</h1>
          <p className="text-gray-500 mt-1">Pantau performa tren penjualan dan analisis pergerakan pelanggan.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter rentang waktu */}
          <div className="flex items-center bg-white p-2 rounded-lg border border-gray-200 shadow-sm shrink-0">
            <Clock size={18} className="text-gray-400 ml-2 mr-1" />
            <select 
              value={timeRange} 
              onChange={(e) => setTimeRange(e.target.value)} 
              className="bg-transparent text-gray-800 font-medium outline-none cursor-pointer pr-2 py-1"
            >
              <option value="7d">7 Hari Terakhir</option>
              <option value="30d">30 Hari Terakhir</option>
              <option value="6m">6 Bulan Terakhir</option>
              <option value="1y">1 Tahun Terakhir</option>
            </select>
          </div>

          {/* Filter cabang untuk owner */}
          {session?.role === 'owner' && branches.length > 0 && (
            <div className="flex items-center bg-white p-2 rounded-lg border border-gray-200 shadow-sm shrink-0">
              <MapPin size={18} className="text-gray-400 ml-2 mr-1" />
              <select 
                value={selectedFilter} 
                onChange={(e) => setSelectedFilter(e.target.value)} 
                className="bg-transparent text-gray-800 font-medium outline-none cursor-pointer pr-2 py-1"
              >
                <option value="all">Keseluruhan Usaha</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* Kartu metrik utama */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-lg"><TrendingUp size={24} /></div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Total Omzet</p>
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
        
        {/* Grafik tren pendapatan */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 size={20} className="text-blue-600"/>
            <h2 className="text-lg font-bold text-gray-900">
              Tren Pendapatan {timeRange === '6m' || timeRange === '1y' ? 'Bulanan' : 'Harian'}
            </h2>
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
          
          {/* Daftar lima produk terlaris */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex-1">
            <div className="flex items-center gap-2 mb-4">
              <Package size={20} className="text-purple-600"/>
              <h2 className="text-lg font-bold text-gray-900">Top 5 Produk Terlaris</h2>
            </div>
            {topProducts.length === 0 ? (
              <p className="text-gray-500 text-sm text-center mt-10">Belum ada data penjualan pada rentang ini.</p>
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

          {/* Grafik distribusi jam sibuk */}
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