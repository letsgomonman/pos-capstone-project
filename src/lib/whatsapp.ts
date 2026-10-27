import { CartItem } from '@/hooks/useCartStore';

// Pengiriman struk transaksi melalui WhatsApp.
interface WAReceiptParams {
  customerPhone: string;
  transactionId: string;
  items: CartItem[];
  totalAmount: number;
  storeName?: string;
  branchName: string;
  customerName?: string;
  orderNote?: string;
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

  // Sapaan personal pelanggan.
  let text = '';
  if (customerName && customerName !== 'Umum' && customerName !== 'Pelanggan Member') {
    text += `Halo, *${customerName}*!\n\n`;
  }

  // Penyusunan isi struk.
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

  // Penambahan catatan pesanan.
  if (orderNote && orderNote.trim() !== '') {
    text += `Catatan: _${orderNote}_\n`;
  }

  text += `\nSemoga harimu menyenangkan!`;

  // Pengodean pesan untuk URL.
  const encodedText = encodeURIComponent(text);

  // Pembuatan URL dan pembukaan WhatsApp.
  const waUrl = `https://wa.me/${phone}?text=${encodedText}`;
  window.open(waUrl, '_blank');
}