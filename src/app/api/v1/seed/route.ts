import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Fitur Seed Data: nonaktifkan cache agar endpoint selalu dijalankan.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Seed tenant
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .insert({ name: 'Toko Capstone Jaya' })
      .select().single();
    if (tErr) throw tErr;

    // 2. Seed cabang
    const { data: branch, error: bErr } = await supabase
      .from('branches')
      .insert({ tenant_id: tenant.id, name: 'Cabang Pusat', address: 'Jl. Kampus No. 1' })
      .select().single();
    if (bErr) throw bErr;

    // 3. Seed pengguna kasir
    const { data: cashier, error: cErr } = await supabase
      .from('users')
      .insert({
        tenant_id: tenant.id,
        branch_id: branch.id,
        role: 'cashier',
        name: 'Kasir Default',
        email: 'kasir@capstone.com',
        password_hash: 'hashed_password_sementara' // TODO: Ganti dengan Supabase Auth.
      })
      .select().single();
    if (cErr) throw cErr;

    // 4. Seed produk
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

    // 5. Seed inventaris cabang
    const inventoryData = products.map(p => ({
      branch_id: branch.id,
      product_id: p.id,
      stock_qty: 100, // Tetapkan stok awal 100 unit per produk.
      branch_price: p.base_price // Gunakan harga dasar sebagai harga cabang.
    }));
    
    const { error: invErr } = await supabase
      .from('branch_inventory')
      .insert(inventoryData);
    if (invErr) throw invErr;

    // Kembalikan ID hasil seed.
    return NextResponse.json({
      message: "Master Data berhasil di-generate!",
      IMPORTANT_IDS: {
        tenantId: tenant.id,
        branchId: branch.id,
        cashierId: cashier.id
      }
    });

  } catch (error: unknown) {
        // Tangani error yang tipenya belum diketahui.
        const errorMessage = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}