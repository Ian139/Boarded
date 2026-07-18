import { afterAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { User as SupabaseUser } from '@supabase/supabase-js';

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.EXPO_PUBLIC_DEFAULT_WALL_URL = 'https://example.supabase.co/storage/v1/object/public/walls/default-wall/wall.jpg';

const mockStorage = new Map<string, string>();
const mockState = {
  authUser: null as SupabaseUser | null,
  listenerCount: 0,
  uploadedPaths: [] as string[],
  remote: {
    routes: [] as Record<string, unknown>[],
    walls: [] as Record<string, unknown>[],
    ascents: [] as Record<string, unknown>[],
    comments: [] as Record<string, unknown>[],
    route_likes: [] as Record<string, unknown>[],
  },
};

type Filter = [string, unknown];

type Query = {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  or: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
  insert: (value: unknown) => Query;
  upsert: (value: unknown) => Query;
  update: (value: Record<string, unknown>) => Query;
  delete: () => Query;
  then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) => Promise<unknown>;
};

function makeQuery(table: keyof typeof mockState.remote): Query {
  const filters: Filter[] = [];
  let mutation: { kind: 'update'; value: Record<string, unknown> } | { kind: 'delete' } | null = null;
  const rows = () => mockState.remote[table];
  const matches = (row: Record<string, unknown>) => filters.every(([column, value]) => row[column] === value);
  const query = {} as Query;

  query.select = () => query;
  query.eq = (column, value) => {
    filters.push([column, value]);
    return query;
  };
  query.or = () => query;
  query.order = () => query;
  query.maybeSingle = async () => ({ data: rows().find(matches) || null, error: null });
  query.insert = (value) => {
    rows().push(...(Array.isArray(value) ? value : [value]) as Record<string, unknown>[]);
    return query;
  };
  query.upsert = (value) => {
    for (const next of (Array.isArray(value) ? value : [value]) as Record<string, unknown>[]) {
      const existing = rows().find((row) => row.id === next.id);
      if (existing) Object.assign(existing, next);
      else rows().push(next);
    }
    return query;
  };
  query.update = (value) => {
    mutation = { kind: 'update', value };
    return query;
  };
  query.delete = () => {
    mutation = { kind: 'delete' };
    return query;
  };
  query.then = (resolve) => {
    const pendingMutation = mutation;
    if (pendingMutation?.kind === 'update') {
      rows().filter(matches).forEach((row) => Object.assign(row, pendingMutation.value));
    }
    if (pendingMutation?.kind === 'delete') {
      const remaining = rows().filter((row) => !matches(row));
      rows().splice(0, rows().length, ...remaining);
    }
    return Promise.resolve(resolve({ data: rows().filter(matches), error: null }));
  };
  return query;
}

