'use client';

// Integrasi data keranjang, proses checkout, struk, sesi pengguna, dan layanan toko.
import { useCartStore, CartItem } from '@/hooks/useCartStore'; 
import { processCheckout } from '@/lib/checkout';
import { generateReceiptPDF } from '@/lib/pdf-generator';
import { sendWhatsAppReceipt } from '@/lib/whatsapp';
import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
// Ikon untuk kontrol pelanggan, pembayaran, diskon, catatan, dan pengosongan keranjang.
import { UserPlus, QrCode, Banknote, Tag, FileText, Trash2 } from 'lucide-react';

/**
 * Panel kasir yang menampilkan isi keranjang, menghitung pembayaran,
 * memproses transaksi, dan menyediakan opsi pengiriman struk.
 */
export default function CartPanel() {
  // Data dan aksi keranjang dikelola bersama oleh store agar tetap konsisten dengan katalog.
  const { items, getTotal, clearCart, updateQuantity, removeItem } = useCartStore();
  // Identitas tenant, cabang, dan kasir digunakan saat menyimpan transaksi.
  const { session } = useSession();
  
  // Mencegah pembayaran dikirim berulang dan memberi umpan balik saat transaksi berlangsung.
  const [isProcessing, setIsProcessing] = useState(false); 
  
  // Informasi pelanggan dan instruksi pesanan bersifat opsional.
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [orderNote, setOrderNote] = useState('');
  
  // Pilihan pembayaran serta nilai diskon dan uang tunai yang dimasukkan kasir.
  const [paymentMethod, setPaymentMethod] = useState<'qris' | 'cash'>('qris');
  const [discountType, setDiscountType] = useState<'nominal' | 'percent'>('nominal');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [cashReceived, setCashReceived] = useState<number | ''>('');
  
  // Nilai awal tetap tersedia jika nama toko atau cabang belum berhasil dimuat.
  const [storeInfo, setStoreInfo] = useState({ name: 'Toko Capstone', branch: 'Pusat' });

  // Snapshot transaksi terakhir dipakai untuk menampilkan konfirmasi dan membuat/mengirim struk.
  const [lastTx, setLastTx] = useState<{ 
    id: string, 
    amount: number, 
    change: number, 
    method: string, 
    items: CartItem[],
    customerName?: string,
    customerPhone?: string,
    orderNote?: string
  } | null>(null);

  // Ambil nama toko dan cabang untuk dicantumkan pada struk setelah sesi tersedia.
  useEffect(() => {
    async function fetchStoreInfo() {
      // Tanpa konteks tenant dan cabang, informasi toko tidak dapat dicari.
      if (!session?.tenantId || !session?.branchId) return;
      
      try {
        // Nama cabang berasal dari cabang aktif pada sesi kasir.
        const { data: branchData, error: branchErr } = await supabase
          .from('branches')
          .select('name')
          .eq('id', session.branchId)
          .single();

        if (branchErr) console.warn("Peringatan: Gagal memuat nama cabang", branchErr);

        // Gunakan nama workspace; untuk akun lama, coba tabel tenants sebagai cadangan.
        let tenantName = 'Toko Capstone';
        
        const { data: workspaceData, error: wsErr } = await supabase
          .from('workspaces')
          .select('name')
          .eq('id', session.tenantId)
          .single();

        if (wsErr) {
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('name')
            .eq('id', session.tenantId)
            .single();
            
          if (tenantData?.name) tenantName = tenantData.name;
        } else if (workspaceData?.name) {
          tenantName = workspaceData.name;
        }

        setStoreInfo({
          name: tenantName,
          branch: branchData?.name || 'Pusat'
        });
      } catch (error) {
        // Kegagalan memuat label struk tidak menghentikan fungsi kasir.
        console.error("Kesalahan sistem saat memuat info toko:", error);
      }
    }

    fetchStoreInfo();
    // Muat ulang label toko bila identitas sesi berubah.
  }, [session]);

  // Hitung subtotal dari store, lalu terapkan diskon nominal atau persentase.
  const subtotal = getTotal();
  
  let discountAmount = 0;
  const rawDiscount = Number(discountValue) || 0;
  if (discountType === 'percent') {
    discountAmount = (subtotal * rawDiscount) / 100;
  } else {
    discountAmount = rawDiscount;
  }
  
  // Total tidak boleh negatif; kembalian hanya dihitung untuk pembayaran tunai.
  const grandTotal = Math.max(0, subtotal - discountAmount);
  const rawCash = Number(cashReceived) || 0;
  const changeAmount = paymentMethod === 'cash' ? Math.max(0, rawCash - grandTotal) : 0;
  
  // Status ini dipakai untuk mencegah transaksi kosong atau pembayaran tunai yang kurang.
  const isCashInsufficient = paymentMethod === 'cash' && rawCash < grandTotal;
  const isCartEmpty = items.length === 0;

  // Validasi dan simpan transaksi, kemudian tampilkan ringkasan pembayaran berhasil.
  const handlePayment = async () => {
    // Pemeriksaan awal mencegah pemanggilan checkout pada input yang belum memenuhi syarat.
    if (isCartEmpty || isCashInsufficient) return;
    if (!session) return alert("Sesi tidak valid, harap login ulang.");

    setIsProcessing(true); 

    try {
      // Checkout menyimpan transaksi dengan konteks kasir, pelanggan, diskon, dan catatan.
      const result = await processCheckout({
        items, 
        totalAmount: grandTotal, 
        paymentMethod, 
        tenantId: session.tenantId, 
        branchId: session.branchId, 
        cashierId: session.userId,
        customerName: buyerName,
        customerPhone: buyerPhone,
        discountAmount,
        orderNote
      });

      if (result.success) {
        
        // Kurangi stok secara asinkron agar respons UI tidak menunggu permintaan jaringan.
        // Saat offline, perubahan stok dilewati karena sinkronisasi akan menanganinya kemudian.
        (async () => {
          if (!navigator.onLine) return; // Abaikan jika jelas offline
          try {
            for (const item of items) {
              const { data: currentInv } = await supabase
                .from('branch_inventory')
                .select('id, stock_qty')
                .eq('branch_id', session.branchId)
                .eq('product_id', item.id) 
                .single();

              if (currentInv) {
                await supabase
                  .from('branch_inventory')
                  .update({ stock_qty: currentInv.stock_qty - item.cartQty })
                  .eq('id', currentInv.id);
              }
            }
          } catch (stockError) {
            console.warn("Peringatan Latar Belakang: Gagal memotong stok (akan diulang saat sinkronisasi)", stockError);
          }
        })();

        // Beri tahu katalog untuk memuat ulang stok tanpa menunggu proses stok di atas.
        window.dispatchEvent(new Event('refreshProductGrid'));

        // Simpan salinan detail transaksi agar tetap tersedia setelah keranjang dikosongkan.
        setLastTx({ 
          id: result.offlineId, 
          amount: grandTotal, 
          change: changeAmount, 
          method: paymentMethod,
          items: [...items],
          customerName: buyerName || 'Umum',
          customerPhone: buyerPhone || '',
          orderNote: orderNote
        });
        
        // Kosongkan data transaksi yang baru selesai untuk menyiapkan pesanan berikutnya.
        clearCart();
        setDiscountValue('');
        setCashReceived('');
        setOrderNote('');
      } else {
        // Checkout melaporkan kegagalan tanpa menampilkan konfirmasi sukses.
        alert("Gagal memproses transaksi. Mohon periksa penyimpanan lokal browser Anda.");
      }
    } catch (err) {
      console.error("Payment Exception:", err);
      alert("Terjadi kesalahan yang tidak terduga pada sistem.");
    } finally {
      // Pastikan tombol pembayaran aktif kembali baik checkout berhasil maupun gagal.
      setIsProcessing(false); 
    }
  };

  // Kurangi kuantitas satu per satu; jika tinggal satu, hapus barang dari keranjang.
  const handleDecrease = (item: CartItem) => {
    if (item.cartQty > 1) updateQuantity(item.id, item.cartQty - 1);
    else removeItem(item.id);
  };
  
  // Tambah kuantitas selama jumlahnya belum mencapai stok yang diketahui.
  const handleIncrease = (item: CartItem) => {
    if (item.stock_qty && item.cartQty >= item.stock_qty) {
       alert(`Stok ${item.name} tidak mencukupi! Sisa stok: ${item.stock_qty}`);
       return;
    }
    updateQuantity(item.id, item.cartQty + 1);
  };

  // Tampilan pascatransaksi menyediakan konfirmasi, informasi kembalian, dan opsi struk.
  if (lastTx) {
    return (
      <div className="p-4 border-l bg-green-50 h-full flex flex-col justify-center items-center text-center text-gray-900">
        <h2 className="text-2xl font-bold text-green-700 mb-2">Pembayaran Berhasil!</h2>
        <p className="mb-6 font-medium text-gray-700">Total: Rp {lastTx.amount.toLocaleString('id-ID')}</p>
        
        {lastTx.method === 'cash' && lastTx.change > 0 && (
          <div className="bg-white p-4 rounded-lg shadow-sm border border-green-200 w-full mb-6 text-center">
            <p className="text-sm font-bold text-gray-500 mb-1">KEMBALIAN PELANGGAN:</p>
            <p className="text-4xl font-extrabold text-green-600">Rp {lastTx.change.toLocaleString('id-ID')}</p>
          </div>
        )}
        
        <div className="flex flex-col gap-2 w-full">
          {/* Buat berkas PDF menggunakan data transaksi dan identitas toko yang telah dimuat. */}
          <button 
            onClick={() => generateReceiptPDF({
              transactionId: lastTx.id, 
              items: lastTx.items, 
              totalAmount: lastTx.amount, 
              paymentMethod: lastTx.method.toUpperCase(), 
              storeName: storeInfo.name,
              branchName: storeInfo.branch,
              customerName: lastTx.customerName,
              orderNote: lastTx.orderNote
            })}
            className="bg-gray-800 text-white font-semibold p-3 rounded-lg hover:bg-gray-700 transition"
          >
            Unduh PDF Struk
          </button>
          {/* Kirim detail struk melalui WhatsApp; nomor pelanggan diperlukan untuk tujuan kirim. */}
          <button 
            onClick={() => {
              if (!lastTx.customerPhone) return alert("Nomor HP pelanggan kosong.");
              sendWhatsAppReceipt({
                customerPhone: lastTx.customerPhone, 
                transactionId: lastTx.id, 
                items: lastTx.items, 
                totalAmount: lastTx.amount, 
                storeName: storeInfo.name,
                branchName: storeInfo.branch,
                customerName: lastTx.customerName,
                orderNote: lastTx.orderNote
              });
            }}
            className="bg-green-600 text-white font-semibold p-3 rounded-lg hover:bg-green-700 transition"
          >
            Kirim Struk via WA
          </button>
          {/* Tutup ringkasan transaksi dan bersihkan identitas pelanggan untuk transaksi baru. */}
          <button 
            onClick={() => {
              setLastTx(null); setBuyerName(''); setBuyerPhone('');
            }}
            className="text-gray-600 mt-4 underline hover:text-gray-900 font-medium"
          >
            Transaksi Baru
          </button>
        </div>
      </div>
    );
  }

  // Tampilan utama POS: daftar barang, data pelanggan, ringkasan biaya, dan pembayaran.
  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      <div className="p-4 border-b border-gray-200 shrink-0 flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Pesanan Saat Ini</h2>
        {/* Tombol kosongkan hanya ditampilkan jika ada barang di keranjang. */}
        {items.length > 0 && (
          <button 
            onClick={clearCart} 
            className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 font-medium transition p-1 hover:bg-red-50 rounded"
          >
            <Trash2 size={16} /> Kosongkan
          </button>
        )}
      </div>
      
      {/* Area gulir memuat barang dan detail pelanggan agar bagian pembayaran tetap terlihat. */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
        {items.length === 0 ? (
          <div className="text-center text-gray-400 mt-10">Keranjang masih kosong</div>
        ) : (
          // Setiap kartu menyediakan subtotal barang dan kontrol kuantitas.
          items.map(item => (
            <div key={item.id} className="flex flex-col bg-white p-3 border border-gray-200 rounded-lg shadow-sm gap-2">
              <div className="flex justify-between font-semibold text-gray-900">
                <span className="pr-2 line-clamp-1">{item.name}</span>
                <span className="whitespace-nowrap">Rp {item.subtotal.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-medium text-gray-500">@ Rp {item.branch_price.toLocaleString('id-ID')}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDecrease(item)} className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded text-gray-700 hover:bg-red-500 hover:text-white transition">-</button>
                  <span className="w-6 text-center font-bold text-gray-800">{item.cartQty}</span>
                  <button onClick={() => handleIncrease(item)} className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded text-gray-700 hover:bg-blue-600 hover:text-white transition">+</button>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Form pelanggan hanya muncul saat transaksi memiliki barang. */}
        {items.length > 0 && (
          <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-3 mt-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <UserPlus size={16} /> Pelanggan & Catatan
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="Nama (Opsional)" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className="w-full p-2 text-sm border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-900" />
              <input type="tel" placeholder="No HP (Opsional)" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} className="w-full p-2 text-sm border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-900" />
            </div>
            <div className="flex items-center gap-2 border-t pt-2 mt-2">
              <FileText size={16} className="text-gray-400" />
              <input type="text" placeholder="Catatan dapur/pesanan..." value={orderNote} onChange={(e) => setOrderNote(e.target.value)} className="w-full text-sm outline-none bg-transparent text-gray-900" />
            </div>
          </div>
        )}
      </div>

      {/* Ringkasan pembayaran dan aksi checkout berada di bagian bawah panel. */}
      <div className="p-4 bg-white border-t border-gray-200 shrink-0">
        {/* Kasir dapat memasukkan diskon nominal (rupiah) atau persentase. */}
        <div className="flex items-center justify-between mb-3 bg-gray-50 p-2 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Tag size={16} /> Diskon
          </div>
          <div className="flex items-center gap-1">
            <input 
              type="number" 
              value={discountValue} 
              onChange={(e) => setDiscountValue(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-20 p-1 text-sm border rounded outline-none text-right bg-white text-gray-900"
              placeholder="0"
            />
            <select 
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percent' | 'nominal')}
              className="p-1 text-sm border rounded outline-none bg-white text-gray-900"
            >
              <option value="percent">%</option>
              <option value="nominal">Rp</option>
            </select>
          </div>
        </div>

        {/* Tampilkan subtotal, potongan yang berlaku, dan total akhir yang ditagihkan. */}
        <div className="space-y-1 mb-4 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span>Rp {subtotal.toLocaleString('id-ID')}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-red-500 font-medium">
              <span>Potongan Diskon</span>
              <span>- Rp {discountAmount.toLocaleString('id-ID')}</span>
            </div>
          )}
          <div className="flex justify-between items-end mt-2 pt-2 border-t">
            <span className="text-gray-900 font-semibold text-base">Grand Total</span>
            <span className="text-2xl font-bold text-blue-700">Rp {grandTotal.toLocaleString('id-ID')}</span>
          </div>
        </div>

        {/* Pilihan metode menentukan validasi uang diterima dan kalkulasi kembalian. */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button 
            onClick={() => setPaymentMethod('qris')}
            className={`flex items-center justify-center gap-2 p-3 rounded-lg font-bold border-2 transition ${paymentMethod === 'qris' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          >
            <QrCode size={18} /> QRIS
          </button>
          <button 
            onClick={() => setPaymentMethod('cash')}
            className={`flex items-center justify-center gap-2 p-3 rounded-lg font-bold border-2 transition ${paymentMethod === 'cash' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          >
            <Banknote size={18} /> Tunai
          </button>
        </div>

        {/* Input uang tunai dan pesan kekurangan hanya relevan untuk pembayaran tunai. */}
        {paymentMethod === 'cash' && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <label className="block text-xs font-bold text-blue-800 mb-1">UANG DITERIMA DARI PELANGGAN</label>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-600">Rp</span>
              <input 
                type="number" 
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full p-2 text-lg font-bold border-none rounded outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                placeholder="0"
              />
            </div>
            {isCashInsufficient && rawCash > 0 && (
              <p className="text-xs text-red-500 mt-1 font-medium">Uang tunai kurang Rp {(grandTotal - rawCash).toLocaleString('id-ID')}</p>
            )}
          </div>
        )}

        {/* Nonaktifkan checkout saat memproses, keranjang kosong, atau uang tunai kurang. */}
        <button 
          onClick={handlePayment}
          disabled={isProcessing || isCartEmpty || isCashInsufficient}
          className="w-full bg-blue-600 text-white font-bold text-lg p-4 rounded-xl shadow-md disabled:bg-gray-300 hover:bg-blue-700 transition"
        >
          {isProcessing ? 'Memproses...' : 'Selesaikan Pembayaran'}
        </button>
      </div>
    </div>
  );
}