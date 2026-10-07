'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Store, Plus, MapPin, X, Edit2, Trash2, CheckCircle2 } from 'lucide-react';

interface Branch { id: string; name: string; address: string; created_at: string; }

export default function BranchesPage() {
  const { session, login } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editBranchId, setEditBranchId] = useState('');
  const [editBranchName, setEditBranchName] = useState('');
  const [editBranchAddress, setEditBranchAddress] = useState('');

  useEffect(() => {
    const fetchBranches = async () => {
      if (!session?.tenantId) return;
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('*')
          .eq('tenant_id', session.tenantId)
          .order('created_at', { ascending: true });
        
        if (error) throw error;
        setBranches(data || []);
      } catch (error) {
        console.error("Gagal memuat cabang:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchBranches();
  }, [session?.tenantId]);

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.tenantId) return;
    setIsSaving(true);
    try {
      const { data, error } = await supabase.from('branches').insert({
        tenant_id: session.tenantId, name: newBranchName, address: newBranchAddress
      }).select().single();
      if (error) throw error;

      setBranches(prev => [...prev, data]);
      setIsAddOpen(false);
      setNewBranchName(''); setNewBranchAddress('');
    } catch (error: unknown) {
      alert("Gagal menambah cabang.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const { error } = await supabase.from('branches').update({
        name: editBranchName, address: editBranchAddress
      }).eq('id', editBranchId);
      if (error) throw error;

      setBranches(prev => prev.map(b => b.id === editBranchId ? { ...b, name: editBranchName, address: editBranchAddress } : b));
      setIsEditOpen(false);
    } catch (error: unknown) {
      alert("Gagal mengedit cabang.");
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = (branch: Branch) => {
    setEditBranchId(branch.id); setEditBranchName(branch.name); setEditBranchAddress(branch.address || ''); setIsEditOpen(true);
  };

  // FITUR BARU 1: HAPUS CABANG
  const handleDeleteBranch = async (branchId: string, branchName: string) => {
    if (branches.length <= 1) {
      alert("Usaha harus memiliki minimal 1 cabang.");
      return;
    }
    if (branchId === session?.branchId) {
      alert("Tidak bisa menghapus cabang yang sedang aktif digunakan. Silakan beralih ke cabang lain terlebih dahulu.");
      return;
    }
    if (!confirm(`Hapus permanen cabang "${branchName}"? Semua data transaksi dan inventaris di cabang ini akan ikut terhapus.`)) return;

    try {
      const { error } = await supabase.from('branches').delete().eq('id', branchId);
      if (error) throw error;
      setBranches(prev => prev.filter(b => b.id !== branchId));
    } catch (error) {
      alert("Gagal menghapus cabang. Pastikan tidak ada data yang mengunci.");
    }
  };

  // FITUR BARU 2: BERALIH CABANG AKTIF
  const handleSwitchBranch = (branchId: string) => {
    if (!session || session.branchId === branchId) return;
    
    // Perbarui sesi dengan branchId yang baru
    login({ ...session, branchId });
    
    // Hard reload agar seluruh dashboard membaca data cabang yang baru
    window.location.assign(window.location.origin + '/branches');
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manajemen Cabang</h1>
          <p className="text-gray-500 mt-1">Kelola lokasi dan pilih cabang yang ingin dipantau.</p>
        </div>
        <button onClick={() => setIsAddOpen(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
          <Plus size={20} /> Tambah Cabang
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? <p className="text-gray-500">Memuat data cabang...</p> : branches.length === 0 ? <p className="text-gray-500">Belum ada cabang.</p> : (
          branches.map(b => {
            const isActive = b.id === session?.branchId;
            return (
              <div key={b.id} className={`bg-white p-6 rounded-xl border-2 transition relative flex flex-col gap-3 group ${isActive ? 'border-green-500 shadow-md' : 'border-gray-200 hover:shadow-md'}`}>
                
                {isActive && (
                  <span className="absolute top-4 right-4 bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                    <CheckCircle2 size={14} /> Dipantau Saat Ini
                  </span>
                )}

                <div className="flex justify-between items-start">
                  <div className={`p-3 rounded-lg w-fit ${isActive ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    <Store size={24} />
                  </div>
                  
                  {/* Tombol Aksi Kanan Atas */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => openEditModal(b)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit">
                      <Edit2 size={16} />
                    </button>
                    {!isActive && (
                      <button onClick={() => handleDeleteBranch(b.id, b.name)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Hapus">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{b.name}</h3>
                  <p className="text-sm text-gray-500 flex items-start gap-1 mt-1">
                    <MapPin size={16} className="shrink-0 mt-0.5 text-gray-400"/> {b.address || 'Alamat belum diatur'}
                  </p>
                </div>

                {!isActive && (
                  <button onClick={() => handleSwitchBranch(b.id)} className="mt-auto pt-4 flex items-center text-blue-600 font-semibold hover:text-blue-800 transition">
                    Pantau Cabang Ini
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Tambah & Edit (Sama dengan sebelumnya, dihilangkan untuk efisiensi baris instruksi. Anda bisa menyalin dari kode Anda sebelumnya) */}
      {/* MODAL TAMBAH */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Tambah Cabang</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddBranch} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Cabang</label>
                <input required type="text" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                <textarea required rows={3} value={newBranchAddress} onChange={(e) => setNewBranchAddress(e.target.value)} className="w-full p-2 border rounded-lg" />
              </div>
              <button type="submit" disabled={isSaving} className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg hover:bg-blue-700 transition">Simpan</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Edit Cabang</h2>
              <button onClick={() => setIsEditOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={24} /></button>
            </div>
            <form onSubmit={handleEditBranch} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Cabang</label>
                <input required type="text" value={editBranchName} onChange={(e) => setEditBranchName(e.target.value)} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                <textarea required rows={3} value={editBranchAddress} onChange={(e) => setEditBranchAddress(e.target.value)} className="w-full p-2 border rounded-lg" />
              </div>
              <button type="submit" disabled={isSaving} className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg hover:bg-blue-700 transition">Simpan Perubahan</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}