const mockSupabase = {
  auth: {
    getUser: async () => ({ data: { user: mockState.authUser }, error: null }),
    getSession: async () => ({ data: { session: mockState.authUser ? { user: mockState.authUser } : null }, error: null }),
    onAuthStateChange: () => {
      mockState.listenerCount += 1;
      return { data: { subscription: { unsubscribe: jest.fn() } }, error: null };
    },
  },
  from: (table: keyof typeof mockState.remote) => makeQuery(table),
  storage: {
    from: () => ({
      upload: async (path: string) => {
        mockState.uploadedPaths.push(path);
        return { error: null };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/walls/${path}` } }),
      list: async () => ({ data: [], error: null }),
      remove: async () => ({ data: [], error: null }),
    }),
  },
};

jest.mock('@react-native-async-storage/async-storage', () => {
  const mockAsyncStorage = {
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockStorage.set(key, value); },
    removeItem: async (key: string) => { mockStorage.delete(key); },
  };
  return { __esModule: true, default: mockAsyncStorage, ...mockAsyncStorage };
});
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('react-native', () => ({
  Image: { resolveAssetSource: () => ({ uri: 'https://cdn.test/default-wall.jpg' }) },
}));
jest.mock('../lib/supabase', () => ({
  get supabase() { return mockSupabase; },
}));

import { DEFAULT_WALL, useWallsStore } from '../lib/stores/walls-store';
import { useRoutesStore } from '../lib/stores/routes-store';
import { useUserStore } from '../lib/stores/user-store';

const userId = '11111111-1111-4111-8111-111111111111';
const now = '2026-01-01T00:00:00.000Z';
const originalFetch = global.fetch;

global.fetch = jest.fn(async () => ({
  ok: true,
  status: 200,
  blob: async () => ({ type: 'image/jpeg' }),
})) as unknown as typeof fetch;

function resetStores() {
  mockStorage.clear();
  mockState.authUser = null;
  mockState.uploadedPaths.length = 0;
  for (const rows of Object.values(mockState.remote)) rows.length = 0;
  useUserStore.setState({
    user: null,
    userId: null,
    displayName: 'Guest',
    profile: null,
    isAuthenticated: false,
    isModerator: false,
    isLoading: false,
    isProfileSyncing: false,
    profileSyncError: null,
    lastProfileSyncAt: null,
  });
  useWallsStore.setState({
    walls: [DEFAULT_WALL],
    selectedWall: null,
    legacyIdMap: {},
    pendingWallIds: [],
    pendingWallOwners: {},
    isLoading: false,
    isOfflineMode: false,
    hasHydrated: true,
  });
  useRoutesStore.setState({
    routes: [],
    pendingRoutes: [],
    pendingSocial: [],
    legacyIdMap: {},
    isLoading: false,
    isOfflineMode: false,
    hasHydrated: true,
  });
}

beforeEach(() => resetStores());
afterAll(() => {
  global.fetch = originalFetch;
});

describe('mobile stores', () => {
  test('keeps the default wall and guest routes in persisted storage', async () => {
    await useWallsStore.getState().fetchWalls();
    expect(useWallsStore.getState().walls[0].id).toBe(DEFAULT_WALL.id);

    const route = { id: 'legacy-route', user_id: 'local-user', wall_id: DEFAULT_WALL.id, name: 'Offline', holds: [], is_public: false, view_count: 0, created_at: now, updated_at: now };
    await useRoutesStore.getState().addRoute(route);
    expect(useRoutesStore.getState().routes[0].id).toMatch(/^[0-9a-f-]{36}$/);
    await useRoutesStore.persist.rehydrate();
    expect(useRoutesStore.getState().routes).toHaveLength(1);
  });

  test('migrates legacy route IDs and relations before upload', async () => {
    mockState.authUser = { id: userId, email: 'setter@example.com', created_at: now, app_metadata: {}, user_metadata: {} } as SupabaseUser;
    const legacyRoute = {
      id: 'legacy-route-id', user_id: 'local-user', wall_id: DEFAULT_WALL.id, wall_image_url: 'data:image/jpeg;base64,AAAA', name: 'Legacy', holds: [], is_public: true, view_count: 0, created_at: now, updated_at: now,
      ascents: [{ id: 'legacy-ascent', route_id: 'legacy-route-id', user_id: 'local-user', created_at: now }],
      comments: [{ id: 'legacy-comment', route_id: 'legacy-route-id', user_id: 'local-user', content: 'beta', is_beta: true, created_at: now }],
    };
    useRoutesStore.setState({ routes: [legacyRoute] });

    await useRoutesStore.getState().syncLocalRoutes();
    const migrated = useRoutesStore.getState().routes[0];
    expect(migrated.user_id).toBe(userId);
    expect(migrated.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(migrated.ascents?.[0].route_id).toBe(migrated.id);
    expect(migrated.comments?.[0].route_id).toBe(migrated.id);
    expect(mockState.uploadedPaths[0]).toContain(`${userId}/default-wall/route-`);
    expect(mockState.remote.ascents.at(-1)).toMatchObject({ route_id: migrated.id, user_id: userId });
    expect(mockState.remote.comments.at(-1)).toMatchObject({ route_id: migrated.id, user_id: userId });
  });

  test('keeps guest social actions local', async () => {
    const remoteRoute = { id: '22222222-2222-4222-8222-222222222222', user_id: userId, wall_id: DEFAULT_WALL.id, name: 'Public', holds: [], is_public: true, view_count: 0, created_at: now, updated_at: now, ascents: [], comments: [] };
    useRoutesStore.setState({ routes: [remoteRoute] });
    await useRoutesStore.getState().addAscent(remoteRoute.id, { id: 'guest-ascent', route_id: remoteRoute.id, user_id: 'local-user', created_at: now });
    await useRoutesStore.getState().addComment(remoteRoute.id, { id: 'guest-comment', route_id: remoteRoute.id, user_id: 'local-user', content: 'guest beta', is_beta: true, created_at: now });
    expect(mockState.remote.ascents).toHaveLength(0);
    expect(mockState.remote.comments).toHaveLength(0);
    expect(useRoutesStore.getState().routes[0].ascents?.[0].user_id).toBe('local-user');
    expect(useRoutesStore.getState().routes[0].comments?.[0].user_id).toBe('local-user');
  });

  test('registers only one auth listener during concurrent initialization', async () => {
    const originalGetSession = mockSupabase.auth.getSession;
    let getSessionCalls = 0;
    mockSupabase.auth.getSession = () => {
      getSessionCalls += 1;
      return new Promise(() => {});
    };
    useUserStore.getState().initializeAuth();
    useUserStore.getState().initializeAuth();
    await Promise.resolve();
    expect(mockState.listenerCount).toBe(1);
    expect(getSessionCalls).toBe(1);
    mockSupabase.auth.getSession = originalGetSession;
  });
});
