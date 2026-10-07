'use client'; 

import NetworkStatus from '@/components/pos/NetworkStatus';
import CartPanel from '@/components/pos/Cart';
import ProductGrid from '@/components/pos/ProductGrid';
import { useSession } from '@/hooks/useSession';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LogOut, Archive } from 'lucide-react';

export default function POSPage() {
  const { session, isLoading, initializeSession, logout } = useSession();
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);

  // STATE BARU: Untuk menyimpan nama toko dan cabang
  const [storeName, setStoreName] = useState('Memuat Toko...');
  const [branchName, setBranchName] = useState('');

  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  useEffect(() => {
    if (!isLoading) {
      if (!session) {
        router.replace('/login');
      } else if (session.role === 'manager') {
        router.replace('/analytics');
      }
    }
  }, [session, isLoading, router]);

  // LOGIKA BARU: Menarik nama Usaha (Tenant) dan Cabang (Branch) dari database
  useEffect(() => {
    const fetchStoreInfo = async () => {
      if (!session?.tenantId || !session?.branchId) return;
      try {
        // Tarik nama Usaha/Tenant
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', session.tenantId)
          .single();

        // Tarik nama Cabang
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

    if (session) {
      fetchStoreInfo();
    }
  }, [session]);

  const handleLogout = () => {
    logout(); 
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

      const { data: invData, error: invErr } = await supabase
        .from('branch_inventory')
        .select('product_id, stock_qty')
        .eq('branch_id', session.branchId);

      if (invErr) throw invErr;

      if (!invData || invData.length === 0) {
         throw new Error("Tidak ada produk di inventory cabang ini.");
      }

      const today = new Date().toISOString().split('T')[0]; 
      const snapshots = invData.map((item) => ({
        tenant_id: session.tenantId,
        branch_id: session.branchId,
        product_id: item.product_id,
        stock_qty: item.stock_qty,
        snapshot_date: today
      }));

      const { error: snapErr } = await supabase
        .from('daily_inventory_snapshots')
        .upsert(snapshots, { onConflict: 'branch_id, product_id, snapshot_date' });

      if (snapErr) throw snapErr;

      alert("Tutup Kasir Berhasil! Data ML harian tersimpan. Anda akan dikeluarkan dari sistem.");
      handleLogout(); 

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

  if (!session || session.role === 'manager') {
    return null;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden text-gray-900">
      <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 text-white font-bold px-3 py-1 rounded">POS</div>
          
          {/* PENERAPAN NAMA DINAMIS */}
          <h1 className="font-semibold text-lg text-gray-800 hidden md:block">
            {storeName} {branchName && <span className="text-gray-500 font-normal"> - {branchName}</span>}
          </h1>
          
        </div>
        
        <div className="flex items-center gap-4">
          <NetworkStatus />
          <div className="w-px h-6 bg-gray-300 mx-2"></div>
          <div className="text-sm text-gray-600 flex items-center gap-4">
            <span>
              Kasir: <span className="font-semibold text-gray-900">{session?.name || 'Anonim'}</span>
            </span>
            
            <button 
              onClick={handleEndOfDay}
              disabled={isClosing}
              className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600 text-white font-medium text-xs px-3 py-1.5 rounded transition disabled:bg-gray-400"
              title="Tutup Shift & Rekam Stok"
            >
              <Archive size={14} />
              {isClosing ? 'Merekam...' : 'Tutup Kasir'}
            </button>

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