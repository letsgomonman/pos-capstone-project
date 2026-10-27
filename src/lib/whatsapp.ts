import { CartItem } from '@/hooks/useCartStore';

// Pengiriman struk transaksi melalui WhatsApp.
interface WAReceiptParams {
  customerPhone: string;
  transactionId: string;
  items: CartItem[];
  totalAmount: number;
  branchName: string;
  customerName?: string;
}

export function sendWhatsAppReceipt({ customerPhone, transactionId, items, totalAmount, branchName, customerName }: WAReceiptParams) {
  // Normalisasi nomor telepon.
  let phone = customerPhone.replace(/\D/g, '');
  if (phone.startsWith('0')) {
    phone = '62' + phone.substring(1);
  }

  // Penyusunan isi struk.
  let text = '';

  // Sapaan personal pelanggan.
  if (customerName && customerName !== 'Umum' && customerName !== 'Pelanggan Member') {
    text += `Halo, *${customerName}*! 👋\n\n`;
  }

  text += `*TERIMA KASIH TELAH BERBELANJA!*\n`;
  text += `📍 Toko Capstone - ${branchName}\n`;
  text += `🧾 No: ${transactionId.substring(0,8)}\n`;
  text += `--------------------------------\n`;

  items.forEach(item => {
    text += `${item.name}\n`;
    text += `${item.cartQty} x Rp ${(item.branch_price).toLocaleString('id-ID')} = *Rp ${item.subtotal.toLocaleString('id-ID')}*\n`;
  });

  text += `--------------------------------\n`;
  text += `*TOTAL: Rp ${totalAmount.toLocaleString('id-ID')}*\n\n`;
  text += `Semoga harimu menyenangkan! 😊`;

  // Pembuatan URL dan pembukaan WhatsApp.
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
}