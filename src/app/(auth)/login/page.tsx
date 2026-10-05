'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      // 1. Cek Auth ke Supabase (Jika nanti pakai Supabase Auth bawaan)
      // Untuk MVP / Capstone ini, kita bisa langsung query ke tabel `users`
      // *Catatan: Di level produksi, gunakan password hashing (bcrypt) atau Supabase Auth murni.
      
      const { data: user, error } = await supabase
        .from('users')
        .select('id, tenant_id, branch_id, role, name')
        .eq('email', email)
        .eq('password_hash', password) // Simulasi cek password mentah
        .single();

      if (error || !user) {
        throw new Error('Email atau password salah!');
      }

      // 2. Simpan Sesi Login di LocalStorage (Agar bisa dibaca oleh PWA Kasir)
      localStorage.setItem('pos_session', JSON.stringify({
        userId: user.id,
        tenantId: user.tenant_id,
        branchId: user.branch_id,
        role: user.role,
        name: user.name
      }));

      // 3. Redirect berdasarkan Role (RBAC)
      if (user.role === 'cashier') {
        router.push('/pos');
      } else if (user.role === 'manager' || user.role === 'owner') {
        router.push('/analytics');
      } else {
        throw new Error('Akses tidak dikenali');
      }

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-900">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600">POS Capstone</h1>
          <p className="text-gray-500 mt-2">Masuk ke sistem Multi-Branch Anda</p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-medium border border-red-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              placeholder="kasir@capstone.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg shadow-md hover:bg-blue-700 transition disabled:bg-gray-400"
          >
            {isLoading ? 'Memeriksa kredensial...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}