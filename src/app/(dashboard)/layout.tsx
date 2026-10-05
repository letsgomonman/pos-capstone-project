'use client';

import { useSession } from '@/hooks/useSession';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react'; // Tambahkan useEffect
import { 
  LayoutDashboard, 
  Package, 
  Store, 
  ArrowLeftRight, 
  LogOut,
  ReceiptText
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // PERBAIKAN: Pindahkan logika redirect ke dalam useEffect agar tidak bentrok dengan proses render React
  useEffect(() => {
    if (!isLoading) {
      if (!session || (session.role !== 'manager' && session.role !== 'owner' && session.role !== 'superadmin')) {
        router.replace('/login');
      }
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-gray-50 text-gray-900">Memuat sesi...</div>;
  }

  // Sembunyikan UI dan tunggu useEffect melakukan redirect jika user tidak sah
  if (!session || (session.role !== 'manager' && session.role !== 'owner' && session.role !== 'superadmin')) {
    return null; 
  }

  const handleLogout = () => {
    localStorage.removeItem('pos_session');
    router.push('/login');
  };

  const navItems = [
    { name: 'Ringkasan Data', href: '/analytics', icon: LayoutDashboard },
    { name: 'Master Inventory', href: '/inventory', icon: Package },
    { name: 'Manajemen Cabang', href: '/branches', icon: Store },
    { name: 'Transfer Stok', href: '/transfers', icon: ArrowLeftRight },
    { name: 'Laporan Transaksi', href: '/transactions', icon: ReceiptText },
  ];

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <span className="text-blue-600 font-bold text-xl tracking-tight">POS Capstone</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg font-medium transition-colors ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={20} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="mb-4 px-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Login sebagai</p>
            <p className="text-sm font-bold text-gray-800 truncate">{session.name}</p>
            <p className="text-xs text-gray-500 capitalize">{session.role}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-left text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
          >
            <LogOut size={20} />
            Keluar
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}