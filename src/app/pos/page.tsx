'use client'; 

import NetworkStatus from '@/components/pos/NetworkStatus';
import CartPanel from '@/components/pos/Cart';
import ProductGrid from '@/components/pos/ProductGrid';
import { useSession } from '@/hooks/useSession';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LogOut, Archive } from 'lucide-react';

export default function POSPage() {
  const { session, isLoading } = useSession();
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('pos_session');
    router.push('/login');
  };

  const handleEndOfDay = async () => {
    if (!session) return;
    const confirmClose = window.confirm("Tutup Shift sekarang? Ini akan merekam data stok harian Anda ke Cloud.");
    if (!confirmClose) return;

    setIsClosing(true);
    try {
      if (!navigator.onLine) {
        throw new Error("Anda harus dalam keadaan Online (Terkoneksi Internet) untuk Tutup Kasir.");
      }

      // 1. Ambil stok riil saat ini dari cabang
      const { data: invData, error: invErr } = await supabase
        .from('branch_inventory')
        .select('product_id, stock_qty')
        .eq('branch_id', session.branchId);

      if (invErr) throw invErr;

      if (!invData || invData.length === 0) {
         throw new Error("Tidak ada produk di inventory cabang ini.");
      }

      // 2. Siapkan array data snapshot untuk direkam
      const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
      const snapshots = invData.map((item) => ({
        tenant_id: session.tenantId,
        branch_id: session.branchId,
        product_id: item.product_id,
        stock_qty: item.stock_qty,
        snapshot_date: today
      }));

      // 3. Simpan ke database (Upsert menimpa data jika tanggalnya sama, mencegah duplikasi)
      const { error: snapErr } = await supabase
        .from('daily_inventory_snapshots')
        .upsert(snapshots, { onConflict: 'branch_id, product_id, snapshot_date' });

      if (snapErr) throw snapErr;

      alert("Tutup Kasir Berhasil! Data ML harian tersimpan. Anda akan dikeluarkan dari sistem.");
      handleLogout(); // Otomatis keluar setelah sukses EOD

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      alert("Gagal Tutup Kasir: " + msg);
    } finally {
      setIsClosing(false);
    }
  };

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-gray-100 text-gray-900">Memuat Sesi Kasir...</div>;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden text-gray-900">
      <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 text-white font-bold px-3 py-1 rounded">POS</div>
          <h1 className="font-semibold text-lg text-gray-800 hidden md:block">
            Toko Capstone - Cabang Pusat
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <NetworkStatus />
          <div className="w-px h-6 bg-gray-300 mx-2"></div>
          <div className="text-sm text-gray-600 flex items-center gap-4">
            <span>
              Kasir: <span className="font-semibold text-gray-900">{session?.name || 'Anonim'}</span>
            </span>
            
            {/* Tombol End of Day */}
            <button 
              onClick={handleEndOfDay}
              disabled={isClosing}
              className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600 text-white font-medium text-xs px-3 py-1.5 rounded transition disabled:bg-gray-400"
              title="Tutup Shift & Rekam Stok"
            >
              <Archive size={14} />
              {isClosing ? 'Merekam...' : 'Tutup Kasir'}
            </button>

            {/* Tombol Logout Biasa */}
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
      
      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 flex flex-col h-full relative z-0">
           <ProductGrid />
        </section>
        <aside className="w-[350px] lg:w-[400px] shrink-0 bg-white shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.1)] z-10 relative">
           <CartPanel />
        </aside>
      </main>
    </div>
  );
}