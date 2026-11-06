'use client';

import { useEffect, useState } from 'react';
import { syncOfflineTransactions } from '@/lib/sync';

/**
 * Menampilkan kondisi koneksi saat ini dan status sinkronisasi transaksi offline.
 * Komponen ini juga mencoba menyinkronkan transaksi ketika koneksi tersedia.
 */
export default function NetworkStatus() {
  // Simpan status koneksi agar tampilan dapat diperbarui saat jaringan berubah.
  // Pemeriksaan `window` mencegah akses API browser saat proses server-side rendering.
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return navigator.onLine;
    }
    return true;
  });

  // Menandai proses sinkronisasi yang dipicu ketika koneksi kembali tersedia.
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Perbarui status menjadi online lalu mulai menyinkronkan transaksi yang tersimpan lokal.
    const handleOnline = async () => {
      setIsOnline(true);
      setIsSyncing(true);
      await syncOfflineTransactions();
      setIsSyncing(false);
    };

    // Perbarui status saat browser mendeteksi koneksi terputus.
    const handleOffline = () => {
      setIsOnline(false);
    };

    // Dengarkan perubahan koneksi yang dilaporkan oleh browser.
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Coba sinkronkan transaksi tertunda setiap lima menit selama browser online.
    const intervalId = setInterval(() => {
      if (navigator.onLine) {
        syncOfflineTransactions();
      }
    }, 5 * 60 * 1000);

    // Lepas listener dan timer saat komponen dilepas agar tidak menyisakan proses aktif.
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, []);

  // Saat online, tampilkan indikator hijau dan pesan sinkronisasi jika proses sedang berjalan.
  if (isOnline) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        {isSyncing ? 'Menyinkronkan data...' : 'Online'}
      </div>
    );
  }

  // Saat offline, beri tahu pengguna bahwa data disimpan secara lokal.
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-red-600 bg-red-50 px-3 py-1 rounded-full shadow-sm border border-red-200">
      <span className="w-2 h-2 rounded-full bg-red-500"></span>
      Offline (Data disimpan lokal)
    </div>
  );
}