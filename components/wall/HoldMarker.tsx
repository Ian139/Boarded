'use client';

import { Hold, HOLD_SIZES, HOLD_BORDER_WIDTH, HOLD_COLORS } from '@climbset/shared/types';

interface HoldMarkerProps {
  hold: Hold;
  containerWidth: number;
  containerHeight: number;
  showSequence: boolean;
}

export function HoldMarker({
  hold,
  containerWidth,
  containerHeight,
  showSequence,
}: HoldMarkerProps) {
  // Convert percentage to pixels
  const x = (hold.x / 100) * containerWidth;
  const y = (hold.y / 100) * containerHeight;

  // Get size in pixels (percentage of container width)
  const sizePercent = parseFloat(HOLD_SIZES[hold.size]);
  const size = (sizePercent / 100) * containerWidth;
  const halfSize = size / 2;

  // Get border width based on hold size
  const borderWidth = HOLD_BORDER_WIDTH[hold.size];
  const color = HOLD_COLORS[hold.type];

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${x - halfSize}px`,
        top: `${y - halfSize}px`,
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {/* Hold circle */}
      <div
        className="w-full h-full rounded-full transition-all"
        style={{
          borderWidth: `${borderWidth}px`,
          borderStyle: 'solid',
          borderColor: color,
          backgroundColor: `${color}20`,
        }}
      />

      {/* Sequence number */}
      {showSequence && hold.sequence !== null && (
        <div
          className="absolute inset-0 flex items-center justify-center text-foreground font-bold pointer-events-none"
          style={{
            fontSize: `${size * 0.4}px`,
            textShadow: '0 0 4px var(--bg-main)',
          }}
        >
          {hold.sequence}
        </div>
      )}
    </div>
  );
}
