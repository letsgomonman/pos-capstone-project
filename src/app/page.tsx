import Link from 'next/link';
import { 
  Store, TrendingUp, ShieldCheck, Zap, Layers, ArrowRight, 
  BarChart3, Box, Users, CheckCircle2 
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-blue-200">
      
      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-1.5 rounded-lg">
              <Store size={24} />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-blue-500">
              POS Capstone
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition">
              Masuk
            </Link>
            <Link href="/register" className="text-sm font-bold bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 transition shadow-sm hover:shadow-md">
              Daftar Gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        {/* Dekorasi Background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-full opacity-30 pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
          <div className="absolute top-20 right-10 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-40 w-72 h-72 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-bold mb-6">
            <Zap size={14} className="text-yellow-500 fill-yellow-500" />
            Sistem Kasir Pintar Generasi Baru
          </span>
          <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 tracking-tight mb-6">
            Kelola Bisnis Lebih <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Cerdas.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            Platform Point of Sale (POS) multi-cabang dengan fitur analitik data mutakhir. Pantau omzet, pergerakan stok, dan performa tim Anda dari satu layar.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white text-lg font-bold px-8 py-4 rounded-full hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 transition-all transform hover:-translate-y-1">
              Mulai Usaha Anda <ArrowRight size={20} />
            </Link>
            <Link href="/login" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-gray-700 text-lg font-bold px-8 py-4 rounded-full border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-all">
              Masuk ke Dasbor
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="py-24 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Fitur Skala Enterprise</h2>
            <p className="text-gray-500">Dibangun dengan arsitektur kokoh untuk mendampingi bisnis Anda bertumbuh.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-md transition">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-6">
                <Layers size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Multi-Usaha & Cabang</h3>
              <p className="text-gray-600 leading-relaxed">
                Kelola banyak entitas bisnis dan puluhan cabang fisik hanya dari satu akun pemilik dengan pemisahan data yang kedap udara.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 hover:border-purple-200 hover:shadow-md transition">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-6">
                <TrendingUp size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Analitik & ML-Ready</h3>
              <p className="text-gray-600 leading-relaxed">
                Dasbor indikator otomatis mendeteksi barang <i>Fast-Moving</i> dan <i>Slow-Moving</i>. Siap diintegrasikan dengan algoritma Machine Learning.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 hover:border-green-200 hover:shadow-md transition">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mb-6">
                <Box size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Transfer Logistik</h3>
              <p className="text-gray-600 leading-relaxed">
                Fitur perpindahan stok antar cabang secara <i>real-time</i> dengan status pengiriman yang melacak volume pergerakan aset Anda.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 hover:border-orange-200 hover:shadow-md transition">
              <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center mb-6">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Keamanan Transaksi</h3>
              <p className="text-gray-600 leading-relaxed">
                Catat omzet, deteksi tipe pembayaran, dan hindari kebocoran finansial dengan fitur rekam jejak kasir dan opsi batalkan (Void) struk.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 hover:border-pink-200 hover:shadow-md transition">
              <div className="w-12 h-12 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center mb-6">
                <Users size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Manajemen Hak Akses</h3>
              <p className="text-gray-600 leading-relaxed">
                Atur otorisasi spesifik untuk posisi Owner, Manajer, dan Kasir agar tim fokus pada tugas tanpa mengkompromikan data rahasia.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 hover:border-teal-200 hover:shadow-md transition">
              <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center mb-6">
                <BarChart3 size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Arsitektur Cloud</h3>
              <p className="text-gray-600 leading-relaxed">
                Didukung oleh Supabase (PostgreSQL) memastikan sinkronisasi data yang cepat, stabil, dan bisa diakses dari mana saja.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-24 bg-blue-900 relative overflow-hidden">
        {/* Dekorasi Garis Halus */}
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[size:30px_30px]"></div>
        
        <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">Siap Mentransformasi Bisnis Anda?</h2>
          <p className="text-blue-200 text-lg mb-10">
            Bergabunglah dan rasakan kemudahan mengontrol seluruh cabang toko dari genggaman tangan. Tanpa kartu kredit, daftar dalam 1 menit.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="w-full sm:w-auto bg-white text-blue-900 font-bold px-8 py-4 rounded-full hover:bg-gray-100 hover:scale-105 transition-all">
              Buat Akun Gratis Sekarang
            </Link>
          </div>
          
          <div className="mt-10 flex flex-wrap justify-center gap-6 text-blue-200 text-sm">
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-green-400" /> Bebas Biaya Setup</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-green-400" /> Data Tersimpan Aman</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-green-400" /> Dukungan Teknis</span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-200 py-10 text-center">
        <p className="text-gray-500 font-medium">
          © {new Date().getFullYear()} POS Capstone Project. Dibangun dengan Next.js & Supabase.
        </p>
      </footer>

    </div>
  );
}