'use client';

import { useState, useEffect } from 'react';
import { db, LocalProduct } from '@/lib/dexie';
import { useCartStore } from '@/hooks/useCartStore';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

// Bentuk data hasil query Supabase: stok dan harga berasal dari inventori cabang,
// sedangkan identitas serta kategori produk berasal dari tabel products.
interface SupabaseJoinResponse {
  stock_qty: number;
  branch_price: number;
  products: {
    id: string;
    sku: string;
    name: string;
    category?: string; 
  };
}

// Produk lokal yang ditampilkan di POS dapat memiliki kategori untuk kebutuhan filter.
type POSProduct = LocalProduct & { category?: string };

export default function ProductGrid() {
  // Katalog yang ditampilkan dan kata kunci yang dimasukkan pada kolom pencarian.
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Kategori aktif; nilai "Semua" berarti katalog tidak dibatasi oleh kategori.
  const [selectedCategory, setSelectedCategory] = useState('Semua'); 
  // Menentukan apakah area katalog menampilkan indikator pemuatan.
  const [isLoading, setIsLoading] = useState(true);
  
  // Ambil aksi dan isi keranjang agar produk dapat ditambahkan serta stok tersisa dihitung.
  const addItem = useCartStore(state => state.addItem);
  const items = useCartStore(state => state.items);

  // Data sesi menentukan cabang yang inventori produknya perlu dimuat.
  const { session, isLoading: isSessionLoading } = useSession();
  const branchId = session?.branchId || ""; 

  useEffect(() => {
    // Tunggu sesi selesai dimuat sebelum memilih inventori cabang.
    if (isSessionLoading) return;
    
    // Muat katalog dari server saat daring, simpan sebagai cache lokal,
    // lalu tampilkan data lokal agar katalog tetap tersedia saat luring.
    const fetchMasterData = async () => {
      setIsLoading(true);
      
      try {
        // Sinkronisasi hanya dapat dilakukan jika perangkat daring dan cabang diketahui.
        if (navigator.onLine && branchId) {
          console.log("Online: Menarik Master Data terbaru dari Supabase...");
          
          // Ambil stok dan harga khusus cabang beserta informasi produk terkait.
          const { data: inventoryData, error } = await supabase
            .from('branch_inventory')
            .select(`
              stock_qty,
              branch_price,
              products (
                id,
                sku,
                name,
                category
              )
            `)
            .eq('branch_id', branchId);

          // Ganti cache hanya jika query berhasil dan server mengembalikan data.
          if (!error && inventoryData) {
            // Ubah relasi Supabase menjadi bentuk ringkas yang digunakan POS.
            const formattedProducts = (inventoryData as unknown as SupabaseJoinResponse[]).map((item) => ({
              id: item.products.id,
              sku: item.products.sku,
              name: item.products.name,
              branch_price: item.branch_price,
              stock_qty: item.stock_qty,
              category: item.products.category || 'Umum' 
            }));

            // Cache lama dihapus sebelum data terbaru ditulis agar katalog lokal konsisten.
            await db.products.clear();
            await db.products.bulkAdd(formattedProducts as LocalProduct[]);
          }
        }

        // Selalu tampilkan cache lokal, termasuk saat offline atau sinkronisasi tidak berhasil.
        const localData = await db.products.toArray();
        setProducts(localData as POSProduct[]);

      } catch (error) {
        // Catat kegagalan agar masalah pemuatan atau penyimpanan cache dapat ditelusuri.
        console.error("Gagal sinkronisasi produk:", error);
      } finally {
        // Pastikan indikator pemuatan dihentikan meskipun terjadi kegagalan.
        setIsLoading(false);
      }
    };
    
    fetchMasterData();

    // Dengarkan sinyal dari bagian lain aplikasi, misalnya setelah stok berubah di keranjang.
    const handleRefresh = () => {
      console.log("Sinyal diterima! Memuat ulang stok...");
      fetchMasterData();
    };

    window.addEventListener('refreshProductGrid', handleRefresh);

    return () => {
      // Lepas listener saat efek berjalan ulang atau komponen tidak lagi ditampilkan.
      window.removeEventListener('refreshProductGrid', handleRefresh);
    };

  }, [branchId, isSessionLoading]); 

  // Buat kategori unik dari produk yang tersedia dan tambahkan pilihan tanpa filter.
  const categories = ['Semua', ...Array.from(new Set(products.map(p => p.category || 'Umum')))];

  // Tampilkan produk yang cocok dengan nama/SKU sekaligus kategori yang dipilih.
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Produk tanpa kategori diberi kategori bawaan yang sama dengan saat sinkronisasi.
    const productCategory = p.category || 'Umum';
    const matchesCategory = selectedCategory === 'Semua' || productCategory === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Tambahkan produk ke keranjang setelah memastikan stok masih mencukupi.
  const handleProductClick = (product: LocalProduct) => {
    // Produk dengan stok kosong tidak dapat dimasukkan ke keranjang.
    if (product.stock_qty <= 0) {
      alert(`Maaf, stok ${product.name} sedang habis!`);
      return;
    }

    // Periksa jumlah yang sudah ada agar total pesanan tidak melebihi stok cabang.
    const existingItem = items.find(item => item.id === product.id);
    if (existingItem && existingItem.cartQty >= product.stock_qty) {
      alert(`Batas maksimal! Sisa stok ${product.name} hanya tinggal ${product.stock_qty}.`);
      return;
    }

    addItem(product);
  };

  return (
    <div className="flex flex-col h-full bg-white p-6">
      
      {/* Kolom pencarian menyaring katalog berdasarkan nama produk atau SKU. */}
      <div className="mb-4">
        <input 
          type="text" 
          placeholder="Cari nama produk atau SKU..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-900 bg-white"
        />
      </div>

      {/* Tombol kategori mengubah kategori aktif; pilihan "Semua" menampilkan seluruh kategori. */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-hide border-b border-gray-100 shrink-0">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold transition-colors ${
              selectedCategory === cat 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Area katalog menampilkan status memuat atau kartu produk yang sudah difilter. */}
      <div className="flex-1 overflow-y-auto pr-2 mt-2">
        {isLoading ? (
          <div className="flex justify-center items-center h-full text-gray-500">
            Memuat katalog produk...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(product => {
              // Kurangi stok cabang dengan jumlah produk yang sudah ada di keranjang.
              const cartItem = items.find(i => i.id === product.id);
              const currentCartQty = cartItem ? cartItem.cartQty : 0;
              const remainingStock = product.stock_qty - currentCartQty;
              // Stok habis jika seluruh unit tersedia sudah berada di keranjang.
              const isOutOfStock = remainingStock <= 0;

              return (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product as LocalProduct)}
                  disabled={isOutOfStock}
                  className={`flex flex-col text-left border rounded-xl p-4 transition bg-white text-gray-900 ${
                    isOutOfStock 
                      ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50' 
                      : 'hover:border-blue-500 hover:shadow-md active:scale-95'
                  }`}
                >
                  <div className="flex justify-between items-start w-full mb-1">
                    <span className="text-xs text-gray-400">{product.sku}</span>
                    {/* Kategori membantu pengguna mengenali kelompok produk. */}
                    <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {product.category || 'Umum'}
                    </span>
                  </div>
                  
                  <span className="font-semibold text-gray-800 line-clamp-2 min-h-[3rem] mt-1">
                    {product.name}
                  </span>
                  
                  <div className="mt-auto pt-2 flex justify-between items-center w-full">
                    <span className="text-blue-600 font-bold">
                      Rp {product.branch_price.toLocaleString('id-ID')}
                    </span>
                    {/* Tampilkan stok setelah dikurangi jumlah yang telah masuk keranjang. */}
                    <span className={`text-[11px] px-2 py-1 rounded font-bold ${isOutOfStock ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                      Sisa: {remainingStock}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        
        {/* Bedakan hasil kosong karena filter pencarian dengan katalog lokal yang belum terisi. */}
        {!isLoading && filteredProducts.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            {searchQuery || selectedCategory !== 'Semua' 
              ? `Tidak ada produk dalam kategori "${selectedCategory}" yang cocok dengan pencarian Anda.` 
              : `Produk tidak ditemukan di database lokal. Pastikan Anda online untuk sinkronisasi pertama kali.`}
          </div>
        )}
      </div>
    </div>
  );
}