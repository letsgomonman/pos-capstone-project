'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { TrendingUp, ShoppingBag, AlertCircle, MapPin, Package, Clock, BarChart3 } from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

// Informasi cabang yang ditampilkan pada pilihan filter milik owner.
interface Branch { id: string; name: string; }

// Bentuk data yang dibutuhkan grafik tren pendapatan dan distribusi transaksi per jam.
interface ChartData { name: string; total: number; }
interface HourlyData { hour: string; count: number; }

// Nama produk dan jumlah unit terjual, digunakan untuk menyusun daftar produk terlaris.
interface TopProduct { name: string; sold: number; }

// Struktur item transaksi beserta relasi produk yang dikembalikan Supabase.
interface TransactionItemData {
  qty: number;
  products?: { name: string } | { name: string }[] | null;
}

// Halaman analitik penjualan dan stok untuk cabang yang dapat diakses pengguna.
export default function AnalyticsDashboard() {
  // Sesi menentukan tenant, peran, dan cabang yang boleh dilihat pengguna.
  const { session } = useSession();

  // Pilihan cabang hanya diperlukan untuk owner yang dapat melihat beberapa cabang.
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  
  // Pilihan periode analisis dan indikator saat data sedang dimuat.
  const [timeRange, setTimeRange] = useState<string>('7d');
  const [isLoading, setIsLoading] = useState(true);

  // Nilai untuk tiga kartu ringkasan di bagian atas dashboard.
  const [stats, setStats] = useState({ totalRevenue: 0, totalTransactions: 0, lowStockItems: 0 });
  
  // Data yang telah disiapkan untuk grafik pendapatan, jam sibuk, dan produk terlaris.
  const [revenueTrend, setRevenueTrend] = useState<ChartData[]>([]);
  const [hourlyTrend, setHourlyTrend] = useState<HourlyData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  // Label periode yang ditampilkan pada judul agar sesuai dengan filter aktif.
  const timeRangeText = {
    '7d': '7 Hari Terakhir',
    '30d': '30 Hari Terakhir',
    '6m': '6 Bulan Terakhir',
    '1y': '1 Tahun Terakhir'
  }[timeRange];

  useEffect(() => {
    // Ambil data, hitung metrik, lalu siapkan seluruh dataset yang dibutuhkan UI.
    const fetchDashboardData = async () => {
      // Data analitik dibatasi per tenant; tunggu hingga sesi menyediakan tenant ID.
      if (!session?.tenantId) return;
      setIsLoading(true);

      try {
        let activeBranchIds: string[] = [];

        // Owner dapat memilih satu atau semua cabang; pengguna lain memakai cabang pada sesi.
        if (session.role === 'owner') {
          const { data: branchData } = await supabase.from('branches').select('id, name').eq('tenant_id', session.tenantId);
          setBranches(branchData || []);
          activeBranchIds = selectedFilter === 'all' ? (branchData?.map(b => b.id) || []) : [selectedFilter];
        } else {
          activeBranchIds = [session.branchId];
        }

        // Buat rentang tanggal dan kerangka nilai grafik; setiap periode dimulai dari nol
        // agar tanggal atau bulan tanpa transaksi tetap muncul pada grafik.
        const now = new Date();
        let startDate = new Date();
        const revMap: Record<string, number> = {};
        let isMonthView = false;

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
          // Mulai dari tanggal satu agar seluruh bulan pertama ikut dihitung.
          startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            revMap[d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })] = 0;
          }
        } else if (timeRange === '1y') {
          isMonthView = true;
          // Mulai dari tanggal satu agar mencakup dua belas bulan kalender.
          startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
          for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            revMap[d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })] = 0;
          }
        }
        
        startDate.setHours(0, 0, 0, 0);
        const isoStartDate = startDate.toISOString();

        // Ambil transaksi tenant yang tidak dibatalkan, mulai dari tanggal awal periode.
        let txQuery = supabase
          .from('transactions')
          .select(`
            id, total_amount, created_at,
            transaction_items ( qty, products ( name ) )
          `)
          .eq('tenant_id', session.tenantId)
          .eq('is_void', false)
          .gte('created_at', isoStartDate); 
        
        // Batasi hasil sesuai pilihan owner atau cabang yang terikat pada peran manager.
        if (session.role === 'owner' && selectedFilter !== 'all') txQuery = txQuery.eq('branch_id', selectedFilter);
        else if (session.role === 'manager') txQuery = txQuery.eq('branch_id', session.branchId);

        const { data: txData, error: txError } = await txQuery;
        if (txError) throw txError;

        // Penampung agregasi transaksi: omzet, jumlah transaksi per jam, dan unit per produk.
        let totalRev = 0;
        const hourMap: Record<string, number> = {};
        const prodMap: Record<string, number> = {};

        // Siapkan jam operasional yang ditampilkan, termasuk jam tanpa transaksi.
        for(let i = 8; i <= 22; i++) {
          hourMap[`${i.toString().padStart(2, '0')}:00`] = 0;
        }

        (txData || []).forEach(tx => {
          totalRev += Number(tx.total_amount);

          const date = new Date(tx.created_at);
          // Gunakan format label yang sama dengan kerangka grafik harian atau bulanan.
          const dateStr = isMonthView 
            ? date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })
            : date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
            
          const hourStr = `${date.getHours().toString().padStart(2, '0')}:00`;

          // Tambahkan omzet ke periode dan transaksi ke jam yang sesuai jika label tersedia.
          if (revMap[dateStr] !== undefined) revMap[dateStr] += Number(tx.total_amount);
          if (hourMap[hourStr] !== undefined) hourMap[hourStr] += 1;

          // Akumulasikan kuantitas item, menerima relasi produk berbentuk objek maupun array.
          const items = (tx.transaction_items as unknown as TransactionItemData[]) || [];
          items.forEach((item) => {
            const prod = Array.isArray(item.products) ? item.products[0] : item.products;
            // Tetap hitung item transaksi meskipun data produknya sudah tidak tersedia.
            const pName = prod?.name || 'Produk Dihapus';
            prodMap[pName] = (prodMap[pName] || 0) + item.qty;
          });
        });

        // Hitung jumlah baris persediaan dengan stok di bawah 10 pada cabang yang dipilih.
        let lowStockCount = 0;
        if (activeBranchIds.length > 0) {
          const { count } = await supabase.from('branch_inventory').select('*', { count: 'exact', head: true }).in('branch_id', activeBranchIds).lt('stock_qty', 10);
          lowStockCount = count || 0;
        }

        // Ubah hasil agregasi menjadi format konsumsi kartu ringkasan dan grafik.
        setStats({ totalRevenue: totalRev, totalTransactions: (txData || []).length, lowStockItems: lowStockCount });
        setRevenueTrend(Object.keys(revMap).map(k => ({ name: k, total: revMap[k] })));
        setHourlyTrend(Object.keys(hourMap).map(k => ({ hour: k, count: hourMap[k] })));

        // Urutkan produk berdasarkan unit terjual dan tampilkan maksimal lima teratas.
        setTopProducts(Object.keys(prodMap).map(k => ({ name: k, sold: prodMap[k] })).sort((a, b) => b.sold - a.sold).slice(0, 5));

      } catch (error) {
        // Catat kegagalan agar masalah pemuatan data dapat ditelusuri di konsol.
        console.error("Gagal memuat analitik:", error);
      } finally {
        // Pastikan indikator pemuatan berhenti baik permintaan berhasil maupun gagal.
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  // Segarkan analitik setiap sesi, filter cabang, atau periode waktu berubah.
  }, [session, selectedFilter, timeRange]);

  // Tampilkan status pemuatan sebagai pengganti dashboard selama data diambil.
  if (isLoading) return <div className="p-8 text-gray-500 animate-pulse flex items-center justify-center h-full">Memproses Data Analitik...</div>;

  return (
    <div className="p-8 pb-20">
      {/* Judul dashboard dan kontrol untuk memilih periode serta cabang analisis. */}
      <header className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ringkasan Data ({timeRangeText})</h1>
          <p className="text-gray-500 mt-1">Pantau performa tren penjualan dan analisis pergerakan pelanggan.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Pilih rentang waktu yang digunakan untuk menghitung ulang semua analitik. */}
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

          {/* Owner dapat melihat keseluruhan usaha atau menyaring ke satu cabang. */}
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

      {/* Ringkasan omzet, banyaknya transaksi, dan jumlah persediaan yang menipis. */}
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
        
        {/* Grafik garis omzet per hari atau per bulan sesuai periode yang dipilih. */}
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
                {/* Format sumbu nilai dalam ribuan rupiah agar label lebih ringkas. */}
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(val) => `Rp${val/1000}k`} />
                <Tooltip 
                  formatter={(value: unknown) => {
                    const numVal = Number(value) || 0;
                    return [`Rp ${numVal.toLocaleString('id-ID')}`, 'Omzet'];
                  }} 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                {/* Garis menunjukkan perubahan omzet pada setiap periode. */}
                <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          
          {/* Daftar maksimal lima produk dengan jumlah unit terjual tertinggi. */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex-1">
            <div className="flex items-center gap-2 mb-4">
              <Package size={20} className="text-purple-600"/>
              <h2 className="text-lg font-bold text-gray-900">Top 5 Produk Terlaris</h2>
            </div>
            {/* Tampilkan pesan kosong jika periode ini belum memiliki data penjualan. */}
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

          {/* Grafik batang menunjukkan jumlah transaksi pada tiap jam operasional. */}
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
                  {/* Tinggi batang mewakili banyaknya transaksi pada jam tersebut. */}
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