import { create } from 'zustand';

export interface SessionData {
  userId: string;
  name: string;
  role: string;
  tenantId: string;
  branchId: string;
}

interface SessionStore {
  session: SessionData | null;
  isLoading: boolean;
  login: (data: SessionData) => void;
  logout: () => void;
  initializeSession: () => void;
}

export const useSession = create<SessionStore>((set) => ({
  session: null,
  isLoading: true, // Kunci utama: Tahan UI agar Layout menunggu pembacaan memori
  login: (data) => {
    localStorage.setItem('pos_session', JSON.stringify(data));
    set({ session: data, isLoading: false });
  },
  logout: () => {
    localStorage.removeItem('pos_session');
    set({ session: null, isLoading: false });
  },
  initializeSession: () => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pos_session');
      if (stored) {
        try {
          set({ session: JSON.parse(stored), isLoading: false });
          return;
        } catch (e) {
          console.error("Gagal membaca sesi lokal");
        }
      }
      set({ session: null, isLoading: false });
    }
  }
}));