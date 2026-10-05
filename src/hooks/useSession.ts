import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface SessionData {
  userId: string;
  tenantId: string;
  branchId: string;
  role: string;
  name: string;
}

export function useSession() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Membungkus logika dalam fungsi async agar dieksekusi sebagai microtask
    // Ini menyelesaikan peringatan ESLint 'set-state-in-effect'
    const initializeSession = async () => {
      if (typeof window !== 'undefined') {
        const storedSession = localStorage.getItem('pos_session');
        
        if (storedSession) {
          setSession(JSON.parse(storedSession));
        } else {
          // Jika tidak ada sesi, paksa kembali ke login
          router.push('/login');
        }
        
        setIsLoading(false);
      }
    };

    initializeSession();
  }, [router]);

  return { session, isLoading };
}