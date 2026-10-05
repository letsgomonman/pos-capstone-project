'use client'; // Pastikan tambahkan ini karena kita pakai hooks sekarang

import NetworkStatus from '@/components/pos/NetworkStatus';
import CartPanel from '@/components/pos/Cart';
import ProductGrid from '@/components/pos/ProductGrid';
import { useSession } from '@/hooks/useSession';
import { useRouter } from 'next/navigation';

export default function POSPage() {
  const { session, isLoading } = useSession();
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('pos_session');
    router.push('/login');
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
            {/* Tampilkan Nama Dinamis */}
            <span>
              Kasir: <span className="font-semibold text-gray-900">{session?.name || 'Anonim'}</span>
            </span>
            
            {/* Tombol Logout */}
            <button 
              onClick={handleLogout}
              className="text-red-500 hover:text-red-700 font-medium text-xs border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition"
            >
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