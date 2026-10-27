import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface UserSession {
  userId: string;
  name: string;
  role: string;
  tenantId: string;
  branchId: string;
}

interface SessionStore {
  session: UserSession | null;
  isLoading: boolean;
  login: (data: UserSession) => void;
  logout: () => Promise<void>;
  initializeSession: () => Promise<void>;
}

export const useSession = create<SessionStore>((set, get) => ({
  session: null,
  isLoading: true,

  // Login simpan konteks tenant dan cabang yang aktif.
  login: (data) => {
    localStorage.setItem('active_tenant', data.tenantId);
    localStorage.setItem('active_branch', data.branchId);
    set({ session: data, isLoading: false });
  },

  // Logout akhiri autentikasi dan hapus konteks yang tersimpan.
  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('active_tenant');
      localStorage.removeItem('active_branch');
    } catch (error) {
      console.error("Gagal logout:", error);
    } finally {
      set({ session: null, isLoading: false });
    }
  },

  // Inisialisasi pulihkan sesi autentikasi dan data pengguna.
  initializeSession: async () => {
    set({ isLoading: true });
    
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        set({ session: null, isLoading: false });
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('name, role, tenant_id, branch_id')
        .eq('id', authSession.user.id)
        .single();

      if (!userData) {
        set({ session: null, isLoading: false });
        return;
      }

      let activeTenant = userData.tenant_id;
      let activeBranch = userData.branch_id;

      // Multi-tenant hanya owner yang dapat memulihkan konteks tenant dan cabang tersimpan.
      if (userData.role === 'owner') {
        const savedTenant = localStorage.getItem('active_tenant');
        const savedBranch = localStorage.getItem('active_branch');
        
        if (savedTenant) activeTenant = savedTenant;
        if (savedBranch) activeBranch = savedBranch;
      }

      set({
        session: {
          userId: authSession.user.id,
          name: userData.name,
          role: userData.role,
          tenantId: activeTenant,
          branchId: activeBranch
        },
        isLoading: false
      });

    } catch (error) {
      console.error("Gagal membaca sesi:", error);
      set({ session: null, isLoading: false });
    }
  }
}));