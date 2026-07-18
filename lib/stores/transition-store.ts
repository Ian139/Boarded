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
  color: 'hsl(var(--primary))',
  startTransition: (x: number, y: number, color = 'hsl(var(--primary))') => {
    set({ isTransitioning: true, origin: { x, y }, color });
  },
  endTransition: () => {
    set({ isTransitioning: false, origin: null });
  },
}));
