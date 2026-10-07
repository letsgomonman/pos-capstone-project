'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { 
  LayoutDashboard, Package, Store, ArrowLeftRight, LogOut, ReceiptText, Building2, Users
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, isLoading, initializeSession, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // STATE BARU: Untuk menyimpan nama toko dan cabang
  const [storeName, setStoreName] = useState('Memuat Usaha...');
  const [branchName, setBranchName] = useState('');

  // 1. Inisialisasi Sesi
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // 2. Penjaga Gerbang Khusus Dasbor
  useEffect(() => {
    if (!isLoading) {
      if (!session) {
        router.replace('/login');
      } else if (session.role === 'cashier') {
        router.replace('/pos');
      }
    }
  }, [session, isLoading, router]);

  // 3. TARIK DATA NAMA TOKO & CABANG
  useEffect(() => {
    const fetchStoreInfo = async () => {
      if (!session?.tenantId || !session?.branchId) return;
      try {
        const { data: tenant } = await supabase.from('tenants').select('name').eq('id', session.tenantId).single();
        const { data: branch } = await supabase.from('branches').select('name').eq('id', session.branchId).single();
        
        if (tenant) setStoreName(tenant.name);
        if (branch) setBranchName(branch.name);
      } catch (error) {
        console.error("Gagal memuat info toko:", error);
        setStoreName("Usaha Tidak Dikenal");
      }
    };

    if (session) {
      fetchStoreInfo();
    }
  }, [session]);

  if (isLoading || !session || session.role === 'cashier') {
    return <div className="h-screen flex items-center justify-center bg-gray-50 text-gray-900">Memuat Dasbor...</div>;
  }

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navItems = [
    { name: 'Ringkasan Data', href: '/analytics', icon: LayoutDashboard },
    { name: 'Pilih Usaha', href: '/workspaces', icon: Building2 },
    { name: 'Master Inventory', href: '/inventory', icon: Package },
    { name: 'Manajemen Cabang', href: '/branches', icon: Store },
    { name: 'Manajemen Tim', href: '/team', icon: Users },
    { name: 'Transfer Stok', href: '/transfers', icon: ArrowLeftRight },
    { name: 'Laporan Transaksi', href: '/transactions', icon: ReceiptText },
  ];

  // Filter Menu Berdasarkan Jabatan
  const filteredNavItems = navItems.filter(item => {
    const isRestrictedMenu = item.href === '/workspaces' || item.href === '/team' || item.href === '/branches';
    if (isRestrictedMenu && session.role !== 'owner') return false;
    return true;
  });

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex shrink-0">
        
        {/* HEADER SIDEBAR - MENAMPILKAN INFO USAHA & CABANG */}
        <div className="h-20 flex flex-col justify-center px-6 border-b border-gray-200 bg-blue-50/30">
          <span className="text-blue-700 font-bold text-lg tracking-tight truncate" title={storeName}>
            {storeName}
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <Store size={14} className="text-gray-500 shrink-0" />
            <span className="text-gray-600 text-sm truncate font-medium" title={branchName}>
              {branchName || 'Memuat lokasi...'}
            </span>
          </div>
        </div>

        {/* NAVIGASI MENU */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={20} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* PROFIL USER & LOGOUT */}
        <div className="p-4 border-t border-gray-200 bg-gray-50/50">
          <div className="mb-4 px-3">
            <p className="text-sm font-bold text-gray-800 truncate">{session.name}</p>
            <p className="text-xs text-gray-500 capitalize">{session.role}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition"
          >
            <LogOut size={18} /> Keluar
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}