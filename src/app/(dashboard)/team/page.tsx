'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Plus, Shield, UserCog, Trash2, X } from 'lucide-react';

interface TeamMember {
  id: string;
  role: string;
  users: {
    id: string;
    name: string;
    email: string;
  };
}

export default function TeamPage() {
  const { session } = useSession();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // State Modal Tambah Anggota
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('cashier');

  // PERBAIKAN 1: Memindahkan fetchTeam ke dalam useEffect
  useEffect(() => {
    const fetchTeam = async () => {
      if (!session?.tenantId) return;
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_tenants')
          .select(`
            id,
            role,
            users ( id, name, email )
          `)
          .eq('tenant_id', session.tenantId);

        if (error) throw error;
        setTeam(data as unknown as TeamMember[]);
      } catch (error) {
        console.error("Gagal memuat tim:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeam();
  }, [session?.tenantId]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.tenantId) return;
    setIsSaving(true);

    try {
      // 1. Validasi keberadaan email di database pusat
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('id, name')
        .eq('email', newEmail)
        .single();

      if (userErr || !userData) {
        throw new Error("Email tidak ditemukan. Pastikan karyawan sudah mendaftar di halaman pendaftaran.");
      }

      // 2. Cegah duplikasi anggota di toko yang sama
      const isExist = team.some(member => member.users.id === userData.id);
      if (isExist) throw new Error("Pegawai ini sudah menjadi bagian dari tim Anda.");

      // 3. Masukkan ke dalam struktur organisasi toko
      const { data: newMember, error: insertErr } = await supabase
        .from('user_tenants')
        .insert({
          user_id: userData.id,
          tenant_id: session.tenantId,
          role: newRole
        })
        .select(`id, role, users(id, name, email)`)
        .single();

      if (insertErr) throw insertErr;

      // Optimistic UI
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
    if (memberRole === 'owner') {
      alert("Owner tidak dapat dihapus dari sistem.");
      return;
    }
    if (!confirm("Hapus pegawai ini dari toko Anda?")) return;

    try {
      const { error } = await supabase.from('user_tenants').delete().eq('id', memberId);
      if (error) throw error;
      
      setTeam(prev => prev.filter(m => m.id !== memberId));
    } catch (error: unknown) {
      // PERBAIKAN 3: Memanfaatkan variabel error agar terbaca oleh ESLint
      console.error("Error menghapus anggota:", error);
      alert("Gagal menghapus pegawai.");
    }
  };

  if (session?.role !== 'owner') {
    return <div className="p-8 text-red-500">Akses Ditolak. Hanya Owner yang dapat mengelola tim.</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manajemen Tim</h1>
          <p className="text-gray-500 mt-1">Kelola akses manajer dan kasir untuk usaha ini.</p>
        </div>
        <button 
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
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
                <th className="p-4 font-semibold">Jabatan</th>
                <th className="p-4 font-semibold text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-500">Memuat data tim...</td></tr>
              ) : team.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-500">Belum ada anggota tim.</td></tr>
              ) : (
                team.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50 transition">
                    <td className="p-4 font-medium text-gray-900 flex items-center gap-3">
                      <div className={`p-2 rounded-full ${member.role === 'owner' ? 'bg-purple-100 text-purple-600' : member.role === 'manager' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                        {member.role === 'owner' ? <Shield size={18}/> : <UserCog size={18}/>}
                      </div>
                      {member.users?.name || 'User Tidak Dikenal'}
                    </td>
                    <td className="p-4 text-gray-500">{member.users?.email}</td>
                    <td className="p-4 capitalize">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        member.role === 'owner' ? 'bg-purple-100 text-purple-700' : 
                        member.role === 'manager' ? 'bg-blue-100 text-blue-700' : 
                        'bg-green-100 text-green-700'
                      }`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => handleRemoveMember(member.id, member.role)}
                        disabled={member.role === 'owner'}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Hapus Akses"
                      >
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
              <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleAddMember} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Karyawan</label>
                <input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" placeholder="email@pegawai.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jabatan (Role)</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white">
                  <option value="cashier">Kasir (Hanya akses layar mesin kasir)</option>
                  <option value="manager">Manajer (Akses laporan & inventaris)</option>
                </select>
              </div>
              
              {/* PERBAIKAN 4: Menghapus text-gray-500 untuk menghindari bentrok dengan text-blue-800 */}
              <p className="text-xs leading-relaxed bg-blue-50 p-3 rounded-lg text-blue-800">
                <b>Catatan:</b> Pegawai harus mendaftar akun di halaman Register terlebih dahulu sebelum Anda dapat mendaftarkan email mereka ke toko ini.
              </p>

              <div className="pt-4 border-t">
                <button type="submit" disabled={isSaving} className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition">
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