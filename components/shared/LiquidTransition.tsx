'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useTransitionStore } from '@/lib/stores/transition-store';
import { useEffect } from 'react';

export function LiquidTransition() {
  const { isTransitioning, origin, color, endTransition } = useTransitionStore();

  // Auto-end transition after animation completes
  useEffect(() => {
    if (isTransitioning) {
      const timer = setTimeout(() => {
        endTransition();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isTransitioning, endTransition]);

  // Calculate the maximum dimension needed to cover the screen
  const maxDimension = typeof window !== 'undefined'
    ? Math.max(window.innerWidth, window.innerHeight) * 2.5
    : 2000;

  return (
    <AnimatePresence>
      {isTransitioning && origin && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {/* Liquid blob */}
          <motion.div
            className="absolute rounded-full"
            style={{
              backgroundColor: color,
              left: origin.x,
              top: origin.y,
              x: '-50%',
              y: '-50%',
            }}
            initial={{
              width: 0,
              height: 0,
              opacity: 0.9,
            }}
            animate={{
              width: maxDimension,
              height: maxDimension,
              opacity: 0,
            }}
            transition={{
              width: { duration: 0.5, ease: [0.32, 0, 0.67, 0] },
              height: { duration: 0.5, ease: [0.32, 0, 0.67, 0] },
              opacity: { duration: 0.4, delay: 0.2, ease: 'easeOut' },
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
