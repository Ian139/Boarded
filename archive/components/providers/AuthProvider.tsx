'use client';

import { useEffect } from 'react';
import { useUserStore } from '@/lib/stores/user-store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initializeAuth = useUserStore((state) => state.initializeAuth);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return <>{children}</>;
}
