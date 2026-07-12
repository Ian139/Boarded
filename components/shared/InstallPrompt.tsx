'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface DeferredPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectIOS() {
  if (typeof window === 'undefined') return false;
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const isStandalone = nav.standalone === true;
  return isIOS && !isStandalone;
}

export function InstallPrompt() {

  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const dismissed = sessionStorage.getItem('climbset-install-dismissed') === '1';
    if (dismissed) return;

    queueMicrotask(() => {
      if (isMounted) {
        setShowIOS(detectIOS());
      }
    });

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredPrompt);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      isMounted = false;
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsVisible(false);
    setShowIOS(false);
    sessionStorage.setItem('climbset-install-dismissed', '1');
  };

  const handleDismiss = () => {
    sessionStorage.setItem('climbset-install-dismissed', '1');
    setIsVisible(false);
    setShowIOS(false);
  };

  return (
    <>
      {isVisible && (
        <div className="mb-3 rounded-xl border border-border/50 bg-card/80 px-4 py-2 text-sm text-foreground flex items-center justify-between gap-3">
          <span>Install ClimbSet for a faster, app-like experience.</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDismiss}>
              Not now
            </Button>
            <Button size="sm" onClick={handleInstall}>
              Install
            </Button>
          </div>
        </div>
      )}
      {!isVisible && showIOS && (
        <div className="mb-3 rounded-xl border border-border/50 bg-card/80 px-4 py-2 text-sm text-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>Install on iOS: Tap Share, then “Add to Home Screen”.</span>
            <Button variant="outline" size="sm" onClick={handleDismiss}>
              Got it
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
