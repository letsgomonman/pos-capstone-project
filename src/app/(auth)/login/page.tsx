'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from '@/hooks/useSession';
import { Store, Mail, Lock, LogIn, Eye, EyeOff, ArrowLeft, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  
  // State untuk penanganan pesan gagal
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email, password,
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Sesi pengguna tidak valid.");

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (userError) throw new Error("Data profil usaha tidak ditemukan. Harap daftar ulang.");

      login({
        userId: authData.user.id,
        name: userData.name,
        role: userData.role,
        tenantId: userData.tenant_id,
        branchId: userData.branch_id
      });

      if (userData.role === 'cashier') {
        window.location.assign(window.location.origin + '/pos');
      } else {
        window.location.assign(window.location.origin + '/analytics');
      }

    } catch (error: unknown) {
      let msg = "Terjadi kesalahan sistem.";
      if (error instanceof Error) msg = error.message;
      else if (error && typeof error === 'object' && 'message' in error) msg = String(error.message);
      else msg = String(error);

      if (msg.includes('Invalid login credentials')) msg = "Email atau Password salah.";
      if (msg.includes('Email not confirmed')) msg = "Email belum diverifikasi. Silakan periksa kotak masuk email Anda.";
      
      console.error("Login Error:", msg);
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 relative">
        
        {/* Tombol Kembali ke Beranda */}
        <Link 
          href="/" 
          className="absolute top-4 left-4 z-10 p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white transition group"
          title="Kembali ke Beranda"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        </Link>

        <div className="bg-blue-600 p-6 pt-10 text-center text-white relative">
          <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <Store size={32} />
          </div>
          <h2 className="text-2xl font-bold">Masuk ke Dasbor</h2>
          <p className="text-blue-100 text-sm mt-1">Kelola penjualan dan pantau usaha Anda.</p>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          
          {/* Penampil Pesan Error */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-2 text-sm animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                required 
                type="email" 
                value={email} 
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }} 
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
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }} 
                className="w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white" 
                placeholder="••••••••" 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-bold p-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition flex items-center justify-center gap-2 mt-6">
            {isLoading ? 'Memproses...' : 'Masuk'} <LogIn size={18} />
          </button>

          <div className="text-center pt-2">
            <p className="text-sm text-gray-600">
              Belum memiliki akun?{' '}
              <Link href="/register" className="text-blue-600 font-bold hover:text-blue-800 hover:underline transition">
                Daftar Sekarang
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}