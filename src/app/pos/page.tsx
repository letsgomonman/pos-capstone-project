import NetworkStatus from '@/components/pos/NetworkStatus';
import CartPanel from '@/components/pos/Cart';
import ProductGrid from '@/components/pos/ProductGrid';

export default function POSPage() {
  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden text-gray-900">
      
      {/* 1. HEADER (Top Bar) */}
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
          <div className="text-sm text-gray-600">
            Kasir: <span className="font-semibold text-gray-900">John Doe</span>
          </div>
        </div>
      </header>
      
      {/* 2. MAIN LAYOUT (Grid Kiri & Cart Kanan) */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* Kiri: Area Produk */}
        <section className="flex-1 flex flex-col h-full relative z-0">
           <ProductGrid />
        </section>

        {/* Kanan: Panel Keranjang */}
        <aside className="w-[350px] lg:w-[400px] shrink-0 bg-white shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.1)] z-10 relative">
           <CartPanel />
        </aside>
        
      </main>
      
    </div>
  );
}