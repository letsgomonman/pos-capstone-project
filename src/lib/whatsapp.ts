import { CartItem } from '@/hooks/useCartStore';

interface WAReceiptParams {
  customerPhone: string;
  transactionId: string;
  items: CartItem[];
  totalAmount: number;
  branchName: string;
  customerName?: string; // <--- PERBAIKAN: Parameter pelanggan
}

export function sendWhatsAppReceipt({ customerPhone, transactionId, items, totalAmount, branchName, customerName }: WAReceiptParams) {
  // 1. Format Nomor Telepon (Ubah 0 di depan jadi 62)
  let phone = customerPhone.replace(/\D/g, ''); // Buang karakter non-angka
  if (phone.startsWith('0')) {
    phone = '62' + phone.substring(1);
  }

  // 2. Rangkai Teks Struk
  let text = '';
  
  // PERBAIKAN: Sapaan personal jika nama pelanggan tersedia
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

  // 3. Encode URI dan buka tab baru ke WhatsApp
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
}