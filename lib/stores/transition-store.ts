'use client';

import { create } from 'zustand';

interface TransitionState {
  isTransitioning: boolean;
  origin: { x: number; y: number } | null;
  color: string;
  startTransition: (x: number, y: number, color?: string) => void;
  endTransition: () => void;
}

export const useTransitionStore = create<TransitionState>((set) => ({
  isTransitioning: false,
  origin: null,
  color: 'var(--primary)',
  startTransition: (x: number, y: number, color = 'var(--primary)') => {
    set({ isTransitioning: true, origin: { x, y }, color });
  },
  endTransition: () => {
    set({ isTransitioning: false, origin: null });
  },
}));
