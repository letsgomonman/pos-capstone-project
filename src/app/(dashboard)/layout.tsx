'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { 
  LayoutDashboard, Package, Store, ArrowLeftRight, LogOut, ReceiptText, Building2, Users, Landmark
} from 'lucide-react';

/**
 * Kerangka halaman dasbor yang mengatur akses pengguna, identitas usaha,
 * navigasi samping, dan area untuk menampilkan halaman turunan.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Sesi menyediakan status autentikasi, peran, identitas, dan aksi terkait sesi.
  const { session, isLoading, initializeSession, logout } = useSession();
  // Router dipakai untuk mengalihkan pengguna yang tidak berhak mengakses dasbor.
  const router = useRouter();
  // Path aktif dipakai untuk menandai menu yang sedang dibuka.
  const pathname = usePathname();

  // Nilai awal ditampilkan selama nama usaha dan cabang belum berhasil dimuat.
  const [storeName, setStoreName] = useState('Memuat Usaha...');
  const [branchName, setBranchName] = useState('');

  // Inisialisasi atau pemulihan sesi saat komponen dasbor mulai digunakan.
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // Setelah status sesi diketahui, arahkan pengguna tanpa sesi ke login.
  // Kasir menggunakan antarmuka POS, sehingga tidak boleh menetap di dasbor ini.
  useEffect(() => {
    if (!isLoading) {
      if (!session) {
        router.replace('/login');
      } else if (session.role === 'cashier') {
        router.replace('/pos');
      }
    }
  }, [session, isLoading, router]);

  // Ambil nama usaha dan cabang yang terkait dengan sesi untuk ditampilkan di sidebar.
  useEffect(() => {
    // Data identitas tidak dapat dicari tanpa kedua ID konteks dari sesi.
    const fetchStoreInfo = async () => {
      if (!session?.tenantId || !session?.branchId) return;
      try {
        // Ambil nama tenant dan cabang secara terpisah berdasarkan ID pada sesi.
        const { data: tenant } = await supabase.from('tenants').select('name').eq('id', session.tenantId).single();
        const { data: branch } = await supabase.from('branches').select('name').eq('id', session.branchId).single();
        
        // Perbarui masing-masing label hanya jika hasilnya tersedia.
        if (tenant) setStoreName(tenant.name);
        if (branch) setBranchName(branch.name);
      } catch (error) {
        // Catat kegagalan agar dapat ditelusuri dan tampilkan label usaha pengganti.
        console.error("Gagal memuat info toko:", error);
        setStoreName("Usaha Tidak Dikenal");
      }
    };

    // Hindari permintaan data sebelum sesi pengguna tersedia.
    if (session) {
      fetchStoreInfo();
    }
  }, [session]);

  // Tahan render dasbor sampai sesi siap; kondisi tanpa sesi dan kasir akan dialihkan
  // oleh efek autentikasi di atas.
  if (isLoading || !session || session.role === 'cashier') {
    return <div className="h-screen flex items-center justify-center bg-gray-50 text-gray-900">Memuat Dasbor...</div>;
  }

  // Akhiri sesi lalu arahkan pengguna ke halaman login.
  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Daftar lengkap menu dasbor beserta rute dan ikon masing-masing.
  const navItems = [
    { name: 'Ringkasan Data', href: '/analytics', icon: LayoutDashboard },
    { name: 'Pilih Usaha', href: '/workspaces', icon: Building2 },
    { name: 'Master Inventory', href: '/inventory', icon: Package },
    { name: 'Manajemen Cabang', href: '/branches', icon: Store },
    { name: 'Manajemen Tim', href: '/team', icon: Users },
    { name: 'Transfer Stok', href: '/transfers', icon: ArrowLeftRight },
    { name: 'Laporan Transaksi', href: '/transactions', icon: ReceiptText },
    { name: 'Keuangan (SAK EMKM)', href: '/finance', icon: Landmark },
  ];

  // Batasi menu tertentu untuk pemilik; peran lain hanya melihat menu yang diizinkan.
  const filteredNavItems = navItems.filter(item => {
    // Pengelolaan usaha, tim, cabang, dan keuangan hanya tersedia bagi owner.
    const restrictedMenus = ['/workspaces', '/team', '/branches', '/finance'];
    const isRestrictedMenu = restrictedMenus.includes(item.href);
    
    if (isRestrictedMenu && session.role !== 'owner') return false;
    return true;
  });

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      
      {/* Sidebar berisi identitas konteks, menu yang tersedia, dan kontrol akun.
          Sidebar disembunyikan pada layar kecil sesuai perilaku responsif saat ini. */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex shrink-0">
        
        {/* Tampilkan nama usaha dan cabang aktif sebagai konteks halaman dasbor. */}
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

        {/* Render menu sesuai peran dan tandai tautan yang cocok dengan rute aktif. */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {filteredNavItems.map((item) => {
            // Awalan path juga menandai menu aktif pada halaman turunan rute tersebut.
            const isActive = pathname?.startsWith(item.href);
            // Komponen ikon disimpan pada konfigurasi menu agar tiap menu memiliki ikon sendiri.
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

        {/* Tampilkan identitas dan peran pengguna, serta sediakan aksi untuk keluar. */}
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

      {/* Halaman dasbor aktif dirender di area utama yang dapat digulir. */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}