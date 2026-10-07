import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

// Tipe Data Sesi
interface UserSession {
  userId: string;
  name: string;
  role: string;
  tenantId: string;
  branchId: string;
}

// Tipe Data untuk Zustand Store
interface SessionStore {
  session: UserSession | null;
  isLoading: boolean;
  login: (data: UserSession) => void;
  logout: () => Promise<void>;
  initializeSession: () => Promise<void>;
}

export const useSession = create<SessionStore>((set) => ({
  session: null,
  isLoading: true, // Selalu true saat pertama kali dimuat

  // Fungsi Login (Hanya untuk mengupdate UI secara instan setelah Auth berhasil)
  login: (data) => set({ session: data, isLoading: false }),

  // Fungsi Logout (Menghapus sesi di Supabase DAN menghapus state lokal)
  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut(); // Hapus token dari server Supabase
    } catch (error) {
      console.error("Gagal logout dari Supabase:", error);
    } finally {
      set({ session: null, isLoading: false });
    }
  },

  // Fungsi Penjaga Gerbang (Dipanggil di layout.tsx dan pos/page.tsx)
  initializeSession: async () => {
    set({ isLoading: true });
    
    try {
      // 1. Cek Token Valid dari Supabase Auth
      const { data: { session: authSession }, error: authError } = await supabase.auth.getSession();
      
      if (authError || !authSession) {
        // Token tidak ada atau kedaluwarsa -> Anggap belum login
        set({ session: null, isLoading: false });
        return;
      }

      // 2. Jika Token Valid, tarik informasi profil usahanya dari tabel users
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('name, role, tenant_id, branch_id')
        .eq('id', authSession.user.id)
        .single();

      if (userError || !userData) {
        // Punya token, tapi datanya terhapus di database -> Anggap belum login
        set({ session: null, isLoading: false });
        return;
      }

      // 3. Simpan ke memori aplikasi (State)
      set({
        session: {
          userId: authSession.user.id,
          name: userData.name,
          role: userData.role,
          tenantId: userData.tenant_id,
          branchId: userData.branch_id
        },
        isLoading: false
      });

    } catch (error) {
      console.error("Gagal membaca sesi:", error);
      set({ session: null, isLoading: false });
    }
  }
}));