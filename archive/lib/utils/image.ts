export interface CompressOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number; // 0-1
  mimeType?: string;
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Compress an image and return the dimensions of the encoded canvas.
 *
 * The canvas dimensions are also the dimensions stored alongside a wall row,
 * so callers can render the image at its actual aspect ratio after upload.
 */
export async function compressImageWithDimensions(
  file: File,
  { maxWidth, maxHeight, quality, mimeType = 'image/jpeg' }: CompressOptions
): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return { blob: file, width, height };
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (encoded) => resolve(encoded || file),
      mimeType,
      quality
    );
  });

  return { blob, width: targetWidth, height: targetHeight };
}

export async function compressImage(
  file: File,
  options: CompressOptions
): Promise<Blob> {
  const { blob } = await compressImageWithDimensions(file, options);
  return blob;
}
