'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Plus, Shield, UserCog, Trash2, X, Store } from 'lucide-react';

// Bentuk data keanggotaan yang ditampilkan pada tabel tim.
// `users` dan `branches` berasal dari relasi yang dimuat bersama data anggota.
interface TeamMember {
  id: string;
  role: string;
  branch_id: string;
  users: { id: string; name: string; email: string; };
  branches?: { name: string; };
}

// Data minimum cabang yang dibutuhkan pada pilihan penempatan pegawai.
interface Branch {
  id: string;
  name: string;
}

export default function TeamPage() {
  // Sesi menentukan tenant aktif dan membatasi halaman ini untuk pemilik toko.
  const { session } = useSession();

  // Data yang disajikan di tabel dan pilihan cabang pada formulir.
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Status pemuatan digunakan untuk membedakan proses ambil data dari hasil kosong.
  const [isLoading, setIsLoading] = useState(true);

  // State untuk visibilitas modal, status penyimpanan, dan nilai formulir anggota baru.
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('cashier');
  const [newBranchId, setNewBranchId] = useState('');

  // Muat anggota dan cabang saat tenant sesi tersedia atau berubah.
  useEffect(() => {
    const fetchData = async () => {
      // Tanpa tenant, tidak ada data toko yang dapat diminta.
      if (!session?.tenantId) return;
      setIsLoading(true);
      try {
        // Ambil keanggotaan tenant sekaligus data pengguna dan nama cabangnya.
        const { data: teamData, error: teamErr } = await supabase
          .from('user_tenants')
          .select(`id, role, branch_id, users ( id, name, email ), branches ( name )`)
          .eq('tenant_id', session.tenantId);
        
        if (teamErr) throw teamErr;
        setTeam(teamData as unknown as TeamMember[]);

        // Ambil cabang milik tenant agar pegawai dapat ditempatkan pada cabang yang sesuai.
        const { data: branchData, error: branchErr } = await supabase
          .from('branches')
          .select('id, name')
          .eq('tenant_id', session.tenantId);
          
        if (branchErr) throw branchErr;
        setBranches(branchData || []);
        // Pilih cabang pertama secara otomatis sebagai nilai awal formulir.
        if (branchData && branchData.length > 0) setNewBranchId(branchData[0].id);

      } catch (error) {
        // Catat kegagalan agar masalah pemuatan data dapat ditelusuri.
        console.error("Gagal memuat data:", error);
      } finally {
        // Akhiri indikator pemuatan baik permintaan berhasil maupun gagal.
        setIsLoading(false);
      }
    };
    fetchData();
  }, [session?.tenantId]);

  // Validasi akun yang akan ditambahkan, buat keanggotaan, lalu sinkronkan profilnya.
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    // Tenant dan cabang wajib tersedia sebelum permintaan penyimpanan dilakukan.
    if (!session?.tenantId || !newBranchId) return;
    setIsSaving(true);

    try {
      // Cari akun berdasarkan email; akun harus sudah terdaftar sebelum dapat diundang.
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('id, name, tenant_id')
        .eq('email', newEmail)
        .single();

      if (userErr || !userData) throw new Error("Email tidak ditemukan. Pastikan karyawan sudah mendaftar (jalur Pegawai).");

      // Akun yang masih terikat ke tenant lain tidak boleh ditambahkan ke toko ini.
      if (userData.tenant_id && userData.tenant_id !== session.tenantId) {
        throw new Error("Karyawan ini sudah terdaftar dan bekerja di toko lain. Mereka harus resign (dihapus oleh pemilik sebelumnya) terlebih dahulu.");
      }

      // Cegah satu pengguna memiliki keanggotaan tim ganda di tenant yang sama.
      const isExist = team.some(member => member.users?.id === userData.id);
      if (isExist) throw new Error("Pegawai ini sudah menjadi bagian dari tim Anda.");

      // Simpan penempatan cabang dan jabatan pada tabel keanggotaan tenant.
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

      // Sinkronkan tenant, cabang, dan role pada profil utama agar konsisten.
      const { error: updateErr } = await supabase.from('users')
        .update({ 
          tenant_id: session.tenantId, 
          branch_id: newBranchId, 
          role: newRole 
        })
        .eq('id', userData.id);
        
      if (updateErr) {
        // Batalkan keanggotaan yang baru dibuat jika pembaruan profil gagal.
        await supabase.from('user_tenants').delete().eq('id', newMember.id);
        throw new Error("Gagal menyinkronkan profil pegawai. Silakan coba lagi.");
      }

      // Perbarui tabel dari hasil insert tanpa memuat ulang seluruh halaman.
      setTeam(prev => [...prev, newMember as unknown as TeamMember]);
      // Tutup formulir dan kosongkan email setelah penambahan berhasil.
      setIsAddOpen(false);
      setNewEmail('');

    } catch (error: unknown) {
      // Tampilkan pesan yang paling informatif, termasuk error dari Supabase.
      let msg = "Terjadi kesalahan saat menambah anggota.";
      if (error instanceof Error) msg = error.message;
      else if (error && typeof error === 'object' && 'message' in error) msg = String(error.message);
      alert("Gagal menambah tim: " + msg);
    } finally {
      // Aktifkan kembali tombol formulir setelah permintaan selesai.
      setIsSaving(false);
    }
  };

  // Hapus anggota non-owner setelah konfirmasi, lalu lepaskan akun dari tenant.
  const handleRemoveMember = async (memberId: string, memberRole: string) => {
    // Keanggotaan pemilik dilindungi agar tidak terhapus dari halaman ini.
    if (memberRole === 'owner') return alert("Owner tidak dapat dihapus.");
    if (!confirm("Hapus pegawai ini dari toko Anda?")) return;
    
    try {
      // Simpan ID pengguna sebelum relasi keanggotaan dihapus.
      const { data: memberData, error: fetchErr } = await supabase
        .from('user_tenants')
        .select('user_id')
        .eq('id', memberId)
        .single();
        
      if (fetchErr || !memberData) throw new Error("Data pegawai tidak ditemukan.");

      // Hapus baris yang menghubungkan pengguna dengan tenant dan cabangnya.
      const { error: deleteErr } = await supabase
        .from('user_tenants')
        .delete()
        .eq('id', memberId);
        
      if (deleteErr) throw deleteErr;

      // Lepaskan keterikatan profil agar pegawai dapat bergabung dengan tenant lain.
      const { error: updateErr } = await supabase
        .from('users')
        .update({ 
          tenant_id: null, 
          branch_id: null 
        })
        .eq('id', memberData.user_id);
        
      if (updateErr) throw updateErr;

      // Hapus baris dari tampilan tanpa meminta ulang daftar anggota.
      setTeam(prev => prev.filter(m => m.id !== memberId));
      
    } catch (error) {
      // Catat detail teknis dan tampilkan pemberitahuan kegagalan kepada pemilik.
      console.error(error);
      alert("Gagal menghapus pegawai.");
    }
  };

  // Batasi halaman manajemen tim hanya untuk pengguna dengan role pemilik.
  if (session?.role !== 'owner') return <div className="p-8 text-red-500">Akses Ditolak.</div>;

  return (
    <div className="p-8">
      {/* Judul halaman dan aksi untuk membuka formulir penambahan pegawai. */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manajemen Tim & Penugasan</h1>
          <p className="text-gray-500 mt-1">Kelola staf dan tentukan lokasi penempatan cabang mereka.</p>
        </div>
        <button onClick={() => setIsAddOpen(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
          <Plus size={20} /> Tambah Pegawai
        </button>
      </div>

      {/* Tabel ringkasan anggota, penempatan cabang, jabatan, dan aksi penghapusan. */}
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
              {/* Tampilkan status pemuatan, keadaan kosong, atau daftar anggota. */}
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">Memuat data tim...</td></tr>
              ) : team.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">Belum ada anggota tim.</td></tr>
              ) : (
                team.map((member) => (
                  // Setiap baris mewakili satu keanggotaan dalam tenant.
                  <tr key={member.id} className="hover:bg-gray-50 transition">
                    <td className="p-4 font-medium text-gray-900 flex items-center gap-3">
                      {/* Ikon membedakan pemilik dari anggota tim lainnya. */}
                      <div className={`p-2 rounded-full ${member.role === 'owner' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'}`}>
                        {member.role === 'owner' ? <Shield size={18}/> : <UserCog size={18}/>}
                      </div>
                      {member.users?.name || 'User Tidak Dikenal'}
                    </td>
                    <td className="p-4 text-gray-500">{member.users?.email}</td>
                    
                    {/* Pemilik mewakili seluruh cabang; anggota lain memiliki cabang tertentu. */}
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
                      {/* Tombol hapus dinonaktifkan untuk melindungi keanggotaan pemilik. */}
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

      {/* Formulir modal untuk memilih akun, cabang penempatan, dan role pegawai baru. */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Undang Pegawai</h2>
              {/* Tutup modal tanpa mengirimkan formulir. */}
              <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddMember} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Karyawan</label>
                {/* Email dipakai untuk menemukan akun pegawai yang telah terdaftar. */}
                <input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="email@pegawai.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pilih Penempatan Cabang</label>
                {/* Daftar pilihan hanya memuat cabang milik tenant saat ini. */}
                <select required value={newBranchId} onChange={(e) => setNewBranchId(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jabatan (Role)</label>
                {/* Pemilik dapat memberikan salah satu role pegawai yang tersedia. */}
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="cashier">Kasir (Hanya akses layar transaksi)</option>
                  <option value="manager">Manajer (Akses laporan & inventaris)</option>
                </select>
              </div>
              <p className="text-xs leading-relaxed bg-blue-50 p-3 rounded-lg text-blue-800">
                <b>Catatan:</b> Pegawai harus mendaftar akun di halaman Register (Tab: Pegawai) sebelum Anda mendaftarkan email mereka.
              </p>
              <div className="pt-4 border-t">
                {/* Cegah pengiriman ganda dan penambahan tanpa cabang tersedia. */}
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