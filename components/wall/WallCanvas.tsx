'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { Hold } from '@/lib/types';
import { HoldMarker } from './HoldMarker';
import { pixelToPercentage } from '@/lib/utils/holds';

interface WallCanvasProps {
  wallImageUrl: string;
  wallImageWidth?: number;
  wallImageHeight?: number;
  holds: Hold[];
  showSequence: boolean;
  onAddHold: (x: number, y: number) => void;
  onRemoveHold: (x: number, y: number) => void;
  onTap: (x: number, y: number) => void;
}

export function WallCanvas({
  wallImageUrl,
  wallImageWidth,
  wallImageHeight,
  holds,
  showSequence,
  onAddHold,
  onRemoveHold,
  onTap,
}: WallCanvasProps) {
  const imageWidth = wallImageWidth && wallImageWidth > 0 ? wallImageWidth : 1920;
  const imageHeight = wallImageHeight && wallImageHeight > 0 ? wallImageHeight : 1080;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressRef = useRef(false);
  const ignoreNextClickRef = useRef(false);

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Handle mouse click to add hold
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to percentage
    const percentCoords = pixelToPercentage(x, y, rect.width, rect.height);
    onAddHold(percentCoords.x, percentCoords.y);
  };

  // Handle right-click to remove hold (desktop)
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to percentage
    const percentCoords = pixelToPercentage(x, y, rect.width, rect.height);
    onRemoveHold(percentCoords.x, percentCoords.y);
  };

  // Handle touch start (mobile)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    touchStartPosRef.current = { x, y };
    isLongPressRef.current = false;

    // Start long-press timer (500ms)
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  };

  // Handle touch move (cancel long press if moved)
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartPosRef.current || !containerRef.current) return;

    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // If moved more than 10px, cancel long press
    const dx = Math.abs(x - touchStartPosRef.current.x);
    const dy = Math.abs(y - touchStartPosRef.current.y);

    if (dx > 10 || dy > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (!containerRef.current || !touchStartPosRef.current) return;

    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const { x, y } = touchStartPosRef.current;

    // Convert to percentage
    const percentCoords = pixelToPercentage(x, y, rect.width, rect.height);

    if (isLongPressRef.current) {
      // Long press = remove hold
      onRemoveHold(percentCoords.x, percentCoords.y);
    } else {
      // Quick tap = add hold or cycle type if tapping existing hold
      onTap(percentCoords.x, percentCoords.y);
    }

    // Prevent the synthetic click that follows touchend
    ignoreNextClickRef.current = true;
    setTimeout(() => {
      ignoreNextClickRef.current = false;
    }, 0);

    touchStartPosRef.current = null;
    isLongPressRef.current = false;
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-background md:bg-zinc-900">
      <div
        ref={containerRef}
        className="relative max-w-full max-h-full cursor-crosshair touch-none"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          src={wallImageUrl}
          alt="Climbing wall"
          width={imageWidth}
          height={imageHeight}
          className="max-w-full max-h-[calc(100dvh-12rem)] w-auto h-auto select-none"
          priority
          draggable={false}
          onLoad={() => {
            // Update dimensions after image loads
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              setDimensions({ width: rect.width, height: rect.height });
            }
          }}
        />

        {/* Render all holds */}
        {dimensions.width > 0 &&
          holds.map((hold) => (
            <HoldMarker
              key={hold.id}
              hold={hold}
              containerWidth={dimensions.width}
              containerHeight={dimensions.height}
              showSequence={showSequence}
            />
          ))}
      </div>
    </div>
  );
}
