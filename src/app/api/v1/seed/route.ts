import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Memaksa Next.js agar tidak melakukan cache pada API ini
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Buat Data Tenant (Toko Induk)
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .insert({ name: 'Toko Capstone Jaya' })
      .select().single();
    if (tErr) throw tErr;

    // 2. Buat Data Branch (Cabang)
    const { data: branch, error: bErr } = await supabase
      .from('branches')
      .insert({ tenant_id: tenant.id, name: 'Cabang Pusat', address: 'Jl. Kampus No. 1' })
      .select().single();
    if (bErr) throw bErr;

    // 3. Buat Akun Kasir (User)
    const { data: cashier, error: cErr } = await supabase
      .from('users')
      .insert({
        tenant_id: tenant.id,
        branch_id: branch.id,
        role: 'cashier',
        name: 'Kasir Default',
        email: 'kasir@capstone.com',
        password_hash: 'hashed_password_sementara' // Nanti diganti Supabase Auth
      })
      .select().single();
    if (cErr) throw cErr;

    // 4. Buat Master Produk
    const { data: products, error: pErr } = await supabase
      .from('products')
      .insert([
        { tenant_id: tenant.id, sku: 'SKU-001', name: 'Kopi Susu Gula Aren', base_price: 18000 },
        { tenant_id: tenant.id, sku: 'SKU-002', name: 'Roti Bakar Coklat', base_price: 15000 },
        { tenant_id: tenant.id, sku: 'SKU-003', name: 'Indomie Telur Kornet', base_price: 12000 },
        { tenant_id: tenant.id, sku: 'SKU-004', name: 'Es Teh Manis Jumbo', base_price: 5000 }
      ])
      .select();
    if (pErr) throw pErr;

    // 5. Masukkan Stok Produk ke Cabang (Branch Inventory)
    const inventoryData = products.map(p => ({
      branch_id: branch.id,
      product_id: p.id,
      stock_qty: 100, // Beri stok awal 100 per barang
      branch_price: p.base_price // Harga cabang sama dengan harga dasar
    }));
    
    const { error: invErr } = await supabase
      .from('branch_inventory')
      .insert(inventoryData);
    if (invErr) throw invErr;

    // Berhasil! Kembalikan ID yang dibuat agar bisa disalin
    return NextResponse.json({
      message: "Master Data berhasil di-generate!",
      IMPORTANT_IDS: {
        tenantId: tenant.id,
        branchId: branch.id,
        cashierId: cashier.id
      }
    });

  } catch (error: unknown) {
        // PERBAIKAN: Menggunakan 'unknown' lalu mengecek apakah itu Error object
        const errorMessage = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}