import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CartItem } from '@/hooks/useCartStore';
import { format } from 'date-fns';
import { id } from 'date-fns/locale'; 

// 1. Buat tipe khusus yang menggabungkan jsPDF dengan properti dari autotable
interface jsPDFWithPlugin extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

interface ReceiptParams {
  transactionId: string;
  items: CartItem[];
  totalAmount: number;
  paymentMethod: string;
  branchName: string;
}

export function generateReceiptPDF({ transactionId, items, totalAmount, paymentMethod, branchName }: ReceiptParams) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 250] 
  });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text("TOKO CAPSTONE POS", 40, 10, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cabang: ${branchName}`, 40, 15, { align: 'center' });
  doc.text(format(new Date(), 'dd MMM yyyy HH:mm', { locale: id }), 40, 20, { align: 'center' });
  doc.text(`ID: ${transactionId.split('-')[0]}`, 40, 25, { align: 'center' }); 
  
  doc.line(5, 28, 75, 28); 

  autoTable(doc, {
    startY: 30,
    margin: { left: 5, right: 5 },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: {
      0: { cellWidth: 40 }, 
      1: { cellWidth: 10, halign: 'center' }, 
      2: { cellWidth: 20, halign: 'right' } 
    },
    body: items.map(item => [
      item.name,
      `x${item.cartQty}`,
      item.subtotal.toLocaleString('id-ID')
    ]),
  });

  // 2. Gunakan tipe baru untuk melakukan type-casting yang aman dari ESLint
  const finalY = (doc as jsPDFWithPlugin).lastAutoTable?.finalY || 30;

  doc.line(5, finalY + 2, 75, finalY + 2);

  doc.setFont('helvetica', 'bold');
  doc.text("TOTAL", 5, finalY + 7);
  doc.text(`Rp ${totalAmount.toLocaleString('id-ID')}`, 75, finalY + 7, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Pembayaran: ${paymentMethod.toUpperCase()}`, 5, finalY + 12);

  doc.setFontSize(8);
  doc.text("Terima kasih telah berbelanja!", 40, finalY + 25, { align: 'center' });
  doc.text("Barang yang dibeli tidak dapat dikembalikan", 40, finalY + 29, { align: 'center' });

  doc.save(`Struk_${transactionId.substring(0,8)}.pdf`);
}