'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Building2, Plus, CheckCircle2, ArrowRight, X, Trash2 } from 'lucide-react';

// Bentuk data workspace yang dipakai oleh daftar pada halaman ini.
interface TenantData {
  id: string;
  name: string;
}

// Halaman untuk pemilik usaha: melihat, membuat, menghapus, dan memilih workspace.
export default function WorkspacesPage() {
  const { session, login } = useSession();

  // Data yang ditampilkan serta status saat daftar workspace sedang dimuat.
  const [workspaces, setWorkspaces] = useState<TenantData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Status dan nilai formulir pembuatan usaha baru.
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');

  // Ambil workspace milik pengguna setiap kali identitas atau perannya berubah.
  useEffect(() => {
    const fetchWorkspaces = async () => {
      // Hanya pemilik yang memiliki daftar workspace untuk ditampilkan.
      if (!session?.userId || session.role !== 'owner') {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_tenants')
          .select('tenant_id, tenants (id, name)')
          .eq('user_id', session.userId)
          .eq('role', 'owner');

        if (error) throw error;
        
        // Ubah relasi Supabase menjadi bentuk sederhana yang dipakai komponen.
        // Abaikan relasi tenant yang tidak tersedia agar data yatim tidak ditampilkan.
        const formattedWorkspaces = (data || []).map((item: unknown) => {
          const row = item as { tenants: { id: string; name: string } | null };
          return {
            id: row.tenants?.id || '',
            name: row.tenants?.name || 'Usaha Tidak Dikenal'
          };
        }).filter(w => w.id !== '');

        setWorkspaces(formattedWorkspaces);
      } catch (error) {
        // Catat kegagalan agar masalah pemuatan dapat ditelusuri di konsol.
        console.error("Gagal memuat daftar usaha:", error);
      } finally {
        // Selalu hentikan indikator pemuatan, baik permintaan berhasil maupun gagal.
        setIsLoading(false);
      }
    };

    fetchWorkspaces();
  }, [session?.userId, session?.role]);

  // Buat usaha baru beserta cabang pusat dan hubungan kepemilikannya.
  const handleAddWorkspace = async (e: React.FormEvent) => {
    // Cegah browser mengirim formulir dengan memuat ulang halaman.
    e.preventDefault();
    if (!session?.userId) return;
    setIsSaving(true);

    try {
      // Buat tenant terlebih dahulu karena ID-nya dibutuhkan oleh data berikutnya.
      const { data: tenantData, error: tenantErr } = await supabase
        .from('tenants')
        .insert({ name: newTenantName })
        .select().single();
      if (tenantErr) throw tenantErr;

      // Setiap tenant baru langsung mendapat cabang pusat sebagai cabang awal.
      const { data: branchData, error: branchErr } = await supabase
        .from('branches')
        .insert({
          tenant_id: tenantData.id,
          name: 'Cabang Pusat',
          address: 'Alamat belum diatur'
        })
        .select().single();
      if (branchErr) throw branchErr;

      // Simpan hubungan antara pengguna, tenant, cabang awal, dan peran pemilik.
      const { error: junctionErr } = await supabase
        .from('user_tenants')
        .insert({
          user_id: session.userId,
          tenant_id: tenantData.id,
          branch_id: branchData.id,
          role: 'owner'
        });
      if (junctionErr) throw junctionErr;

      // Tampilkan hasil tanpa memuat ulang daftar, lalu bersihkan formulir.
      setWorkspaces(prev => [...prev, tenantData]);
      setIsAddOpen(false);
      setNewTenantName('');

    } catch (error: unknown) {
      // Tampilkan pesan dari server bila tersedia, atau gunakan pesan umum.
      let msg = "Terjadi kesalahan saat menyimpan usaha.";
      if (error instanceof Error) msg = error.message;
      else if (error && typeof error === 'object' && 'message' in error) msg = String(error.message);
      alert("Gagal membuat usaha: " + msg);
    } finally {
      // Aktifkan kembali kontrol formulir setelah proses selesai.
      setIsSaving(false);
    }
  };

  // Jadikan workspace terpilih sebagai tenant dan cabang aktif pengguna.
  const handleSwitchWorkspace = async (tenantId: string) => {
    if (!session || !session.userId) return;
    setIsSaving(true);
    
    try {
      // Pilih cabang tertua sebagai cabang aktif untuk workspace tujuan.
      const { data: branchData, error: branchErr } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (branchErr) throw new Error("Usaha ini belum memiliki cabang.");

      // Simpan pilihan tenant dan cabang aktif pada profil pengguna.
      const { error: updateErr } = await supabase
        .from('users')
        .update({
          tenant_id: tenantId,
          branch_id: branchData.id
        })
        .eq('id', session.userId);

      if (updateErr) throw updateErr;

      // Sinkronkan sesi lokal sebelum mengarahkan pengguna ke halaman analitik.
      login({
        ...session,
        tenantId: tenantId,
        branchId: branchData.id
      }); 
      
      window.location.assign(window.location.origin + '/analytics'); 

    } catch (error: unknown) {
      // Jika perpindahan gagal, beri tahu pengguna dan pulihkan kontrol aksi.
      let msg = "Terjadi kesalahan saat beralih usaha.";
      if (error instanceof Error) msg = error.message;
      alert(msg);
      setIsSaving(false);
    }
  };

  // Hapus workspace yang tidak sedang aktif setelah konfirmasi pengguna.
  const handleDeleteWorkspace = async (tenantId: string, tenantName: string) => {
    // Hindari menghapus tenant yang sedang dipakai dalam sesi ini.
    if (tenantId === session?.tenantId) {
      alert("Tidak bisa menghapus usaha yang sedang Anda gunakan. Beralihlah ke usaha lain terlebih dahulu.");
      return;
    }
    // Penghapusan tenant dapat menghapus data terkait secara permanen.
    if (!confirm(`Peringatan Keras: Hapus PERMANEN usaha "${tenantName}"? Seluruh cabang, produk, dan transaksi akan ikut musnah.`)) return;

    try {
      const { error } = await supabase.from('tenants').delete().eq('id', tenantId);
      if (error) throw error;
      // Hapus kartu dari tampilan setelah penghapusan di server berhasil.
      setWorkspaces(prev => prev.filter(w => w.id !== tenantId));
    } catch (error: unknown) {
      // Laporkan kegagalan dan petunjuk konfigurasi relasi yang mungkin terkait.
      console.error("Gagal menghapus usaha:", error);
      alert("Gagal menghapus usaha. Pastikan pengaturan ON DELETE CASCADE di database Anda sudah aktif.");
    }
  };

  // Batasi halaman ini untuk pengguna dengan peran pemilik usaha.
  if (session?.role !== 'owner') {
    return <div className="p-8 text-center text-red-500 font-bold">Akses Ditolak. Halaman khusus Pemilik Usaha.</div>;
  }

  return (
    <div className="p-8">
      {/* Judul halaman dan tombol untuk membuka formulir pembuatan workspace. */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pilih Usaha Anda</h1>
          <p className="text-gray-500 mt-1">Kelola atau beralih ke usaha lain yang terhubung dengan akun ini.</p>
        </div>
        <button 
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
          <Plus size={20} /> Buat Usaha Baru
        </button>
      </div>

      {/* Tampilkan indikator pemuatan, keadaan kosong, atau kartu workspace. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? (
          <p className="text-gray-500">Memuat daftar usaha...</p>
        ) : workspaces.length === 0 ? (
          <p className="text-gray-500">Tidak ada usaha yang terhubung.</p>
        ) : (
          workspaces.map(w => {
            // Bandingkan dengan tenant sesi untuk menandai workspace aktif.
            const isActive = w.id === session?.tenantId;

            return (
              <div 
                key={w.id} 
                className={`bg-white p-6 rounded-xl border-2 transition relative flex flex-col gap-3 group ${
                  isActive ? 'border-green-500 shadow-md' : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                {/* Penanda visual khusus untuk workspace yang sedang digunakan. */}
                {isActive && (
                  <span className="absolute top-4 right-4 bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                    <CheckCircle2 size={14} /> Aktif Saat Ini
                  </span>
                )}

                <div className="flex justify-between items-start">
                  <div className={`p-3 rounded-lg w-fit ${isActive ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    <Building2 size={24} />
                  </div>
                  
                  {/* Workspace aktif tidak dapat dihapus dari kartu ini. */}
                  {!isActive && (
                    <button 
                      onClick={() => handleDeleteWorkspace(w.id, w.name)} 
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition" 
                      title="Hapus Usaha"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{w.name}</h3>
                  <p className="text-sm text-gray-500 capitalize">Akses Anda: Owner</p>
                </div>

                {/* Sediakan aksi berpindah hanya untuk workspace selain yang aktif. */}
                {!isActive && (
                  <button 
                    onClick={() => handleSwitchWorkspace(w.id)}
                    disabled={isSaving}
                    className="mt-auto pt-4 flex items-center text-blue-600 font-semibold hover:text-blue-800 transition group/btn"
                  >
                    Gunakan Usaha Ini <ArrowRight size={16} className="ml-2 group-hover/btn:translate-x-1 transition-transform" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Dialog modal untuk memasukkan nama dan membuat usaha baru. */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Buat Usaha Baru</h2>
              {/* Tombol ini hanya menutup modal tanpa membuat usaha. */}
              <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            {/* Form memvalidasi nama wajib diisi sebelum menjalankan proses pembuatan. */}
            <form onSubmit={handleAddWorkspace} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Usaha / Merek</label>
                <input 
                  required 
                  type="text" 
                  value={newTenantName} 
                  onChange={(e) => setNewTenantName(e.target.value)} 
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" 
                  placeholder="Contoh: Toko Maju Jaya" 
                />
              </div>
              <p className="text-xs text-gray-500">Cabang Pusat akan dibuat secara otomatis untuk usaha baru ini.</p>
              <div className="pt-4 border-t flex justify-end gap-2">
                {/* Tombol batal menutup dialog; tidak mengirim formulir. */}
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 font-medium">Batal</button>
                {/* Nonaktifkan pengiriman selama penyimpanan dan tampilkan statusnya. */}
                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400">
                  {isSaving ? 'Menyimpan...' : 'Buat Usaha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}