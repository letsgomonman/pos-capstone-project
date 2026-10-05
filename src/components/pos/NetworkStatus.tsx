'use client';

import { useEffect, useState } from 'react';
import { syncOfflineTransactions } from '@/lib/sync';

export default function NetworkStatus() {
  // 1. Pindahkan pengecekan navigator.onLine langsung ke inisialisasi useState
  // Kita gunakan pengecekan window agar tidak error saat Next.js melakukan SSR
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return navigator.onLine;
    }
    return true; // Asumsi default true saat di-render di server
  });

  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // 2. Baris 'setIsOnline(navigator.onLine)' yang tadinya di sini DIHAPUS.
    
    // Fungsi saat koneksi kembali muncul
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      
      // Jalankan sinkronisasi
      await syncOfflineTransactions();
      
      setIsSyncing(false);
    };

    // Fungsi saat koneksi terputus
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Lakukan pengecekan sinkronisasi tiap 5 menit
    const intervalId = setInterval(() => {
      if (navigator.onLine) {
        syncOfflineTransactions();
      }
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, []); // Dependensi kosong, hanya berjalan saat pertama kali mount

  if (isOnline) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        {isSyncing ? 'Menyinkronkan data...' : 'Online'}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm font-medium text-red-600 bg-red-50 px-3 py-1 rounded-full shadow-sm border border-red-200">
      <span className="w-2 h-2 rounded-full bg-red-500"></span>
      Offline (Data disimpan lokal)
    </div>
  );
}