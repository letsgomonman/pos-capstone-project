'use client'; 

import NetworkStatus from '@/components/pos/NetworkStatus';
import CartPanel from '@/components/pos/Cart';
import ProductGrid from '@/components/pos/ProductGrid';
import { useSession } from '@/hooks/useSession';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LogOut, Archive } from 'lucide-react';
import Image from 'next/image';

export default function POSPage() {
  // Ambil data sesi kasir dan fungsi untuk mengelola autentikasi.
  const { session, isLoading, initializeSession, logout } = useSession();
  const router = useRouter();

  // Menandai proses penutupan shift agar tombol tidak dapat ditekan berulang kali.
  const [isClosing, setIsClosing] = useState(false);

  // Nama toko dan cabang ditampilkan setelah informasinya berhasil dimuat.
  const [storeName, setStoreName] = useState('Memuat Toko...');
  const [branchName, setBranchName] = useState('');

  // Inisialisasi sesi saat halaman POS mulai digunakan.
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // Kasir tanpa sesi diarahkan ke login, sedangkan manajer menggunakan halaman analitik.
  useEffect(() => {
    if (!isLoading) {
      if (!session) {
        router.replace('/login');
      } else if (session.role === 'manager') {
        router.replace('/analytics');
      }
    }
  }, [session, isLoading, router]);

  // Muat nama toko dan cabang yang terkait dengan sesi pengguna saat ini.
  useEffect(() => {
    const fetchStoreInfo = async () => {
      // Informasi ini tidak dapat dicari sebelum identitas tenant dan cabang tersedia.
      if (!session?.tenantId || !session?.branchId) return;
      try {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', session.tenantId)
          .single();

        const { data: branch } = await supabase
          .from('branches')
          .select('name')
          .eq('id', session.branchId)
          .single();

        if (tenant) setStoreName(tenant.name);
        if (branch) setBranchName(branch.name);
      } catch (error) {
        console.error("Gagal memuat informasi toko:", error);
        setStoreName("Toko Tidak Dikenal");
      }
    };

    // Hindari permintaan data toko sebelum sesi berhasil dimuat.
    if (session) {
      fetchStoreInfo();
    }
  }, [session]);

  // Akhiri sesi aktif lalu kembali ke halaman login.
  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Simpan stok seluruh produk cabang sebagai snapshot harian sebelum mengakhiri shift.
  const handleEndOfDay = async () => {
    if (!session) return;
    const confirmClose = window.confirm("Tutup Shift sekarang? Ini akan merekam data stok harian Anda ke Cloud.");
    if (!confirmClose) return;

    setIsClosing(true);
    try {
      // Penutupan shift membutuhkan koneksi karena data disimpan ke Supabase.
      if (!navigator.onLine) {
        throw new Error("Anda harus dalam keadaan Online (Terkoneksi Internet) untuk Tutup Kasir.");
      }

      // Ambil jumlah stok terkini untuk seluruh produk pada cabang sesi ini.
      const { data: invData, error: invErr } = await supabase
        .from('branch_inventory')
        .select('product_id, stock_qty')
        .eq('branch_id', session.branchId);

      if (invErr) throw invErr;

      if (!invData || invData.length === 0) {
         throw new Error("Tidak ada produk di inventory cabang ini.");
      }

      // Bentuk satu catatan snapshot per produk untuk tanggal saat ini.
      const today = new Date().toISOString().split('T')[0]; 
      const snapshots = invData.map((item) => ({
        tenant_id: session.tenantId,
        branch_id: session.branchId,
        product_id: item.product_id,
        stock_qty: item.stock_qty,
        snapshot_date: today
      }));

      // Perbarui snapshot yang sudah ada atau buat catatan baru jika belum tersedia.
      const { error: snapErr } = await supabase
        .from('daily_inventory_snapshots')
        .upsert(snapshots, { onConflict: 'branch_id, product_id, snapshot_date' });

      if (snapErr) throw snapErr;

      // Setelah penyimpanan berhasil, beri tahu pengguna dan akhiri sesi kasir.
      alert("Tutup Kasir Berhasil! Data harian tersimpan. Anda akan dikeluarkan dari sistem.");
      handleLogout();

    } catch (error: unknown) {
      // Tampilkan penyebab kegagalan, termasuk error yang bukan instance Error.
      const msg = error instanceof Error ? error.message : String(error);
      alert("Gagal Tutup Kasir: " + msg);
    } finally {
      // Pulihkan tombol penutupan shift, baik proses berhasil maupun gagal.
      setIsClosing(false);
    }
  };

  // Tampilkan status pemuatan hingga pemeriksaan sesi selesai.
  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-gray-100 text-gray-900">Memuat Sesi Kasir...</div>;
  }

  // Jangan tampilkan antarmuka POS bagi pengguna yang tidak berhak mengaksesnya.
  if (!session || session.role === 'manager') {
    return null;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden text-gray-900">
      {/* Header memuat identitas toko, status jaringan, pengguna, dan aksi sesi. */}
      <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          {/* Logo toko ditampilkan di sisi kiri header. */}
          <div className="flex items-center justify-center bg-white pr-2 py-1">
             <Image 
               src="/logo.svg" 
               alt="POS Logo" 
               width={100} 
               height={32} 
               className="h-8 w-auto object-contain"
               style={{ width: 'auto' }}
               priority
             />
          </div>
          
          {/* Tampilkan nama cabang hanya jika nilainya tersedia. */}
          <h1 className="font-semibold text-lg text-gray-800 hidden md:block">
            {storeName} {branchName && <span className="text-gray-500 font-normal"> - {branchName}</span>}
          </h1>
          
        </div>
        
        <div className="flex items-center gap-4">
          {/* Status jaringan membantu kasir mengetahui kondisi koneksi. */}
          <NetworkStatus />
          <div className="w-px h-6 bg-gray-300 mx-2"></div>
          <div className="text-sm text-gray-600 flex items-center gap-4">
            {/* Tampilkan nama kasir, dengan teks pengganti jika nama tidak tersedia. */}
            <span>
              Kasir: <span className="font-semibold text-gray-900">{session?.name || 'Anonim'}</span>
            </span>
            
            {/* Catat stok akhir shift; tombol dinonaktifkan selama penyimpanan berlangsung. */}
            <button 
              onClick={handleEndOfDay}
              disabled={isClosing}
              className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600 text-white font-medium text-xs px-3 py-1.5 rounded transition disabled:bg-gray-400"
              title="Tutup Shift & Rekam Stok"
            >
              <Archive size={14} />
              {isClosing ? 'Merekam...' : 'Tutup Kasir'}
            </button>

            {/* Sediakan aksi untuk mengakhiri sesi tanpa merekam snapshot stok. */}
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1 text-red-500 hover:text-red-700 font-medium text-xs border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded transition"
            >
              <LogOut size={14} />
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* Area kerja utama membagi tampilan menjadi katalog dan keranjang belanja. */}
      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 flex flex-col h-full relative z-0">
           <ProductGrid />
        </section>
        {/* Panel keranjang memiliki lebar tetap agar ringkasan transaksi selalu terlihat. */}
        <aside className="w-[350px] lg:w-[400px] shrink-0 bg-white shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.1)] z-10 relative">
           <CartPanel />
        </aside>
      </main>
    </div>
  );
}