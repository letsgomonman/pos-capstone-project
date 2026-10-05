'use client';

import { useCartStore, CartItem } from '@/hooks/useCartStore'; 
import { processCheckout } from '@/lib/checkout';
import { generateReceiptPDF } from '@/lib/pdf-generator';
import { sendWhatsAppReceipt } from '@/lib/whatsapp';
import { useState } from 'react';

export default function CartPanel() {
  const { items, getTotal, clearCart, updateQuantity, removeItem } = useCartStore();
  
  const [isProcessing, setIsProcessing] = useState(false); 
  const [customerPhone, setCustomerPhone] = useState('');
  const [lastTx, setLastTx] = useState<{ id: string, amount: number, items: CartItem[] } | null>(null);

  const handlePayment = async (paymentMethod: string) => {
    if (items.length === 0) return;
    setIsProcessing(true); 

    const tenantId = "UUID_TENANT"; 
    const branchId = "UUID_BRANCH";
    const cashierId = "UUID_CASHIER";
    const currentTotal = getTotal();

    const result = await processCheckout({
      items, totalAmount: currentTotal, paymentMethod, tenantId, branchId, cashierId
    });

    if (result.success) {
      setLastTx({ id: result.offlineId, amount: currentTotal, items: [...items] });
      clearCart();
    } else {
      alert("Terjadi kesalahan sistem.");
    }
    
    setIsProcessing(false); 
  };

  const handleDecrease = (item: CartItem) => {
    if (item.cartQty > 1) {
      updateQuantity(item.id, item.cartQty - 1);
    } else {
      removeItem(item.id);
    }
  };

  const handleIncrease = (item: CartItem) => {
    updateQuantity(item.id, item.cartQty + 1);
  };

  if (lastTx) {
    return (
      <div className="p-4 border-l bg-green-50 h-full flex flex-col justify-center items-center text-center text-gray-900">
        <h2 className="text-2xl font-bold text-green-700 mb-2">Pembayaran Berhasil!</h2>
        <p className="mb-6 font-medium text-gray-700">Total: Rp {lastTx.amount.toLocaleString('id-ID')}</p>
        
        <input 
          type="text" 
          placeholder="No. WA Pelanggan (opsional)" 
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          className="border border-gray-300 p-2 mb-4 w-full rounded outline-none focus:ring-2 focus:ring-green-500 bg-white"
        />

        <div className="flex flex-col gap-2 w-full">
          <button 
            onClick={() => generateReceiptPDF({
              transactionId: lastTx.id,
              items: lastTx.items,
              totalAmount: lastTx.amount,
              paymentMethod: 'QRIS',
              branchName: 'Pusat'
            })}
            className="bg-gray-800 text-white font-semibold p-3 rounded hover:bg-gray-700 transition"
          >
            Unduh PDF Struk
          </button>

          <button 
            onClick={() => {
              if (!customerPhone) return alert("Masukkan no WA pelanggan dulu");
              sendWhatsAppReceipt({
                customerPhone,
                transactionId: lastTx.id,
                items: lastTx.items,
                totalAmount: lastTx.amount,
                branchName: 'Pusat'
              });
            }}
            className="bg-green-600 text-white font-semibold p-3 rounded hover:bg-green-700 transition"
          >
            Kirim via WhatsApp
          </button>

          <button 
            onClick={() => {
              setLastTx(null);
              setCustomerPhone('');
            }}
            className="text-gray-600 mt-4 underline hover:text-gray-900 font-medium"
          >
            Transaksi Baru
          </button>
        </div>
      </div>
    );
  }

  return (
    // PERBAIKAN 1 & 2: h-screen menjadi h-full, dan penambahan text-gray-900 agar warna font tegas
    <div className="p-4 border-l bg-white h-full flex flex-col text-gray-900">
      <h2 className="text-xl font-bold mb-4 border-b pb-2">Keranjang Belanja</h2>
      
      <div className="flex-1 overflow-y-auto pr-2">
        {items.map(item => (
          <div key={item.id} className="flex flex-col border-b border-gray-200 py-3 gap-2">
            <div className="flex justify-between font-semibold text-gray-900">
              <span className="pr-2">{item.name}</span>
              <span className="whitespace-nowrap">Rp {item.subtotal.toLocaleString('id-ID')}</span>
            </div>
            
            <div className="flex items-center justify-between mt-1">
              {/* PERBAIKAN 3: Simbol '@' diganti agar lebih jelas */}
              <span className="text-sm font-medium text-gray-500">
                Satuan: Rp {item.branch_price.toLocaleString('id-ID')}
              </span>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDecrease(item)}
                  className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded text-gray-700 border hover:bg-red-500 hover:text-white hover:border-red-500 transition"
                >
                  -
                </button>
                <span className="w-6 text-center font-bold text-gray-800">{item.cartQty}</span>
                <button 
                  onClick={() => handleIncrease(item)}
                  className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded text-gray-700 border hover:bg-blue-600 hover:text-white hover:border-blue-600 transition"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {items.length === 0 && (
          <div className="text-gray-400 text-center mt-20 flex flex-col items-center">
            <svg className="w-12 h-12 mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <p className="font-medium text-gray-500">Keranjang masih kosong</p>
          </div>
        )}
      </div>

      <div className="pt-4 mt-auto border-t border-gray-200 bg-white">
        <div className="flex justify-between items-center mb-4">
          <span className="text-gray-600 font-medium">Total Pembayaran</span>
          <h3 className="text-2xl font-bold text-blue-700">
            Rp {getTotal().toLocaleString('id-ID')}
          </h3>
        </div>
        <button 
          onClick={() => handlePayment('qris')}
          disabled={isProcessing || items.length === 0}
          className="w-full bg-blue-600 text-white font-bold text-lg p-4 rounded-xl shadow-md disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none hover:bg-blue-700 transition"
        >
          {isProcessing ? 'Memproses...' : 'Bayar Sekarang'}
        </button>
      </div>
    </div>
  );
}