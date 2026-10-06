'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Store, User, Mail, Lock, ArrowRight } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    tenantName: '' // Nama Usaha
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // 1. Daftarkan email & password ke Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Gagal membuat akun autentikasi.");

      const userId = authData.user.id;

      // 2. Buat entitas Usaha (Tenant)
      const { data: tenantData, error: tenantErr } = await supabase
        .from('tenants')
        .insert({ name: formData.tenantName })
        .select()
        .single();

      if (tenantErr) throw tenantErr;

      // 3. Buat Cabang Default (Pusat)
      const { data: branchData, error: branchErr } = await supabase
        .from('branches')
        .insert({
          tenant_id: tenantData.id,
          name: 'Cabang Pusat',
          address: 'Alamat belum diatur'
        })
        .select()
        .single();

      if (branchErr) throw branchErr;

      // 4. Buat Profil di tabel custom 'users'
      const { error: userErr } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: formData.email,
          name: formData.name,
          role: 'owner', // Pendaftar pertama otomatis jadi Owner
          tenant_id: tenantData.id, // Relasi warisan (opsional)
          branch_id: branchData.id  // Cabang tempat owner login
        });

      if (userErr) throw userErr;

      // 5. Daftarkan relasi ke tabel junction SaaS (user_tenants)
      const { error: junctionErr } = await supabase
        .from('user_tenants')
        .insert({
          user_id: userId,
          tenant_id: tenantData.id,
          role: 'owner'
        });

      if (junctionErr) throw junctionErr;

      alert("Pendaftaran Berhasil! Usaha Anda telah dibuat.");
      router.push('/login');

    } catch (error: unknown) {
      // PERBAIKAN: Validasi tipe error yang ketat tanpa menggunakan 'any'
      let msg = "Terjadi kesalahan sistem.";
      if (error instanceof Error) {
        msg = error.message;
      } else if (error && typeof error === 'object' && 'message' in error) {
        msg = String(error.message);
      } else {
        msg = String(error);
      }
      
      console.error("Register Error:", msg);
      alert("Pendaftaran Gagal: " + msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="bg-blue-600 p-6 text-center text-white">
          <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Store size={32} />
          </div>
          <h2 className="text-2xl font-bold">Mulai Usaha Anda</h2>
          <p className="text-blue-100 text-sm mt-1">Daftar gratis untuk kelola toko dengan mudah.</p>
        </div>

        <form onSubmit={handleRegister} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Pemilik</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                required 
                type="text" 
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" 
                placeholder="Budi Santoso" 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Aktif</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                required 
                type="email" 
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" 
                placeholder="budi@email.com" 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                required 
                type="password" 
                name="password"
                value={formData.password}
                onChange={handleChange}
                minLength={6}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" 
                placeholder="Minimal 6 karakter" 
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-sm font-bold text-blue-700 mb-1">Nama Toko / Usaha Anda</label>
            <div className="relative">
              <Store size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
              <input 
                required 
                type="text" 
                name="tenantName"
                value={formData.tenantName}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-2 border-2 border-blue-100 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-blue-50/30" 
                placeholder="Contoh: Toko Kopi Senja" 
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition flex items-center justify-center gap-2 mt-4"
          >
            {isLoading ? 'Memproses...' : 'Daftar Sekarang'} <ArrowRight size={18} />
          </button>

          <p className="text-center text-sm text-gray-600 mt-4">
            Sudah punya akun? {' '}
            <Link href="/login" className="text-blue-600 font-bold hover:underline">
              Masuk di sini
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}