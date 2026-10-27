'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { Landmark, TrendingUp, Scale, Wallet, FileText, ArrowDownRight, ArrowUpRight, Plus, X } from 'lucide-react';

interface AccountBalance {
  code: string;
  name: string;
  category: string;
  balance: number;
}

interface JournalLineData {
  debit: number;
  credit: number;
  chart_of_accounts: {
    account_code: string;
    account_name: string;
    account_category: string;
    normal_balance: string;
  };
}

export default function FinanceDashboardPage() {
  const { session } = useSession();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Memuat ulang data setelah pengeluaran dicatat.
  const [activeTab, setActiveTab] = useState<'laba_rugi' | 'neraca'>('laba_rugi');
  
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [netIncome, setNetIncome] = useState(0);

  // Blok: State modal pengeluaran
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    category: '512', // Kategori beban default: Gaji & Upah.
    source: '111',   // Sumber dana default: Kas Tunai.
    description: ''
  });

  useEffect(() => {
    const fetchFinancialData = async () => {
      if (!session?.tenantId) return;

      try {
        const { data: lines, error } = await supabase
          .from('journal_lines')
          .select(`
            debit, credit,
            journals!inner(tenant_id),
            chart_of_accounts!inner(account_code, account_name, account_category, normal_balance)
          `)
          .eq('journals.tenant_id', session.tenantId);

        if (error) throw error;

        const accMap: Record<string, AccountBalance> = {};

        (lines as unknown as JournalLineData[] || []).forEach((line) => {
          const acc = line.chart_of_accounts;
          const code = acc.account_code;

          if (!accMap[code]) {
            accMap[code] = {
              code: code,
              name: acc.account_name,
              category: acc.account_category,
              balance: 0
            };
          }

          const debit = Number(line.debit);
          const credit = Number(line.credit);

          if (acc.normal_balance === 'debit') {
            accMap[code].balance += (debit - credit);
          } else {
            accMap[code].balance += (credit - debit);
          }
        });

        const aggregatedBalances = Object.values(accMap);
        setBalances(aggregatedBalances);

        const revenue = aggregatedBalances.filter(a => a.category === 'Revenue').reduce((sum, a) => sum + a.balance, 0);
        const expense = aggregatedBalances.filter(a => a.category === 'Expense').reduce((sum, a) => sum + a.balance, 0);
        setNetIncome(revenue - expense);

      } catch (error) {
        console.error("Gagal memuat data keuangan:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFinancialData();
  }, [session, refreshTrigger]);

  // Fitur: Mencatat pengeluaran melalui jurnal ganda
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !expenseForm.amount) return;
    setIsSubmitting(true);

    try {
      const amount = Number(expenseForm.amount);

      // 1. Ambil ID akun dari kode akun yang dipilih.
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code')
        .eq('tenant_id', session.tenantId)
        .in('account_code', [expenseForm.category, expenseForm.source]);

      if (!accounts || accounts.length !== 2) throw new Error("Akun buku besar tidak ditemukan.");

      const debitAccountId = accounts.find(a => a.account_code === expenseForm.category)?.id;
      const creditAccountId = accounts.find(a => a.account_code === expenseForm.source)?.id;

      if (!debitAccountId || !creditAccountId) throw new Error("Gagal memetakan akun debit/kredit.");

      // 2. Buat header jurnal.
      const { data: journal, error: journalErr } = await supabase
        .from('journals')
        .insert({
          tenant_id: session.tenantId,
          branch_id: session.branchId,
          reference_type: 'OPERATIONAL_EXPENSE',
          description: expenseForm.description || 'Pengeluaran Operasional',
          created_by: session.userId
        })
        .select().single();

      if (journalErr) throw journalErr;

      // 3. Buat baris jurnal: debit beban dan kredit kas/bank.
      const { error: lineErr } = await supabase
        .from('journal_lines')
        .insert([
          { journal_id: journal.id, account_id: debitAccountId, debit: amount, credit: 0 },
          { journal_id: journal.id, account_id: creditAccountId, debit: 0, credit: amount }
        ]);

      if (lineErr) throw lineErr;

      setExpenseForm({ amount: '', category: '512', source: '111', description: '' });
      setIsExpenseModalOpen(false);
      setRefreshTrigger(prev => prev + 1); // Muat ulang data dasbor.
      alert("Pengeluaran berhasil dicatat dan dijurnal.");

    } catch (error) {
      console.error("Gagal mencatat pengeluaran:", error);
      alert("Terjadi kesalahan saat menyimpan pengeluaran.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const revenues = balances.filter(a => a.category === 'Revenue');
  const cogs = balances.filter(a => a.code === '511'); 
  const opex = balances.filter(a => a.category === 'Expense' && a.code !== '511'); 

  const totalRevenue = revenues.reduce((sum, a) => sum + a.balance, 0);
  const totalCogs = cogs.reduce((sum, a) => sum + a.balance, 0);
  const grossProfit = totalRevenue - totalCogs;
  const totalOpex = opex.reduce((sum, a) => sum + a.balance, 0);
  
  const assets = balances.filter(a => a.category === 'Asset');
  const liabilities = balances.filter(a => a.category === 'Liability');
  const equities = balances.filter(a => a.category === 'Equity');

  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0);
  const totalEquityOriginal = equities.reduce((sum, a) => sum + a.balance, 0);
  
  const totalEquity = totalEquityOriginal + netIncome; 
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return (
    <div className="p-8 pb-20 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Landmark className="text-blue-600" size={32} /> Keuangan & Akuntansi
          </h1>
          <p className="text-gray-500 mt-1">Laporan keuangan terotomatisasi berstandar SAK EMKM.</p>
        </div>
        
        <button 
          onClick={() => setIsExpenseModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-red-700 transition shadow-sm"
        >
          <Plus size={20} /> Catat Pengeluaran
        </button>
      </div>

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className={`p-4 rounded-full ${netIncome >= 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}><TrendingUp size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Laba Bersih Berjalan</p>
              <h3 className={`text-2xl font-bold ${netIncome >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                Rp {netIncome.toLocaleString('id-ID')}
              </h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-blue-100 text-blue-600 rounded-full"><Wallet size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Total Aset (Harta)</p>
              <h3 className="text-2xl font-bold text-gray-900">Rp {totalAssets.toLocaleString('id-ID')}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="p-4 bg-purple-100 text-purple-600 rounded-full"><Scale size={24} /></div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Status Keseimbangan</p>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                {totalAssets === totalLiabilitiesAndEquity ? (
                  <span className="text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm">SEIMBANG (BALANCED)</span>
                ) : (
                  <span className="text-red-600 bg-red-50 px-3 py-1 rounded-full text-sm">TIDAK SEIMBANG</span>
                )}
              </h3>
            </div>
          </div>
        </div>
      )}
      {/* Blok: Navigasi laporan dan ekspor PDF */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 mb-6 gap-4 print:hidden">
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('laba_rugi')}
            className={`pb-3 px-4 font-semibold transition text-lg flex items-center gap-2 ${activeTab === 'laba_rugi' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <FileText size={20} /> Laporan Laba Rugi
          </button>
          <button 
            onClick={() => setActiveTab('neraca')}
            className={`pb-3 px-4 font-semibold transition text-lg flex items-center gap-2 ${activeTab === 'neraca' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Scale size={20} /> Laporan Posisi Keuangan (Neraca)
          </button>
        </div>
        
        <button 
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg font-bold hover:bg-gray-900 transition shadow-sm mb-3 sm:mb-0"
        >
          <FileText size={18} /> Unduh / Cetak PDF
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-500">Mengkalkulasi buku besar...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden p-6">
          
          {activeTab === 'laba_rugi' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 uppercase">Laporan Laba Rugi</h2>
                <p className="text-sm text-gray-500">Berdasarkan Standar SAK EMKM</p>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 border-b pb-2 mb-3 text-lg flex items-center gap-2"><ArrowUpRight className="text-green-500" size={20}/> PENDAPATAN</h3>
                {revenues.length === 0 ? <p className="text-gray-400 text-sm italic pl-7">Belum ada pendapatan dicatat.</p> : revenues.map(a => (
                  <div key={a.code} className="flex justify-between py-1 pl-7 text-gray-700">
                    <span>{a.code} - {a.name}</span>
                    <span>Rp {a.balance.toLocaleString('id-ID')}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 pl-7 font-bold text-gray-900 mt-2 bg-gray-50 rounded px-3">
                  <span>Total Pendapatan</span>
                  <span>Rp {totalRevenue.toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 border-b pb-2 mb-3 text-lg flex items-center gap-2"><ArrowDownRight className="text-orange-500" size={20}/> HARGA POKOK PENJUALAN</h3>
                {cogs.map(a => (
                  <div key={a.code} className="flex justify-between py-1 pl-7 text-gray-700">
                    <span>{a.code} - {a.name}</span>
                    <span>(Rp {a.balance.toLocaleString('id-ID')})</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 pl-7 font-bold text-blue-700 mt-2 bg-blue-50 rounded px-3">
                  <span>LABA KOTOR (Gross Profit)</span>
                  <span>Rp {grossProfit.toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 border-b pb-2 mb-3 text-lg flex items-center gap-2"><ArrowDownRight className="text-red-500" size={20}/> BEBAN OPERASIONAL</h3>
                {opex.length === 0 ? <p className="text-gray-400 text-sm italic pl-7">Belum ada beban operasional dicatat.</p> : opex.map(a => (
                  <div key={a.code} className="flex justify-between py-1 pl-7 text-gray-700">
                    <span>{a.code} - {a.name}</span>
                    <span>(Rp {a.balance.toLocaleString('id-ID')})</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 pl-7 font-bold text-gray-900 mt-2 bg-gray-50 rounded px-3">
                  <span>Total Beban Operasional</span>
                  <span>(Rp {totalOpex.toLocaleString('id-ID')})</span>
                </div>
              </div>

              <div className={`flex justify-between py-4 px-4 font-black text-xl rounded-lg border-2 mt-6 ${netIncome >= 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                <span>LABA BERSIH (Net Income)</span>
                <span>Rp {netIncome.toLocaleString('id-ID')}</span>
              </div>
            </div>
          )}

          {activeTab === 'neraca' && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 uppercase">Laporan Posisi Keuangan (Neraca)</h2>
                <p className="text-sm text-gray-500">Berdasarkan Standar SAK EMKM</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                <div>
                  <h3 className="font-bold text-gray-900 border-b-2 border-gray-800 pb-2 mb-3 text-lg text-center bg-gray-100 rounded-t pt-2">ASET (HARTA)</h3>
                  {assets.map(a => (
                    <div key={a.code} className="flex justify-between py-2 text-gray-700 border-b border-gray-100">
                      <span>{a.code} - {a.name}</span>
                      <span>Rp {a.balance.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-3 font-bold text-gray-900 mt-4 bg-gray-50 rounded border-t-2 border-gray-800 px-2">
                    <span>TOTAL ASET</span>
                    <span>Rp {totalAssets.toLocaleString('id-ID')}</span>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-gray-900 border-b-2 border-gray-800 pb-2 mb-3 text-lg text-center bg-gray-100 rounded-t pt-2">KEWAJIBAN & EKUITAS</h3>
                  
                  <h4 className="font-semibold text-gray-700 mb-2 mt-4">Kewajiban (Utang)</h4>
                  {liabilities.length === 0 ? <p className="text-gray-400 text-sm italic mb-2">Tidak ada kewajiban.</p> : liabilities.map(a => (
                    <div key={a.code} className="flex justify-between py-1 text-gray-700 border-b border-gray-100">
                      <span>{a.code} - {a.name}</span>
                      <span>Rp {a.balance.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                  
                  <h4 className="font-semibold text-gray-700 mb-2 mt-6">Ekuitas (Modal)</h4>
                  {equities.map(a => (
                    <div key={a.code} className="flex justify-between py-1 text-gray-700 border-b border-gray-100">
                      <span>{a.code} - {a.name}</span>
                      <span>Rp {a.balance.toLocaleString('id-ID')}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1 text-blue-700 font-medium border-b border-gray-100">
                    <span>Laba Bersih Berjalan</span>
                    <span>Rp {netIncome.toLocaleString('id-ID')}</span>
                  </div>

                  <div className="flex justify-between py-3 font-bold text-gray-900 mt-4 bg-gray-50 rounded border-t-2 border-gray-800 px-2">
                    <span>TOTAL KEWAJIBAN & EKUITAS</span>
                    <span>Rp {totalLiabilitiesAndEquity.toLocaleString('id-ID')}</span>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      )}

      {/* Blok: Modal pencatatan pengeluaran */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b bg-red-50">
              <h2 className="text-lg font-bold text-red-800">Catat Pengeluaran</h2>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-gray-500 hover:text-gray-800">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmitExpense} className="p-5 space-y-4">
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Nominal (Rp)</label>
                <input 
                  required 
                  type="number" 
                  min="1"
                  value={expenseForm.amount} 
                  onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})} 
                  className="w-full p-3 font-bold text-lg border rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-gray-900" 
                  placeholder="Contoh: 150000"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Kategori Beban</label>
                <select 
                  required 
                  value={expenseForm.category} 
                  onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                  className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-red-500 text-gray-900 bg-gray-50"
                >
                  <option value="512">512 - Beban Gaji & Upah</option>
                  <option value="513">513 - Beban Listrik, Air & Internet</option>
                  <option value="514">514 - Beban Sewa</option>
                  <option value="515">515 - Beban Operasional Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Sumber Dana (Uang Keluar Dari)</label>
                <select 
                  required 
                  value={expenseForm.source} 
                  onChange={(e) => setExpenseForm({...expenseForm, source: e.target.value})}
                  className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-red-500 text-gray-900 bg-gray-50"
                >
                  <option value="111">111 - Kas / Tunai di Laci</option>
                  <option value="112">112 - Saldo Bank (Transfer)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Keterangan / Catatan</label>
                <input 
                  required
                  type="text" 
                  value={expenseForm.description} 
                  onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})} 
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-gray-900" 
                  placeholder="Contoh: Bayar token listrik bulan ini"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t">
                <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 font-bold rounded-lg transition">Batal</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold disabled:bg-gray-400 transition">
                  {isSubmitting ? 'Mencatat...' : 'Simpan Pengeluaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}