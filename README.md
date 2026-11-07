# POS Capstone Project 🚀

**Pengembangan Sistem Kasir (Point of Sales) Berbasis Web yang Universal dan Adaptif untuk Berbagai Sektor**

Aplikasi Point of Sale (POS) berskala *Enterprise* yang dirancang khusus untuk UMKM. Sistem ini mengusung arsitektur **Offline-First**, memungkinkan kasir tetap beroperasi dan mencetak struk meskipun koneksi internet terputus, serta secara otomatis melakukan sinkronisasi data ke *cloud* saat jaringan kembali stabil.

---

## ✨ Fitur Utama

- 🌐 **Arsitektur Offline-First:** Transaksi kasir tidak akan terhenti oleh gangguan internet. Data disimpan secara aman di memori lokal (IndexedDB) dan disinkronkan ke server secara otomatis di latar belakang.
- 🔐 **Role-Based Access Control (RBAC):** Pemisahan hak akses dan wewenang yang tegas antara **Owner** (Pemilik), **Manager** (Manajer Cabang), dan **Cashier** (Kasir)[cite: 42].
- 🏢 **Manajemen Multi-Usaha & Cabang:** Satu akun pemilik dapat mengelola berbagai entitas bisnis (tenant) dan puluhan cabang fisik secara terpusat[cite: 42].
- 📦 **Master Inventory & Transfer Logistik:** Pantau stok *real-time*, dapatkan peringatan stok menipis, dan lakukan pemindahan/transfer barang antar-cabang secara sistematis[cite: 42].
- 📈 **Dasbor Analitik Bisnis:** Visualisasi tren pendapatan harian/bulanan, deteksi jam sibuk kasir, dan identifikasi produk terlaris (*Fast-Moving* vs *Slow-Moving*)[cite: 42].
- ⚖️ **Akuntansi Otomatis (Standar SAK EMKM):** Setiap transaksi POS dan pencatatan pengeluaran otomatis dijurnal (*double-entry*). Sistem langsung menyajikan Laporan Laba Rugi dan Laporan Posisi Keuangan (Neraca) yang seimbang[cite: 42].
- 🧾 **Struk Digital & Integrasi WhatsApp:** Cetak struk dalam format PDF atau kirimkan langsung ke WhatsApp pelanggan[cite: 42].

---

## 🛠️ Teknologi yang Digunakan

- **Framework Front-end:** [Next.js (App Router)](https://nextjs.org/) & React.
- **Backend & Database Cloud:** [Supabase](https://supabase.com/) (PostgreSQL & Supabase Auth).
- **Database Lokal (Offline):** [Dexie.js](https://dexie.org/) (IndexedDB wrapper).
- **Service Worker / PWA:** [Serwist](https://serwist.build/).
- **State Management:** Zustand.
- **Styling & UI:** Tailwind CSS v4 & Lucide React (Icons).
- **Visualisasi Data:** Recharts.
- **PDF Generator:** jsPDF & jsPDF-AutoTable.

---