'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import Image from 'next/image';
import { Store, User, Mail, Lock, ArrowRight, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'; 

/**
 * Halaman pendaftaran akun untuk pemilik usaha maupun pegawai/kasir.
 * Pemilik juga membuat data usaha dan cabang pusat saat mendaftar.
 */
export default function RegisterPage() {
  // Status halaman dan kontrol tampilan formulir.
  const [isLoading, setIsLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(true); 
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Nilai semua input disimpan bersama agar dapat diperbarui melalui satu handler.
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', tenantName: ''
  });

  // Memperbarui field yang berubah dan menyembunyikan error lama saat pengguna mencoba lagi.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (status === 'error') setStatus('idle');
  };

  // Membuat akun autentikasi, lalu menyimpan profil sesuai jenis pendaftar.
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus('idle');

    try {
      // Buat akun autentikasi menggunakan email dan kata sandi yang diisi.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) throw authError;

      // Supabase dapat mengembalikan user tanpa identity jika email sudah pernah digunakan.
      if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
        throw new Error("Email ini sudah terdaftar. Silakan gunakan email lain atau langsung masuk ke akun Anda.");
      }

      if (!authData.user) throw new Error("Gagal membuat akun.");

      const userId = authData.user.id;

      if (isOwner) {
        // Pemilik mendapat tenant dan cabang pusat baru untuk usaha yang didaftarkan.
        const { data: tenantData, error: tenantErr } = await supabase
          .from('tenants').insert({ name: formData.tenantName }).select().single();
        if (tenantErr) throw tenantErr;

        // Siapkan cabang awal; alamat dapat dilengkapi setelah pendaftaran.
        const { data: branchData, error: branchErr } = await supabase
          .from('branches').insert({ tenant_id: tenantData.id, name: 'Cabang Pusat', address: 'Alamat belum diatur' }).select().single();
        if (branchErr) throw branchErr;

        // Simpan profil pemilik dengan referensi ke tenant dan cabang yang baru dibuat.
        const { error: userErr } = await supabase
          .from('users').insert({
            id: userId, email: formData.email, name: formData.name, role: 'owner',
            tenant_id: tenantData.id, branch_id: branchData.id
          });
        if (userErr) throw userErr;

        // Catat hubungan pemilik dengan usaha dan cabang pada tabel relasi.
        const { error: junctionErr } = await supabase
          .from('user_tenants').insert({
            user_id: userId, tenant_id: tenantData.id, branch_id: branchData.id, role: 'owner'
          });
        if (junctionErr) throw junctionErr;

      } else {
        // Pendaftar pegawai dibuat sebagai kasir tanpa membuat tenant atau cabang baru.
        const { error: userErr } = await supabase
          .from('users').insert({
            id: userId, email: formData.email, name: formData.name, role: 'cashier'
          });
        if (userErr) throw userErr;
      }

      // Alihkan tampilan ke konfirmasi pendaftaran yang berhasil.
      setStatus('success');

    } catch (error: unknown) {
      // Ambil pesan dari error yang diterima agar dapat ditampilkan kepada pengguna.
      let msg = "Terjadi kesalahan sistem saat mendaftar.";
      if (error instanceof Error) msg = error.message;
      else if (error && typeof error === 'object' && 'message' in error) msg = String(error.message);

      setErrorMessage(msg);
      setStatus('error');
    } finally {
      // Selalu pulihkan tombol pendaftaran setelah permintaan selesai.
      setIsLoading(false);
    }
  };

  // Tampilkan instruksi konfirmasi email setelah proses pendaftaran sukses.
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 p-8 text-center relative">
          {/* Tautan opsional untuk kembali ke beranda. */}
          <Link 
            href="/" 
            className="absolute top-4 left-4 p-2 text-gray-400 hover:text-gray-600 transition"
            title="Kembali ke Beranda"
          >
            <ArrowLeft size={20} />
          </Link>
          {/* Ikon menandai bahwa data pendaftaran berhasil dikirim. */}
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 mt-4">
            <CheckCircle size={40} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Pendaftaran Berhasil!</h2>
          {/* Tampilkan alamat yang perlu diperiksa untuk mengaktifkan akun. */}
          <p className="text-gray-600 mb-8 leading-relaxed">
            Kami telah mengirimkan tautan konfirmasi ke <br/>
            <span className="font-bold text-gray-900">{formData.email}</span>. <br/><br/>
            Silakan periksa kotak masuk atau folder spam Anda untuk mengaktifkan akun sebelum mulai masuk.
          </p>
          {/* Pengguna dapat melanjutkan ke halaman masuk setelah konfirmasi email. */}
          <Link href="/login" className="inline-block w-full bg-blue-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-blue-700 transition">
            Kembali ke Halaman Login
          </Link>
        </div>
      </div>
    );
  }

  // Form pendaftaran utama; bidang nama usaha hanya diperlukan untuk pemilik.
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 relative">
        {/* Navigasi kembali ke beranda tersedia pada kedua mode pendaftaran. */}
        <Link 
          href="/" 
          className="absolute top-4 left-4 z-10 p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white transition group"
          title="Kembali ke Beranda"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        </Link>

        {/* Header menyesuaikan judul dengan jenis akun yang dipilih. */}
        <div className="bg-blue-600 p-6 pt-10 text-center text-white relative">
          {/* Latar putih membantu logo tetap terlihat pada header berwarna biru. */}
          <div className="bg-white rounded-lg p-2 w-32 flex items-center justify-center mx-auto mb-4 shadow-sm">
             <Image 
               src="/logo.svg" 
               alt="Logo Sistem" 
               width={120} 
               height={40} 
               className="h-10 w-auto"
               style={{ width: 'auto' }}
               priority
             />
          </div>
          <h2 className="text-2xl font-bold">{isOwner ? 'Mulai Usaha Anda' : 'Daftar Pegawai'}</h2>
          <p className="text-blue-100 text-sm mt-1">Buat akun untuk masuk ke dalam sistem.</p>
        </div>

        {/* Formulir menggunakan handler yang sama untuk mode pemilik maupun pegawai. */}
        <form onSubmit={handleRegister} className="p-6 space-y-4">

          {/* Tampilkan pesan kegagalan agar pengguna dapat memperbaiki input atau mencoba lagi. */}
          {status === 'error' && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-2 text-sm animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p>{errorMessage}</p>
            </div>
          )}

          {/* Pilihan mode menentukan peran akun dan data usaha yang perlu dibuat. */}
          <div className="flex p-1 bg-gray-100 rounded-lg mb-6">
            <button type="button" onClick={() => setIsOwner(true)} className={`flex-1 py-2 text-sm font-bold rounded-md transition ${isOwner ? 'bg-white text-blue-600 shadow' : 'text-gray-500'}`}>
              Pemilik Usaha
            </button>
            <button type="button" onClick={() => setIsOwner(false)} className={`flex-1 py-2 text-sm font-bold rounded-md transition ${!isOwner ? 'bg-white text-blue-600 shadow' : 'text-gray-500'}`}>
              Pegawai / Kasir
            </button>
          </div>

          {/* Nama lengkap digunakan sebagai identitas profil pengguna. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input required type="text" name="name" value={formData.name} onChange={handleChange} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" placeholder="Budi Santoso" />
            </div>
          </div>

          {/* Email digunakan untuk autentikasi dan menerima tautan konfirmasi. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Aktif</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input required type="email" name="email" value={formData.email} onChange={handleChange} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" placeholder="budi@email.com" />
            </div>
          </div>

          {/* Kata sandi minimal enam karakter dan dapat ditampilkan sementara untuk diperiksa. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                required 
                type={showPassword ? "text" : "password"} 
                name="password" 
                value={formData.password} 
                onChange={handleChange} 
                minLength={6} 
                className="w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" 
                placeholder="Minimal 6 karakter" 
              />
              {/* Tombol ikon hanya mengubah visibilitas teks kata sandi. */}
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                tabIndex={-1}
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </div>

          {/* Nama usaha wajib diisi saat mendaftar sebagai pemilik. */}
          {isOwner && (
            <div className="pt-2">
              <label className="block text-sm font-bold text-blue-700 mb-1">Nama Toko / Usaha Anda</label>
              <div className="relative">
                <Store size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
                <input required={isOwner} type="text" name="tenantName" value={formData.tenantName} onChange={handleChange} className="w-full pl-10 pr-4 py-2 border-2 border-blue-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-blue-50/30" placeholder="Contoh: Toko Kopi Senja" />
              </div>
            </div>
          )}

          {/* Nonaktifkan pengiriman selama proses berlangsung untuk mencegah permintaan ganda. */}
          <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition flex items-center justify-center gap-2 mt-4">
            {isLoading ? 'Memproses...' : 'Daftar Sekarang'} <ArrowRight size={18} />
          </button>

          {/* Tautan untuk pengguna yang sudah memiliki akun. */}
          <p className="text-center text-sm text-gray-600 mt-4">
            Sudah punya akun? <Link href="/login" className="text-blue-600 font-bold hover:underline">Masuk di sini</Link>
          </p>
        </form>
      </div>
    </div>
  );
}