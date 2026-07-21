import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStoragePath, getWallStoragePathFromUrl, intersectStoragePaths } from './storage';

describe('getWallStoragePathFromUrl', () => {
  it('extracts the path and strips query strings and fragments', () => {
    const url =
      'https://example.supabase.co/storage/v1/object/public/walls/wall-abc/image.jpg?download=1#frag';
    assert.equal(getWallStoragePathFromUrl(url), 'wall-abc/image.jpg');
  });

  it('decodes percent-encoded path segments', () => {
    const url =
      'https://example.supabase.co/storage/v1/object/public/walls/user-uuid/wall%20with%20spaces/file.jpg';
    assert.equal(
      getWallStoragePathFromUrl(url),
      'user-uuid/wall with spaces/file.jpg'
    );
  });

  it('returns null for non-matching or missing URLs', () => {
    assert.equal(
      getWallStoragePathFromUrl('https://example.com/walls/image.jpg'),
      null
    );
    assert.equal(getWallStoragePathFromUrl(null), null);
    assert.equal(getWallStoragePathFromUrl(''), null);
  });
});

describe('classifyStoragePath', () => {
  it('recognizes legacy <wall-id>/<file> layout', () => {
    const c = classifyStoragePath('wall-abc/image.jpg');
    assert.equal(c.layout, 'legacy');
    assert.equal(c.wallId, 'wall-abc');
    assert.equal(c.ownerId, null);
    assert.equal(c.fileName, 'image.jpg');
  });

  it('recognizes owner <user>/<wall-id>/<file> layout', () => {
    const c = classifyStoragePath('user-uuid/wall-abc/image.jpg');
    assert.equal(c.layout, 'owner');
    assert.equal(c.wallId, 'wall-abc');
    assert.equal(c.ownerId, 'user-uuid');
    assert.equal(c.fileName, 'image.jpg');
  });

  it('marks unexpectedly shallow or deep paths as unknown', () => {
    const shallow = classifyStoragePath('image.jpg');
    assert.equal(shallow.layout, 'unknown');
    assert.equal(shallow.wallId, null);

    const deep = classifyStoragePath('a/b/c/d/image.jpg');
    assert.equal(deep.layout, 'unknown');
    assert.equal(deep.wallId, null);
  });
});

describe('intersectStoragePaths', () => {
  it('deletes only paths present in both fresh candidates and the preview', () => {
    const fresh = ['wall-1/image.jpg', 'wall-2/new.jpg', 'wall-3/image.jpg'];
    const preview = ['wall-3/image.jpg', 'wall-2/stale.jpg', 'wall-1/image.jpg'];

    assert.deepEqual(
      intersectStoragePaths(fresh, preview),
      ['wall-1/image.jpg', 'wall-3/image.jpg'],
    );
  });

  it('does not mutate either candidate list', () => {
    const fresh = ['wall-1/image.jpg'];
    const preview = ['wall-1/image.jpg'];
    const result = intersectStoragePaths(fresh, preview);

    assert.notStrictEqual(result, fresh);
    assert.deepEqual(fresh, ['wall-1/image.jpg']);
    assert.deepEqual(preview, ['wall-1/image.jpg']);
  });
});
