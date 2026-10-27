'use client';

import { useEffect, useState } from 'react';
import { syncOfflineTransactions } from '@/lib/sync';

export default function NetworkStatus() {
  // Status jaringan: inisialisasi aman untuk SSR.
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });

  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Status jaringan: pantau koneksi dan sinkronisasi transaksi.
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      await syncOfflineTransactions();
      setIsSyncing(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Status jaringan: sinkronisasi berkala setiap 5 menit.
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
  }, []);

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