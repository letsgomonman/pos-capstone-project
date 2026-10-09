'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Plus, Shield, UserCog, Trash2, X, Store } from 'lucide-react';

interface TeamMember {
  id: string;
  role: string;
  branch_id: string;
  users: { id: string; name: string; email: string; };
  branches?: { name: string; };
}

interface Branch {
  id: string;
  name: string;
}

export default function TeamPage() {
  const { session } = useSession();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // State Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('cashier');
  const [newBranchId, setNewBranchId] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!session?.tenantId) return;
      setIsLoading(true);
      try {
        // Ambil Data Tim beserta relasi nama cabangnya
        const { data: teamData, error: teamErr } = await supabase
          .from('user_tenants')
          .select(`id, role, branch_id, users ( id, name, email ), branches ( name )`)
          .eq('tenant_id', session.tenantId);
        
        if (teamErr) throw teamErr;
        setTeam(teamData as unknown as TeamMember[]);

        // Ambil Data Daftar Cabang untuk form Select
        const { data: branchData, error: branchErr } = await supabase
          .from('branches')
          .select('id, name')
          .eq('tenant_id', session.tenantId);
          
        if (branchErr) throw branchErr;
        setBranches(branchData || []);
        if (branchData && branchData.length > 0) setNewBranchId(branchData[0].id);

      } catch (error) {
        console.error("Gagal memuat data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [session?.tenantId]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.tenantId || !newBranchId) return;
    setIsSaving(true);

    try {
      // PERBAIKAN 1: Tarik juga tenant_id untuk validasi keamanan
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('id, name, tenant_id') // <--- Tambahkan tenant_id
        .eq('email', newEmail)
        .single();

      if (userErr || !userData) throw new Error("Email tidak ditemukan. Pastikan karyawan sudah mendaftar (jalur Pegawai).");

      // PERBAIKAN 2: Validasi Anti-Pencurian Karyawan
      if (userData.tenant_id && userData.tenant_id !== session.tenantId) {
        throw new Error("Karyawan ini sudah terdaftar dan bekerja di toko lain. Mereka harus resign (dihapus oleh pemilik sebelumnya) terlebih dahulu.");
      }

      const isExist = team.some(member => member.users?.id === userData.id);
      if (isExist) throw new Error("Pegawai ini sudah menjadi bagian dari tim Anda.");

      // 1. Tambahkan ke Struktur Tim (Tabel user_tenants)
      const { data: newMember, error: insertErr } = await supabase
        .from('user_tenants')
        .insert({
          user_id: userData.id, 
          tenant_id: session.tenantId, 
          branch_id: newBranchId, 
          role: newRole
        })
        .select(`id, role, branch_id, users(id, name, email), branches(name)`)
        .single();
      
      if (insertErr) throw insertErr;

      // 2. Perbarui profil default user di tabel utama
      const { error: updateErr } = await supabase.from('users')
        .update({ 
          tenant_id: session.tenantId, 
          branch_id: newBranchId, 
          role: newRole 
        })
        .eq('id', userData.id);
        
      if (updateErr) {
        // Jika gagal update tabel utama, hapus kembali (Rollback) dari user_tenants agar data tidak inkonsisten
        await supabase.from('user_tenants').delete().eq('id', newMember.id);
        throw new Error("Gagal menyinkronkan profil pegawai. Silakan coba lagi.");
      }

      setTeam(prev => [...prev, newMember as unknown as TeamMember]);
      setIsAddOpen(false);
      setNewEmail('');

    } catch (error: unknown) {
      let msg = "Terjadi kesalahan saat menambah anggota.";
      if (error instanceof Error) msg = error.message;
      else if (error && typeof error === 'object' && 'message' in error) msg = String(error.message);
      alert("Gagal menambah tim: " + msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberRole: string) => {
    if (memberRole === 'owner') return alert("Owner tidak dapat dihapus.");
    if (!confirm("Hapus pegawai ini dari toko Anda?")) return;
    
    try {
      // 1. TANGKAP user_id SEBELUM DIHAPUS
      // (Kita butuh ID asli pegawai dari tabel utama 'users')
      const { data: memberData, error: fetchErr } = await supabase
        .from('user_tenants')
        .select('user_id')
        .eq('id', memberId)
        .single();
        
      if (fetchErr || !memberData) throw new Error("Data pegawai tidak ditemukan.");

      // 2. HAPUS KARTU AKSES (Kode asli Anda)
      const { error: deleteErr } = await supabase
        .from('user_tenants')
        .delete()
        .eq('id', memberId);
        
      if (deleteErr) throw deleteErr;

      // 3. PERBAIKAN PERMANEN: BEBASKAN STATUS PEGAWAI
      // Mengubah tenant_id dan branch_id menjadi null agar mereka jadi "Free Agent"
      const { error: updateErr } = await supabase
        .from('users')
        .update({ 
          tenant_id: null, 
          branch_id: null 
        })
        .eq('id', memberData.user_id);
        
      if (updateErr) throw updateErr;

      // 4. Perbarui antarmuka (UI)
      setTeam(prev => prev.filter(m => m.id !== memberId));
      
    } catch (error) {
      console.error(error);
      alert("Gagal menghapus pegawai.");
    }
  };

  if (session?.role !== 'owner') return <div className="p-8 text-red-500">Akses Ditolak.</div>;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manajemen Tim & Penugasan</h1>
          <p className="text-gray-500 mt-1">Kelola staf dan tentukan lokasi penempatan cabang mereka.</p>
        </div>
        <button onClick={() => setIsAddOpen(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
          <Plus size={20} /> Tambah Pegawai
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm uppercase tracking-wider">
                <th className="p-4 font-semibold">Nama Pegawai</th>
                <th className="p-4 font-semibold">Email</th>
                <th className="p-4 font-semibold">Penempatan Cabang</th>
                <th className="p-4 font-semibold">Jabatan</th>
                <th className="p-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">Memuat data tim...</td></tr>
              ) : team.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">Belum ada anggota tim.</td></tr>
              ) : (
                team.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50 transition">
                    <td className="p-4 font-medium text-gray-900 flex items-center gap-3">
                      <div className={`p-2 rounded-full ${member.role === 'owner' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'}`}>
                        {member.role === 'owner' ? <Shield size={18}/> : <UserCog size={18}/>}
                      </div>
                      {member.users?.name || 'User Tidak Dikenal'}
                    </td>
                    <td className="p-4 text-gray-500">{member.users?.email}</td>
                    
                    {/* INFO CABANG */}
                    <td className="p-4 text-gray-600">
                      {member.role === 'owner' ? (
                        <span className="text-gray-400 italic">Semua Cabang (Pusat)</span>
                      ) : (
                        <span className="flex items-center gap-1"><Store size={16} className="text-blue-500" /> {member.branches?.name || 'Tidak Diketahui'}</span>
                      )}
                    </td>

                    <td className="p-4 capitalize">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${member.role === 'owner' ? 'bg-purple-100 text-purple-700' : member.role === 'manager' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <button onClick={() => handleRemoveMember(member.id, member.role)} disabled={member.role === 'owner'} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TAMBAH PEGAWAI */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Undang Pegawai</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddMember} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Karyawan</label>
                <input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="email@pegawai.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Penempatan Cabang</label>
                <select required value={newBranchId} onChange={(e) => setNewBranchId(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jabatan (Role)</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="cashier">Kasir (Hanya akses layar transaksi)</option>
                  <option value="manager">Manajer (Akses laporan & inventaris)</option>
                </select>
              </div>
              <p className="text-xs leading-relaxed bg-blue-50 p-3 rounded-lg text-blue-800">
                <b>Catatan:</b> Pegawai harus mendaftar akun di halaman Register (Tab: Pegawai) sebelum Anda mendaftarkan email mereka.
              </p>
              <div className="pt-4 border-t">
                <button type="submit" disabled={isSaving || branches.length === 0} className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition">
                  {isSaving ? 'Menyimpan...' : 'Tambahkan ke Tim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}