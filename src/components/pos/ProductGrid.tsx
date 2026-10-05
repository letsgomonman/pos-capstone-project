'use client';

import { useState, useEffect } from 'react';
import { db, LocalProduct } from '@/lib/dexie';
import { useCartStore } from '@/hooks/useCartStore';

export default function ProductGrid() {
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const addItem = useCartStore(state => state.addItem);

  // Ambil data dari IndexedDB saat komponen dimuat
  useEffect(() => {
    const loadProducts = async () => {
      let allProducts = await db.products.toArray();
      
      // --- HACK UNTUK TESTING MVP (Hapus di produksi) ---
      if (allProducts.length === 0) {
        const dummyData: LocalProduct[] = [
          { id: '1', sku: 'SKU-001', name: 'Kopi Kenangan Mantan', branch_price: 18000, stock_qty: 50 },
          { id: '2', sku: 'SKU-002', name: 'Roti Bakar Coklat', branch_price: 15000, stock_qty: 30 },
          { id: '3', sku: 'SKU-003', name: 'Indomie Telur Kornet', branch_price: 12000, stock_qty: 100 },
          { id: '4', sku: 'SKU-004', name: 'Es Teh Manis Jumbo', branch_price: 5000, stock_qty: 200 },
        ];
        await db.products.bulkAdd(dummyData);
        allProducts = dummyData;
      }
      // ---------------------------------------------------

      setProducts(allProducts);
    };
    
    loadProducts();
  }, []);

  // Filter produk berdasarkan pencarian Kasir
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white p-6">
      {/* Kolom Pencarian */}
      <div className="mb-6">
        <input 
          type="text" 
          placeholder="Cari nama produk atau SKU..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Grid Produk (Bisa di-scroll jika banyak) */}
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map(product => (
            <button
              key={product.id}
              onClick={() => addItem(product)}
              className="flex flex-col text-left border rounded-xl p-4 hover:border-blue-500 hover:shadow-md transition active:scale-95 bg-white"
            >
              <span className="text-xs text-gray-400 mb-1">{product.sku}</span>
              <span className="font-semibold text-gray-800 line-clamp-2 min-h-[3rem]">
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
        
        {filteredProducts.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            Produk tidak ditemukan.
          </div>
        )}
      </div>
    </div>
  );
}