import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CartItem } from '@/hooks/useCartStore';
import { format } from 'date-fns';
import { id } from 'date-fns/locale'; 

// Ekstensi jsPDF untuk posisi akhir tabel.
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
  storeName?: string;
  branchName: string;
  customerName?: string;
  orderNote?: string;
}

// Membuat PDF struk transaksi.
export function generateReceiptPDF({ 
  transactionId, items, totalAmount, paymentMethod, 
  storeName = "Toko Capstone", branchName, customerName, orderNote 
}: ReceiptParams) {
  
  // Inisialisasi dokumen struk.
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 250] 
  });

  // Header toko dan transaksi.
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(storeName.toUpperCase(), 40, 10, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cabang: ${branchName}`, 40, 15, { align: 'center' });
  doc.text(format(new Date(), 'dd MMM yyyy HH:mm', { locale: id }), 40, 20, { align: 'center' });
  
  // Identitas transaksi.
  doc.setFontSize(9);
  doc.text(`ID: ${transactionId}`, 40, 25, { align: 'center' }); 
  
  let currentY = 30;
  
  // Informasi pelanggan opsional.
  if (customerName && customerName !== 'Umum' && customerName !== 'Pelanggan Member') {
    doc.text(`Pelanggan: ${customerName}`, 40, currentY, { align: 'center' });
    currentY += 5;
  }
  
  doc.line(5, currentY - 1, 75, currentY - 1); 

  // Rincian item transaksi.
  autoTable(doc, {
    startY: currentY + 1,
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

  // Posisi akhir tabel item.
  const finalY = (doc as jsPDFWithPlugin).lastAutoTable?.finalY || (currentY + 1);
  let summaryY = finalY;

  // Garis pemisah ringkasan.
  doc.line(5, summaryY + 2, 75, summaryY + 2);

  // Total dan metode pembayaran.
  doc.setFont('helvetica', 'bold');
  doc.text("TOTAL", 5, summaryY + 7);
  doc.text(`Rp ${totalAmount.toLocaleString('id-ID')}`, 75, summaryY + 7, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Pembayaran: ${paymentMethod.toUpperCase()}`, 5, summaryY + 12);
  summaryY += 15;

  // Catatan pesanan opsional.
  if (orderNote && orderNote.trim() !== '') {
    doc.line(5, summaryY + 2, 75, summaryY + 2);
    summaryY += 6;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    // Membungkus catatan agar tetap di dalam kertas.
    const splitNote = doc.splitTextToSize(`Catatan: ${orderNote}`, 70); 
    doc.text(splitNote, 5, summaryY);
    summaryY += (splitNote.length * 4);
  }

  // Pesan penutup.
  doc.line(5, summaryY + 3, 75, summaryY + 3);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text("Terima kasih telah berbelanja!", 40, summaryY + 8, { align: 'center' });
  doc.text("Barang yang dibeli tidak dapat dikembalikan", 40, summaryY + 12, { align: 'center' });

  // Penyimpanan file PDF.
  doc.save(`Struk_${transactionId}.pdf`);
}