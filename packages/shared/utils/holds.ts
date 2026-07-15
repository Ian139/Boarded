import { nanoid } from 'nanoid/non-secure';
import { Hold, HoldType, HoldSize, HOLD_COLORS, HOLD_TYPE_CYCLE } from '../types';

const TOLERANCE = 3; // Tolerance in percentage for hold proximity detection

/**
 * Create a new hold at the given coordinates
 */
export function createHold(
  x: number,
  y: number,
  type: HoldType,
  size: HoldSize = 'medium',
  sequence: number | null = null
): Hold {
  return {
    id: nanoid(),
    x,
    y,
    type,
    color: HOLD_COLORS[type],
    sequence,
    size,
  };
}

/**
 * Check if a hold exists near the given coordinates (within tolerance)
 */
export function findHoldNearPoint(
  holds: Hold[],
  x: number,
  y: number,
  tolerance: number = TOLERANCE
): Hold | undefined {
  return holds.find(
    (hold) =>
      Math.abs(hold.x - x) < tolerance && Math.abs(hold.y - y) < tolerance
  );
}

/**
 * Convert pixel coordinates to percentage based on container dimensions
 */
export function pixelToPercentage(
  pixelX: number,
  pixelY: number,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  return {
    x: (pixelX / containerWidth) * 100,
    y: (pixelY / containerHeight) * 100,
  };
}

/**
 * Convert percentage coordinates to pixels based on container dimensions
 */
export function percentageToPixel(
  percentX: number,
  percentY: number,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  return {
    x: (percentX / 100) * containerWidth,
    y: (percentY / 100) * containerHeight,
  };
}

/**
 * Add a hold to the array if no hold exists nearby
 */
export function addHold(
  holds: Hold[],
  x: number,
  y: number,
  type: HoldType,
  size: HoldSize = 'medium'
): Hold[] {
  const existingHold = findHoldNearPoint(holds, x, y);

  if (existingHold) {
    return holds; // Don't add if hold already exists nearby
  }

  const newHold = createHold(x, y, type, size);
  return [...holds, newHold];
}

/**
 * Remove a hold at or near the given coordinates
 */
export function removeHold(holds: Hold[], x: number, y: number): Hold[] {
  const holdToRemove = findHoldNearPoint(holds, x, y, TOLERANCE + 2);

  if (!holdToRemove) {
    return holds;
  }

  return holds.filter((hold) => hold.id !== holdToRemove.id);
}

/**
 * Update a hold's properties
 */
export function updateHold(holds: Hold[], holdId: string, updates: Partial<Hold>): Hold[] {
  return holds.map((hold) =>
    hold.id === holdId ? { ...hold, ...updates } : hold
  );
}

/**
 * Get the next hold type in the cycle
 */
export function getNextHoldType(currentType: HoldType): HoldType {
  const currentIndex = HOLD_TYPE_CYCLE.indexOf(currentType);
  const nextIndex = (currentIndex + 1) % HOLD_TYPE_CYCLE.length;
  return HOLD_TYPE_CYCLE[nextIndex];
}

/**
 * Cycle a hold's type to the next in sequence and update its color
 */
export function cycleHoldType(holds: Hold[], holdId: string): Hold[] {
  return holds.map((hold) => {
    if (hold.id !== holdId) return hold;
    const nextType = getNextHoldType(hold.type);
    return {
      ...hold,
      type: nextType,
      color: HOLD_COLORS[nextType],
    };
  });
}

/**
 * Clear all holds
 */
export function clearHolds(): Hold[] {
  return [];
}

/**
 * Toggle sequence numbering on all holds
 */
export function toggleSequencing(holds: Hold[], enable: boolean): Hold[] {
  if (enable) {
    // Add sequence numbers to holds that don't have them
    return holds.map((hold, index) => ({
      ...hold,
      sequence: hold.sequence !== null ? hold.sequence : index + 1,
    }));
  } else {
    // Remove all sequence numbers
    return holds.map((hold) => ({
      ...hold,
      sequence: null,
    }));
  }
}
