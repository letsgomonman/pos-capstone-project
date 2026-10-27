import { CartItem } from '@/hooks/useCartStore';

// Pengiriman struk transaksi melalui WhatsApp.
interface WAReceiptParams {
  customerPhone: string;
  transactionId: string;
  items: CartItem[];
  totalAmount: number;
  storeName?: string; // Menambahkan nama toko dinamis
  branchName: string;
  customerName?: string;
  orderNote?: string; // Menambahkan parameter catatan pesanan
}

export function sendWhatsAppReceipt({ 
  customerPhone, transactionId, items, totalAmount, 
  storeName = "Toko Capstone", branchName, customerName, orderNote 
}: WAReceiptParams) {
  
  // Normalisasi nomor telepon.
  let phone = customerPhone.replace(/\D/g, '');
  if (phone.startsWith('0')) {
    phone = '62' + phone.substring(1);
  }

  // Sapaan personal pelanggan menggunakan karakter ASCII standar (mengganti emoji yang rusak)
  let text = '';
  if (customerName && customerName !== 'Umum' && customerName !== 'Pelanggan Member') {
    text += `Halo, *${customerName}*!\n\n`;
  }

  // Menyusun isi struk (Perbaikan Sinkronisasi Nama Toko & ID utuh)
  text += `*TERIMA KASIH TELAH BERBELANJA!*\n`;
  text += `${storeName} - Cabang ${branchName}\n`;
  text += `No. Struk: ${transactionId}\n`;
  text += `--------------------------------\n`;

  items.forEach(item => {
    text += `${item.name}\n`;
    text += `${item.cartQty} x Rp ${(item.branch_price).toLocaleString('id-ID')} = *Rp ${item.subtotal.toLocaleString('id-ID')}*\n`;
  });

  text += `--------------------------------\n`;
  text += `*TOTAL: Rp ${totalAmount.toLocaleString('id-ID')}*\n`;

  // Sisipkan Catatan jika kasir menginputkannya
  if (orderNote && orderNote.trim() !== '') {
    text += `Catatan: _${orderNote}_\n`;
  }

  text += `\nSemoga harimu menyenangkan!`;

  // Enkode string dengan encodeURIComponent agar emoji/simbol aman saat dilempar ke URL API
  const encodedText = encodeURIComponent(text);

  // Pembuatan URL dan pembukaan WhatsApp di tab baru.
  const waUrl = `https://wa.me/${phone}?text=${encodedText}`;
  window.open(waUrl, '_blank');
}