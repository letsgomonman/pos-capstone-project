'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Search, Plus, Edit2, X, Box, Trash2, TrendingUp, AlertTriangle, ThermometerSnowflake, Filter, Package } from 'lucide-react';

// 1. Tipe Data Mentah (Dari Database)
interface RawInventoryItem {
  id: string; 
  stock_qty: number;
  branch_price: number;
  products: {
    id: string;
    sku: string;
    name: string;
    base_price: number;
    category: string; 
  };
}

// 2. Tipe Data Diperkaya (Ditambah Analitik ML-Ready)
interface InventoryItem extends RawInventoryItem {
  sold30Days: number;
  status: 'Fast-Moving' | 'Slow-Moving' | 'Low-Stock' | 'Normal';
}

export default function InventoryPage() {
  const { session } = useSession();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // State Form Tambah
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPrice, setNewPrice] = useState<number | string>('');
  const [newStock, setNewStock] = useState<number | string>('');
  
  // State Form Edit
  const [editId, setEditId] = useState('');
  const [editProductId, setEditProductId] = useState(''); 
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPrice, setEditPrice] = useState<number | string>('');
  const [editStock, setEditStock] = useState<number | string>('');

  // Mengambil kategori unik
  const uniqueCategories: string[] = Array.from(
    new Set(
      inventory
        .map((item) => item.products?.category)
        .filter((cat): cat is string => typeof cat === 'string' && cat.trim() !== '')
    )
  );

  const fetchInventory = async () => {
    if (!session?.branchId) return;
    setIsLoading(true);
    
    try {
      // 1. Tarik data inventaris dan produk induk
      const { data: invData, error: invErr } = await supabase
        .from('branch_inventory')
        .select(`
          id,
          stock_qty,
          branch_price,
          products ( id, sku, name, base_price, category ) 
        `)
        .eq('branch_id', session.branchId)
        .order('updated_at', { ascending: false });

      if (invErr) throw invErr;

      // 2. Tarik Data Penjualan 30 Hari Terakhir (Bahan Baku ML)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: salesData, error: salesErr } = await supabase
        .from('transaction_items')
        .select('product_id, qty, transactions!inner(branch_id, created_at, is_void)')
        .eq('transactions.branch_id', session.branchId)
        .eq('transactions.is_void', false)
        .gte('transactions.created_at', thirtyDaysAgo.toISOString());

      if (salesErr) throw salesErr;

      // 3. Hitung Kalkulasi Pergerakan (Velocity)
      const salesMap: Record<string, number> = {};
      if (salesData) {
        salesData.forEach((sale: unknown) => {
          const s = sale as { product_id: string; qty: number };
          salesMap[s.product_id] = (salesMap[s.product_id] || 0) + s.qty;
        });
      }

      // 4. Gabungkan Data (Enrichment) - PERBAIKAN TS/ESLint (Tanpa 'any')
      const enrichedInventory: InventoryItem[] = (invData as unknown as RawInventoryItem[]).map(item => {
        const sold = salesMap[item.products.id] || 0;
        const stock = item.stock_qty;
        
        let status: InventoryItem['status'] = 'Normal';
        
        if (stock <= 5) {
          status = 'Low-Stock'; 
        } else if (sold >= 30) {
          status = 'Fast-Moving';
        } else if (sold <= 3 && stock >= 15) {
          status = 'Slow-Moving';
        }

        return { ...item, sold30Days: sold, status };
      });

      enrichedInventory.sort((a, b) => a.stock_qty - b.stock_qty);
      setInventory(enrichedInventory);

    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      if (session?.branchId) {
        await fetchInventory();
      }
    };
    initializeData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.branchId]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setIsSaving(true);

    try {
      const autoSku = `SKU-${Date.now().toString().slice(-6)}`;
      const { data: productData, error: pErr } = await supabase
        .from('products')
        .insert({
          tenant_id: session.tenantId,
          sku: autoSku,
          name: newName,
          category: newCategory || 'Umum',
          base_price: newPrice
        })
        .select().single();

      if (pErr) throw pErr;

      const { error: invErr } = await supabase
        .from('branch_inventory')
        .insert({
          branch_id: session.branchId,
          product_id: productData.id,
          stock_qty: newStock,
          branch_price: newPrice 
        });

      if (invErr) throw invErr;

      setIsAddOpen(false);
      setNewName(''); setNewCategory(''); setNewPrice(''); setNewStock('');
      
      fetchInventory();

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      alert('Gagal menambah produk: ' + msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const { error: invError } = await supabase
        .from('branch_inventory')
        .update({
          stock_qty: editStock,
          branch_price: editPrice,
          updated_at: new Date().toISOString()
        })
        .eq('id', editId);

      if (invError) throw invError;

      const { error: prodError } = await supabase
        .from('products')
        .update({ category: editCategory || 'Umum' })
        .eq('id', editProductId);

      if (prodError) throw prodError;
      
      setIsEditOpen(false);
      fetchInventory();
    } catch (error: unknown) {
      console.error("Gagal memperbarui inventaris:", error);
      alert('Gagal memperbarui data. Cek console log.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (inventoryId: string, productId: string, productName: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus "${productName}" dari katalog?`)) return;
    
    try {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      setInventory(prev => prev.filter(item => item.id !== inventoryId));
    } catch (error: unknown) {
      console.error("Gagal menghapus produk:", error);
      alert('Gagal menghapus. Pastikan produk ini belum memiliki riwayat transaksi.');
    }
  };

  const openEditModal = (item: InventoryItem) => {
    setEditId(item.id);
    setEditProductId(item.products.id);
    setEditName(item.products.name);
    setEditCategory(item.products.category || ''); 
    setEditPrice(item.branch_price);
    setEditStock(item.stock_qty);
    setIsEditOpen(true);
  };

  const filteredInventory = inventory.filter(item => {
    const matchSearch = 
      item.products.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.products.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.products.category && item.products.category.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchStatus = filterStatus === 'all' || item.status === filterStatus;
    
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Master Inventory</h1>
          <p className="text-gray-500 mt-1">Kelola stok, harga, dan pantau pergerakan produk.</p>
        </div>
        <button 
          onClick={() => setIsAddOpen(true)}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
          <Plus size={20} /> Tambah Produk
        </button>
      </div>

      {/* Search Bar & Filter AI-Ready */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Cari nama, SKU, atau kategori..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
        </div>
        
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-1.5 bg-gray-50 w-full md:w-auto">
          <Filter size={16} className="text-gray-500 ml-2" />
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-transparent py-1 pr-4 pl-1 text-sm font-medium outline-none text-gray-700 cursor-pointer w-full"
          >
            <option value="all">Semua Status</option>
            <option value="Fast-Moving">Laris (Fast-Moving)</option>
            <option value="Slow-Moving">Barang Mati (Slow-Moving)</option>
            <option value="Low-Stock">Stok Menipis</option>
          </select>
        </div>
      </div>

      {/* Table Data */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 font-semibold">Info Produk</th>
                <th className="p-4 font-semibold text-right">Harga Cabang</th>
                <th className="p-4 font-semibold text-center">Sisa Stok</th>
                <th className="p-4 font-semibold text-center">Terjual (30 Hari)</th>
                <th className="p-4 font-semibold">Status Prediktif</th>
                <th className="p-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 animate-pulse">Menganalisis pergerakan data...</td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 flex flex-col items-center">
                    <Box size={32} className="mb-2 text-gray-300" />
                    Produk tidak ditemukan.
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg text-gray-500"><Package size={20} /></div>
                        <div>
                          <p className="font-bold text-gray-900">{item.products.name}</p>
                          <p className="text-xs text-gray-500">{item.products.category || 'Umum'} • SKU: {item.products.sku || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right font-medium text-gray-900">
                      Rp {item.branch_price.toLocaleString('id-ID')}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`text-lg font-bold ${item.stock_qty <= 5 ? 'text-red-600' : 'text-gray-900'}`}>
                        {item.stock_qty}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-medium text-gray-600">{item.sold30Days} unit</span>
                    </td>
                    <td className="p-4">
                      {item.status === 'Fast-Moving' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                          <TrendingUp size={14} /> Fast-Moving
                        </span>
                      )}
                      {item.status === 'Slow-Moving' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                          <ThermometerSnowflake size={14} /> Barang Mati
                        </span>
                      )}
                      {item.status === 'Low-Stock' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                          <AlertTriangle size={14} /> Stok Menipis
                        </span>
                      )}
                      {item.status === 'Normal' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Stabil
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition">
                        <button 
                          onClick={() => openEditModal(item)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Edit Stok & Harga"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteProduct(item.id, item.products.id, item.products.name)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Hapus Produk"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TAMBAH PRODUK */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Tambah Produk Baru</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddProduct} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Barang</label>
                <input 
                  type="text"
                  list="category-options-add"
                  placeholder="Ketik kategori baru atau pilih..."
                  value={newCategory} 
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white"
                />
                <datalist id="category-options-add">
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Produk</label>
                <input required type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" placeholder="Contoh: Kopi Pandan" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Harga (Rp)</label>
                  <input required type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stok Awal</label>
                  <input required type="number" value={newStock} onChange={(e) => setNewStock(e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                </div>
              </div>
              <div className="pt-4 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 font-medium">Batal</button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400 transition">
                  {isSaving ? 'Menyimpan...' : 'Simpan Produk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT PRODUK */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Edit Inventory</h2>
              <button onClick={() => setIsEditOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleEditInventory} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Produk</label>
                <input type="text" value={editName} disabled className="w-full p-2 border rounded-lg bg-gray-100 text-gray-500 outline-none" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Barang</label>
                <input 
                  type="text"
                  list="category-options-edit"
                  placeholder="Ketik kategori baru atau pilih..."
                  value={editCategory} 
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white"
                />
                <datalist id="category-options-edit">
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Harga Cabang (Rp)</label>
                  <input required type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Penyesuaian Stok</label>
                  <input required type="number" value={editStock} onChange={(e) => setEditStock(e.target.value === '' ? '' : Number(e.target.value))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900" />
                </div>
              </div>
              <div className="pt-4 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setIsEditOpen(false)} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 font-medium">Batal</button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400 transition">
                  {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}