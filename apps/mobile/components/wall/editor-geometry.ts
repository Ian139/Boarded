export type ImageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Return the exact rectangle occupied by an aspect-fit image. */
export function aspectFitRect(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
): ImageRect {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

/** Convert a point in the container to 0..100 image percentages, rejecting letterbox taps. */
export function pointToPercentage(
  x: number,
  y: number,
  rect: ImageRect,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const relativeX = x - rect.left;
  const relativeY = y - rect.top;
  if (relativeX < 0 || relativeX > rect.width || relativeY < 0 || relativeY > rect.height) return null;
  return {
    x: Math.max(0, Math.min(100, (relativeX / rect.width) * 100)),
    y: Math.max(0, Math.min(100, (relativeY / rect.height) * 100)),
  };
}

export function percentageToPoint(x: number, y: number, rect: ImageRect) {
  return {
    x: rect.left + (x / 100) * rect.width,
    y: rect.top + (y / 100) * rect.height,
  };
}
