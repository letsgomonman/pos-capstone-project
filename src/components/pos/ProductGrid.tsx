'use client';

import { useState, useEffect } from 'react';
import { db, LocalProduct } from '@/lib/dexie';
import { useCartStore } from '@/hooks/useCartStore';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

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
  
  // PERBAIKAN 1: Ambil juga 'items' dari keranjang untuk mengecek jumlah saat ini
  const addItem = useCartStore(state => state.addItem);
  const items = useCartStore(state => state.items);

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
  }, [branchId, isSessionLoading]); 

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // PERBAIKAN 2: Fungsi validasi klik produk
  const handleProductClick = (product: LocalProduct) => {
    // A. Cek jika stok awal di database sudah habis (0)
    if (product.stock_qty <= 0) {
      alert(`Maaf, stok ${product.name} sedang habis!`);
      return;
    }

    // B. Cek apakah barang ini sudah ada di keranjang, dan apakah klik ini akan melebihi stok
    const existingItem = items.find(item => item.id === product.id);
    if (existingItem && existingItem.cartQty >= product.stock_qty) {
      alert(`Batas maksimal! Sisa stok ${product.name} hanya tinggal ${product.stock_qty}.`);
      return;
    }

    // C. Jika aman dari limit, masukkan ke keranjang
    addItem(product);
  };

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
            {filteredProducts.map(product => {
              // KALKULASI STOK DINAMIS
              const cartItem = items.find(i => i.id === product.id);
              const currentCartQty = cartItem ? cartItem.cartQty : 0;
              const remainingStock = product.stock_qty - currentCartQty;
              const isOutOfStock = remainingStock <= 0;

              return (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  disabled={isOutOfStock}
                  className={`flex flex-col text-left border rounded-xl p-4 transition bg-white text-gray-900 ${
                    isOutOfStock 
                      ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50' 
                      : 'hover:border-blue-500 hover:shadow-md active:scale-95'
                  }`}
                >
                  <span className="text-xs text-gray-400 mb-1">{product.sku}</span>
                  <span className="font-semibold text-gray-800 line-clamp-2 min-h-12">
                    {product.name}
                  </span>
                  <div className="mt-auto pt-2 flex justify-between items-center w-full">
                    <span className="text-blue-600 font-bold">
                      Rp {product.branch_price.toLocaleString('id-ID')}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded font-medium ${isOutOfStock ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                      Sisa Stok: {remainingStock}
                    </span>
                  </div>
                </button>
              );
            })}
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