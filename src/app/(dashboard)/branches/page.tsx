'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Store, Plus, MapPin, X, Edit2 } from 'lucide-react'; // Tambahkan Edit2

interface Branch { id: string; name: string; address: string; created_at: string; }

export default function BranchesPage() {
  const { session } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // State untuk Modal Tambah Cabang
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');

  // State untuk Modal Edit Cabang
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
      const { data, error } = await supabase
        .from('branches')
        .insert({
          tenant_id: session.tenantId,
          name: newBranchName,
          address: newBranchAddress
        })
        .select()
        .single();

      if (error) throw error;

      setBranches(prev => [...prev, data]);
      setIsAddOpen(false);
      setNewBranchName('');
      setNewBranchAddress('');

    } catch (error: unknown) {
      let msg = "Terjadi kesalahan saat menyimpan cabang.";
      if (error instanceof Error) msg = error.message;
      else if (error && typeof error === 'object' && 'message' in error) msg = String(error.message);
      alert("Gagal menambah cabang: " + msg);
    } finally {
      setIsSaving(false);
    }
  };

  // FUNGSI EDIT CABANG
  const openEditModal = (branch: Branch) => {
    setEditBranchId(branch.id);
    setEditBranchName(branch.name);
    setEditBranchAddress(branch.address || '');
    setIsEditOpen(true);
  };

  const handleEditBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('branches')
        .update({
          name: editBranchName,
          address: editBranchAddress
        })
        .eq('id', editBranchId);

      if (error) throw error;

      // Optimistic UI: Perbarui data tabel lokal secara instan
      setBranches(prev => prev.map(b => 
        b.id === editBranchId ? { ...b, name: editBranchName, address: editBranchAddress } : b
      ));

      setIsEditOpen(false);

    } catch (error: unknown) {
      let msg = "Terjadi kesalahan saat memperbarui cabang.";
      if (error instanceof Error) msg = error.message;
      else if (error && typeof error === 'object' && 'message' in error) msg = String(error.message);
      alert("Gagal mengedit cabang: " + msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manajemen Cabang</h1>
          <p className="text-gray-500 mt-1">Daftar lokasi fisik usaha Anda.</p>
        </div>
        <button 
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
          <Plus size={20} /> Tambah Cabang
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? (
          <p className="text-gray-500">Memuat data cabang...</p>
        ) : branches.length === 0 ? (
          <p className="text-gray-500">Belum ada cabang terdaftar.</p>
        ) : (
          branches.map(b => (
            <div key={b.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3 hover:shadow-md transition relative group">
              {/* Header Kartu + Tombol Edit */}
              <div className="flex justify-between items-start">
                <div className="p-3 bg-blue-100 text-blue-700 rounded-lg w-fit">
                  <Store size={24} />
                </div>
                <button 
                  onClick={() => openEditModal(b)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                  title="Edit Informasi Cabang"
                >
                  <Edit2 size={18} />
                </button>
              </div>
              
              <h3 className="text-xl font-bold text-gray-900">{b.name}</h3>
              <p className="text-sm text-gray-500 flex items-start gap-1">
                <MapPin size={16} className="shrink-0 mt-0.5 text-gray-400"/> 
                {b.address || 'Alamat belum diatur'}
              </p>
            </div>
          ))
        )}
      </div>

      {/* MODAL TAMBAH CABANG */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Tambah Cabang Baru</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddBranch} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Cabang</label>
                <input required type="text" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" placeholder="Contoh: Cabang Sudirman" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat Lengkap</label>
                <textarea required rows={3} value={newBranchAddress} onChange={(e) => setNewBranchAddress(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" placeholder="Jl. Jend. Sudirman No. 123..." />
              </div>
              <div className="pt-4 border-t">
                <button type="submit" disabled={isSaving} className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition">
                  {isSaving ? 'Menyimpan...' : 'Simpan Cabang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDIT CABANG */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Edit Informasi Cabang</h2>
              <button onClick={() => setIsEditOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleEditBranch} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Cabang</label>
                <input required type="text" value={editBranchName} onChange={(e) => setEditBranchName(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" placeholder="Contoh: Cabang Sudirman" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat Lengkap</label>
                <textarea required rows={3} value={editBranchAddress} onChange={(e) => setEditBranchAddress(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" placeholder="Jl. Jend. Sudirman No. 123..." />
              </div>
              <div className="pt-4 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setIsEditOpen(false)} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 font-medium">Batal</button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400">
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