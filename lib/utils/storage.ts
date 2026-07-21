const WALLS_PUBLIC_URL_MARKER = '/storage/v1/object/public/walls/';

export type StoragePathLayout = 'legacy' | 'owner' | 'unknown';

export interface ClassifiedStoragePath {
  layout: StoragePathLayout;
  path: string;
  wallId: string | null;
  fileName: string | null;
  ownerId: string | null;
}

/**
 * Extract the storage object path from a public Supabase Storage URL for the
 * `walls` bucket. Returns `null` for non-matching URLs. Strips query strings
 * and fragments and percent-decodes the path so it can be compared with storage
 * listing names.
 */
export function getWallStoragePathFromUrl(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const markerIndex = publicUrl.indexOf(WALLS_PUBLIC_URL_MARKER);
  if (markerIndex === -1) return null;
  let path = publicUrl.slice(markerIndex + WALLS_PUBLIC_URL_MARKER.length).split(/[?#]/, 1)[0];
  if (!path) return null;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Leave the path as-is if decoding fails.
  }
  return path;
}

/**
 * Classify a `walls` storage object path as either the legacy layout
 * `<wall-id>/<file>` or the owner-prefixed layout `<user>/<wall-id>/<file>`.
 */
export function classifyStoragePath(path: string): ClassifiedStoragePath {
  const segments = path.split('/').filter(Boolean);
  const fileName = segments.length > 0 ? segments[segments.length - 1] : null;

  if (segments.length === 2) {
    return {
      layout: 'legacy',
      path,
      wallId: segments[0],
      fileName,
      ownerId: null,
    };
  }

  if (segments.length === 3) {
    return {
      layout: 'owner',
      path,
      wallId: segments[1],
      fileName,
      ownerId: segments[0],
    };
  }

  return {
    layout: 'unknown',
    path,
    wallId: null,
    fileName,
    ownerId: null,
  };
}
/**
 * Restrict a freshly computed deletion candidate list to the paths shown in
 * the moderator preview. Set membership keeps both lists deterministic and
 * prevents newly discovered or stale paths from being removed unseen.
 */
export function intersectStoragePaths(
  freshCandidates: readonly string[],
  previewedPaths: readonly string[],
): string[] {
  const previewed = new Set(previewedPaths);
  return freshCandidates.filter((path) => previewed.has(path));
}
