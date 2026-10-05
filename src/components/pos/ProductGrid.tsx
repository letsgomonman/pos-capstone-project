'use client';

import { useState, useEffect } from 'react';
import { db, LocalProduct } from '@/lib/dexie';
import { useCartStore } from '@/hooks/useCartStore';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

// PERBAIKAN 1: Mendefinisikan tipe kembalian (response) spesifik dari Supabase JOIN
interface SupabaseJoinResponse {
  stock_qty: number;
  branch_price: number;
  products: {
    id: string;
    sku: string;
    name: string;
  };
}

export default function ProductGrid() {
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const addItem = useCartStore(state => state.addItem);

  // --- SETUP ID ---
  const { session, isLoading: isSessionLoading } = useSession();
  const branchId = session?.branchId || ""; 

  useEffect(() => {
    if (isSessionLoading) return;
    const fetchMasterData = async () => {
      setIsLoading(true);
      
      try {
        if (navigator.onLine && branchId) {
          console.log("Online: Menarik Master Data terbaru dari Supabase...");
          
          const { data: inventoryData, error } = await supabase
            .from('branch_inventory')
            .select(`
              stock_qty,
              branch_price,
              products (
                id,
                sku,
                name
              )
            `)
            .eq('branch_id', branchId);

          if (!error && inventoryData) {
            // PERBAIKAN 2: Gunakan Interface yang sudah dibuat alih-alih tipe 'any'
            const formattedProducts: LocalProduct[] = (inventoryData as unknown as SupabaseJoinResponse[]).map((item) => ({
              id: item.products.id,
              sku: item.products.sku,
              name: item.products.name,
              branch_price: item.branch_price,
              stock_qty: item.stock_qty
            }));

            await db.products.clear();
            await db.products.bulkAdd(formattedProducts);
          }
        }

        const localData = await db.products.toArray();
        setProducts(localData);

      } catch (error) {
        console.error("Gagal sinkronisasi produk:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMasterData();
  }, [branchId]); 

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white p-6">
      <div className="mb-6">
        <input 
          type="text" 
          placeholder="Cari nama produk atau SKU..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 bg-white"
        />
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="flex justify-center items-center h-full text-gray-500">
            Memuat katalog produk...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => addItem(product)}
                className="flex flex-col text-left border rounded-xl p-4 hover:border-blue-500 hover:shadow-md transition active:scale-95 bg-white text-gray-900"
              >
                <span className="text-xs text-gray-400 mb-1">{product.sku}</span>
                {/* PERBAIKAN 3: Tailwind min-h-[3rem] diganti ke min-h-12 sesuai saran */}
                <span className="font-semibold text-gray-800 line-clamp-2 min-h-12">
                  {product.name}
                </span>
                <div className="mt-auto pt-2 flex justify-between items-center w-full">
                  <span className="text-blue-600 font-bold">
                    Rp {product.branch_price.toLocaleString('id-ID')}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    Stok: {product.stock_qty}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        
        {!isLoading && filteredProducts.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            Produk tidak ditemukan di database lokal. Pastikan Anda online untuk sinkronisasi pertama kali.
          </div>
        )}
      </div>
    </div>
  );
}