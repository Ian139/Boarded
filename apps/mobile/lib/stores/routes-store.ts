import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { getCurrentUserId } from './user-store';
import { useWallsStore } from './walls-store';
import { ensureUuid, isUuid } from '@climbset/shared';
import type { Route, Ascent, Comment } from '@climbset/shared';

const LOCAL_USER_ID = 'local-user';
const ROUTE_STORAGE_KEY = 'climbset-routes';
const relationKeys = new Set(['ascents', 'wall', 'user', 'is_liked', 'like_count', 'liked_by', 'comments']);
type PendingSocial = { routeId: string; ownerId: string; kind: 'ascent'; payload: Ascent } | { routeId: string; ownerId: string; kind: 'comment'; payload: Comment };
type PendingRoute = { route: Route; ownerId: string };
const mappedIdKey = (ownerId: string, kind: string, id: string) => `${ownerId}:${kind}:${id}`;

interface RoutesState {
  routes: Route[];
  pendingSocial: PendingSocial[];
  pendingRoutes: PendingRoute[];
  legacyIdMap: Record<string, string>;
  isLoading: boolean;
  isOfflineMode: boolean;
  hasHydrated: boolean;
  fetchRoutes: () => Promise<void>;
  refreshRouteComments: (routeId: string) => Promise<void>;
  addRoute: (route: Route, expectedOwnerId?: string) => Promise<boolean>;
  updateRoute: (id: string, updates: Partial<Route>) => Promise<boolean>;
  deleteRoute: (id: string) => Promise<void>;
  toggleLike: (routeId: string, userId?: string) => Promise<void>;
  addAscent: (routeId: string, ascent: Ascent) => Promise<boolean>;
  addComment: (routeId: string, comment: Comment) => Promise<boolean>;
  updateComment: (routeId: string, commentId: string, content: string, isBeta: boolean) => Promise<boolean>;
  deleteComment: (routeId: string, commentId: string) => Promise<boolean>;
  incrementViewCount: (routeId: string) => Promise<void>;
  hasUserClimbed: (routeId: string, userId?: string) => boolean;
  getLikeCount: (routeId: string) => number;
  drainPendingSocial: () => Promise<void>;
  drainPendingRoutes: () => Promise<void>;
  syncLocalRoutes: (wallIdMap?: Record<string, string>, isCurrent?: () => boolean) => Promise<void>;
  purgeAccountData: (userId: string) => Promise<void>;
  clearLocalData: () => Promise<void>;
  exportSnapshot: () => { routes: Route[]; exportedAt: string };
}

let resolveHydration: (() => void) | undefined;
const hydrationReady = new Promise<void>((resolve) => { resolveHydration = resolve; });
let syncGeneration = 0;
let fetchGeneration = 0;
const likeLocks = new Map<string, Promise<void>>();

async function waitForHydration() {
  if (!useRoutesStore.getState().hasHydrated) await hydrationReady;
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id || getCurrentUserId();
  } catch {
    return getCurrentUserId();
  }
}
type MutationContext = { generation: number; userId: string };
async function captureMutationContext(): Promise<MutationContext | null> {
  const generation = syncGeneration;
  const userId = await currentUserId();
  return generation === syncGeneration && (await currentUserId()) === userId ? { generation, userId } : null;
}
async function mutationStillCurrent(context: MutationContext) {
  return context.generation === syncGeneration && (await currentUserId()) === context.userId;
}

function routePayload(route: Route, userId: string): Record<string, unknown> {
  const payload = Object.fromEntries(Object.entries(route).filter(([key]) => !relationKeys.has(key)));
  payload.id = ensureUuid(route.id);
  payload.user_id = userId === LOCAL_USER_ID ? null : userId;
  payload.is_public = route.is_public;
  payload.holds = route.holds || [];
  payload.view_count = route.view_count || 0;
  return payload;
}
function storageObjectPath(source: string) {
  const marker = '/storage/v1/object/public/walls/';
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;
  const path = source.slice(markerIndex + marker.length).split(/[?#]/, 1)[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
function isCurrentStorageHost(source: string) {
  const configuredOrigin = process.env.EXPO_PUBLIC_SUPABASE_URL?.match(/^https?:\/\/[^/]+/i)?.[0].toLowerCase();
  const sourceOrigin = source.match(/^https?:\/\/[^/]+/i)?.[0].toLowerCase();
  return Boolean(configuredOrigin && sourceOrigin && configuredOrigin === sourceOrigin);
}
function isCurrentRouteSnapshot(sourcePath: string | null, source: string, userId: string, wallId: string, routeId: string) {
  if (!sourcePath || !isCurrentStorageHost(source)) return false;
  const wallKey = wallId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const routeKey = routeId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return sourcePath.startsWith(`${userId}/${wallKey}/route-${routeKey}.`);
}
function defaultWallStorageUrl() {
  const explicitUrl = process.env.EXPO_PUBLIC_DEFAULT_WALL_URL?.trim();
  if (explicitUrl) return explicitUrl;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  return supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/walls/default-wall/wall.jpg`
    : undefined;
}


async function uploadRouteSnapshot(route: Route, userId: string, wallId: string, routeId: string): Promise<string | undefined> {
  let source = route.wall_image_url;
  let sourcePath = source && /^https?:\/\//i.test(source) ? storageObjectPath(source) : null;
  let forceSnapshot = false;
  if (route.wall_id === 'default-wall' && !sourcePath) {
    const canonicalUrl = defaultWallStorageUrl();
    if (canonicalUrl) {
      source = canonicalUrl;
      sourcePath = storageObjectPath(canonicalUrl);
      forceSnapshot = true;
    } else if (!source || !/^https?:\/\//i.test(source)) {
      return undefined;
    }
  }
  const hasCurrentRouteSnapshot = isCurrentRouteSnapshot(sourcePath, source || '', userId, wallId, routeId);
  if (!source || !forceSnapshot && (hasCurrentRouteSnapshot || /^https?:\/\//i.test(source) && !sourcePath)) {
    return source && /^https?:\/\//i.test(source) ? source : undefined;
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to read route wall snapshot (${response.status})`);
  const blob = await response.blob();
  const contentType = blob.type || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${wallId}/route-${routeId}.${extension}`;
  const { error } = await supabase.storage.from('walls').upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from('walls').getPublicUrl(path).data.publicUrl;
}
async function prepareRemoteRoute(route: Route, userId: string, wallIdMap: Record<string, string>): Promise<Route | null> {
  const wallStore = useWallsStore.getState();
  const mappedWallId = wallIdMap[route.wall_id] || wallStore.legacyIdMap[`${userId}:wall:${route.wall_id}`] || route.wall_id;
  const migratedWall = wallStore.walls.find((wall) => wall.id === mappedWallId);
  if (route.wall_id !== 'default-wall' && (!migratedWall || migratedWall.user_id === LOCAL_USER_ID)) return null;
  const routeId = ensureUuid(route.id);
  const snapshotUrl = await uploadRouteSnapshot(route, userId, mappedWallId, routeId);
  return {
    ...route,
    id: routeId,
    user_id: userId,
    wall_id: mappedWallId,
    wall_image_url: snapshotUrl || (route.wall_id !== 'default-wall' ? migratedWall?.image_url : defaultWallStorageUrl()),
    wall_image_width: route.wall_image_width || migratedWall?.image_width,
    wall_image_height: route.wall_image_height || migratedWall?.image_height,
  };
}

function normalizeAscent(ascent: Ascent, routeId: string, userId: string): Ascent {
  return {
    ...ascent,
    id: ensureUuid(ascent.id),
    route_id: routeId,
    user_id: userId,
    created_at: ascent.created_at || new Date().toISOString(),
  };
}

function normalizeComment(comment: Comment, routeId: string, userId: string): Comment {
  return {
    ...comment,
    id: ensureUuid(comment.id),
    route_id: routeId,
    user_id: userId,
    created_at: comment.created_at || new Date().toISOString(),
  };
}

export const useRoutesStore = create<RoutesState>()(
  persist(
    (set, get) => ({
      routes: [],
      pendingSocial: [],
      pendingRoutes: [],
      legacyIdMap: {},
      isLoading: false,
      isOfflineMode: false,
      hasHydrated: false,
      fetchRoutes: async () => {
        await waitForHydration();
        const generation = ++fetchGeneration;
        set({ isLoading: true });
        try {
          const userId = await currentUserId();
          let result = await supabase.from('routes').select('*, ascents (*), comments (*)').order('created_at', { ascending: false });
          if (result.error) {
            result = await supabase.from('routes').select('*, ascents (*)').order('created_at', { ascending: false });
          }
          if (result.error) throw result.error;

          const { data: allLikes, error: likesError } = await supabase.from('route_likes').select('route_id, user_id');
          const likesByRoute: Record<string, string[]> = {};
          if (!likesError && allLikes) {
            for (const like of allLikes as Array<{ route_id: string; user_id: string }>) {
              (likesByRoute[like.route_id] ||= []).push(like.user_id);
            }
          }
          if (generation !== fetchGeneration || userId !== await currentUserId()) return;
          const remoteRoutes = ((result.data || []) as Route[]).map((route) => {
            const likedBy = likesByRoute[route.id] || [];
            return { ...route, holds: route.holds || [], ascents: route.ascents || [], comments: route.comments || [], liked_by: likedBy, like_count: likedBy.length, is_liked: likedBy.includes(userId) };
          });
          const remoteIds = new Set(remoteRoutes.map((route) => route.id));
          const latestLocal = get().routes.filter((route) => route.user_id === LOCAL_USER_ID || route.user_id === userId);
          const pendingIds = new Set(get().pendingRoutes.filter((item) => item.ownerId === userId).map((item) => item.route.id));
          const pendingAscentIds = new Set(get().pendingSocial.filter((item) => item.ownerId === userId && item.kind === 'ascent').map((item) => item.payload.id));
          const pendingCommentIds = new Set(get().pendingSocial.filter((item) => item.ownerId === userId && item.kind === 'comment').map((item) => item.payload.id));
          const localById = new Map(latestLocal.map((route) => [route.id, route]));
          const mergedRemote = remoteRoutes.map((remote) => {
            const local = localById.get(remote.id);
            if (!local) return remote;
            const remoteAscentIds = new Set((remote.ascents || []).map((item) => item.id));
            const remoteCommentIds = new Set((remote.comments || []).map((item) => item.id));
            return {
              ...remote,
              ascents: [...(remote.ascents || []), ...(local.ascents || []).filter((item) => pendingAscentIds.has(item.id) && !remoteAscentIds.has(item.id))],
              comments: [...(remote.comments || []), ...(local.comments || []).filter((item) => pendingCommentIds.has(item.id) && !remoteCommentIds.has(item.id))],
            };
          });
          if (generation !== fetchGeneration) return;
          const mergedLocal = latestLocal.filter((route) => !remoteIds.has(route.id) && (route.user_id === LOCAL_USER_ID || pendingIds.has(route.id)));
          const hasUnsynced = latestLocal.some((route) => route.user_id === LOCAL_USER_ID) || pendingIds.size > 0 || pendingAscentIds.size > 0 || pendingCommentIds.size > 0;
          set({ routes: [...mergedLocal, ...mergedRemote], isLoading: false, isOfflineMode: hasUnsynced });
          await get().drainPendingRoutes();
          await get().drainPendingSocial();
        } catch {
          if (generation === fetchGeneration) set({ isLoading: false, isOfflineMode: true });
        }
      },

      refreshRouteComments: async (routeId) => {
        const generation = fetchGeneration;
        const userId = await currentUserId();
        try {
          const { data, error } = await supabase.from('comments').select('*').eq('route_id', routeId).order('created_at', { ascending: true });
          if (error) throw error;
          if (generation !== fetchGeneration || userId !== await currentUserId()) return;
          set((state) => ({ routes: state.routes.map((route) => route.id === routeId ? { ...route, comments: (data as Comment[]) || [] } : route) }));
        } catch {
          if (generation === fetchGeneration) set({ isOfflineMode: true });
        }
      },

      addRoute: async (route, expectedOwnerId) => {
        await waitForHydration();
        const generation = syncGeneration;
        const userId = await currentUserId();
        if (generation !== syncGeneration || (await currentUserId()) !== userId) return false;
        const ownerId = expectedOwnerId || userId;
        if (ownerId !== userId && !(ownerId === LOCAL_USER_ID && userId === LOCAL_USER_ID)) return false;
        const pendingLocal = ownerId === LOCAL_USER_ID && userId !== LOCAL_USER_ID;
        const normalized: Route = {
          ...route,
          id: ensureUuid(route.id),
          user_id: pendingLocal ? LOCAL_USER_ID : userId,
          is_public: route.is_public,
          holds: route.holds || [],
          view_count: route.view_count || 0,
          created_at: route.created_at || new Date().toISOString(),
          updated_at: route.updated_at || new Date().toISOString(),
        };
        if (generation !== syncGeneration || (await currentUserId()) !== userId) return false;
        set((state) => ({ routes: [normalized, ...state.routes.filter((item) => item.id !== normalized.id)] }));
        if (userId === LOCAL_USER_ID) {
          set({ isOfflineMode: true });
          return true;
        }
        set((state) => ({
          pendingRoutes: [
            ...state.pendingRoutes.filter((item) => item.route.id !== normalized.id || item.ownerId !== userId),
            { route: normalized, ownerId: userId },
          ],
          isOfflineMode: true,
        }));
        await get().drainPendingRoutes();
        return generation === syncGeneration && (await currentUserId()) === userId;
      },
      updateRoute: async (id, updates) => {
        const generation = syncGeneration;
        const mutationUserId = await currentUserId();
        if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return false;
        const current = get().routes.find((route) => route.id === id);
        if (!current) return false;
        const pendingCreate = get().pendingRoutes.some((item) => item.route.id === id && item.ownerId === mutationUserId);
        const next: Route = { ...current, ...updates, id: current.id, updated_at: new Date().toISOString() };
        set((state) => ({ routes: state.routes.map((route) => route.id === id ? next : route) }));
        if (pendingCreate) {
          set((state) => ({
            pendingRoutes: state.pendingRoutes.map((item) =>
              item.route.id === id && item.ownerId === mutationUserId ? { ...item, route: next } : item
            ),
            isOfflineMode: true,
          }));
          return true;
        }
        if (current.user_id === LOCAL_USER_ID) return true;
        try {
          const payload = Object.fromEntries(Object.entries(updates).filter(([key]) => !relationKeys.has(key)));
          delete payload.id;
          delete payload.user_id;
          payload.updated_at = next.updated_at;
          const { data, error } = await supabase.from('routes').update(payload).eq('id', id).select('id').maybeSingle();
          if (error || !data) throw error || new Error('Route update was not authorized');
          if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return false;
          return true;
        } catch {
          if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return false;
          set((state) => ({ routes: state.routes.map((route) => route.id === id ? current : route), isOfflineMode: true }));
          return false;
        }
      },

      deleteRoute: async (id) => {
        const generation = syncGeneration;
        const mutationUserId = await currentUserId();
        if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return;
        const current = get().routes.find((route) => route.id === id);
        if (!current) return;
        const pendingSocial = get().pendingSocial.filter((item) => item.routeId === id);
        set((state) => ({
          routes: state.routes.filter((route) => route.id !== id),
          pendingSocial: state.pendingSocial.filter((item) => item.routeId !== id),
        }));
        const pendingCreate = get().pendingRoutes.some((item) => item.route.id === id && item.ownerId === mutationUserId);
        if (pendingCreate) {
          set((state) => ({
            pendingRoutes: state.pendingRoutes.filter((item) => item.route.id !== id || item.ownerId !== mutationUserId),
          }));
          return;
        }
        if (current.user_id === LOCAL_USER_ID) return;
        try {
          const { data, error } = await supabase.from('routes').delete().eq('id', id).select('id').maybeSingle();
          if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return;
          if (error || !data) throw error || new Error('Route deletion was not authorized');
        } catch {
          if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return;
          set((state) => ({
            routes: state.routes.some((route) => route.id === current.id) ? state.routes : [current, ...state.routes],
            pendingSocial: [...state.pendingSocial.filter((item) => item.routeId !== id), ...pendingSocial],
            isOfflineMode: true,
          }));
        }
      },
      toggleLike: async (routeId, suppliedUserId) => {
        const context = await captureMutationContext();
        if (!context) return;
        const userId = suppliedUserId || context.userId;
        if (userId !== context.userId) return;
        const lockKey = `${routeId}:${userId}`;
        const previous = likeLocks.get(lockKey);
        if (previous) await previous;
        if (!(await mutationStillCurrent(context))) return;
        let release!: () => void;
        const currentLock = new Promise<void>((resolve) => { release = resolve; });
        likeLocks.set(lockKey, currentLock);
        let before: Route | null = null;
        try {
          const route = get().routes.find((item) => item.id === routeId);
          if (!route) return;
          if (userId === LOCAL_USER_ID || route.user_id === LOCAL_USER_ID || get().pendingRoutes.some((item) => item.route.id === routeId && item.ownerId === userId)) return;
          before = route;
          const likedBy = route.liked_by || [];
          const liked = likedBy.includes(userId);
          const nextLikedBy = liked ? likedBy.filter((id) => id !== userId) : [...likedBy, userId];
          set((state) => ({ routes: state.routes.map((item) => item.id === routeId ? { ...item, liked_by: nextLikedBy, like_count: nextLikedBy.length, is_liked: !liked } : item) }));
          const result = liked
            ? await supabase.from('route_likes').delete().eq('route_id', routeId).eq('user_id', userId)
            : await supabase.from('route_likes').insert({ route_id: routeId, user_id: userId });
          if (result.error) throw result.error;
          if (!(await mutationStillCurrent(context))) return;
        } catch {
          if (!(await mutationStillCurrent(context))) return;
          if (before) set((state) => ({ routes: state.routes.map((item) => item.id === routeId ? before! : item) }));
          set({ isOfflineMode: true });
        } finally {
          release();
          if (likeLocks.get(lockKey) === currentLock) likeLocks.delete(lockKey);
        }
      },

      drainPendingRoutes: async () => {
        const generation = syncGeneration;
        const userId = await currentUserId();
        if (userId === LOCAL_USER_ID || generation !== syncGeneration) return;
        await useWallsStore.getState().drainPendingWalls();
        const wallIdMap = await useWallsStore.getState().syncLocalWalls();
        if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
        const pending = get().pendingRoutes.filter((item) => item.ownerId === userId);
        for (const item of pending) {
          if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
          try {
            const prepared = await prepareRemoteRoute(item.route, userId, wallIdMap);
            if (!prepared) {
              set({ isOfflineMode: true });
              continue;
            }
            const { error } = await supabase.from('routes').upsert(routePayload(prepared, userId), { onConflict: 'id' });
            if (error) throw error;
            if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
            set((state) => ({
              pendingRoutes: state.pendingRoutes.filter((candidate) => candidate.route.id !== item.route.id || candidate.ownerId !== userId),
              routes: state.routes.map((route) => route.id === item.route.id ? prepared : route),
            }));
          } catch {
            if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
            set({ isOfflineMode: true });
          }
        }
        if (generation === syncGeneration && (await currentUserId()) === userId && !get().pendingRoutes.length && !get().pendingSocial.length && !get().routes.some((route) => route.user_id === LOCAL_USER_ID)) {
          set({ isOfflineMode: false });
        }
      },
      drainPendingSocial: async () => {
        const generation = syncGeneration;
        const userId = await currentUserId();
        if (userId === LOCAL_USER_ID) {
          set((state) => ({
            pendingSocial: state.pendingSocial.filter((item) => item.ownerId !== LOCAL_USER_ID),
          }));
          return;
        }
        if (generation !== syncGeneration) return;
        const pending = get().pendingSocial.filter((item) => item.ownerId === userId);
        for (const item of pending) {
          if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
          const table = item.kind === 'ascent' ? 'ascents' : 'comments';
          const payload = { ...item.payload, user_id: userId };
          const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
          if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
          if (!error || error.code === '23505') {
            set((state) => ({
              pendingSocial: state.pendingSocial.filter((candidate) => candidate !== item),
            }));
          } else {
            set({ isOfflineMode: true });
          }
        }
        if (generation === syncGeneration && !get().pendingSocial.length && !get().pendingRoutes.length && !get().routes.some((route) => route.user_id === LOCAL_USER_ID)) set({ isOfflineMode: false });
      },
      addAscent: async (routeId, ascent) => {
        const context = await captureMutationContext();
        if (!context) return false;
        const targetRoute = get().routes.find((route) => route.id === routeId);
        if (!targetRoute) return false;
        const userId = context.userId;
        const normalized = normalizeAscent(ascent, routeId, userId);
        const queuePending = () => set((state) => ({
          pendingSocial: [
            ...state.pendingSocial.filter((item) => !(item.routeId === routeId && item.kind === 'ascent' && item.payload.id === normalized.id)),
            { routeId, ownerId: userId, kind: 'ascent', payload: normalized },
          ],
          pendingRoutes: state.pendingRoutes.map((item) => item.route.id === routeId && item.ownerId === userId
            ? { ...item, route: { ...item.route, ascents: [...(item.route.ascents || []), normalized].filter((entry, index, values) => values.findIndex((candidate) => candidate.id === entry.id) === index) } }
            : item),
          isOfflineMode: true,
        }));
        if (!(await mutationStillCurrent(context))) return false;
        set((state) => ({
          routes: state.routes.map((route) => route.id === routeId
            ? { ...route, ascents: [...(route.ascents || []), normalized] }
            : route),
        }));
        const pendingCreate = get().pendingRoutes.some((item) => item.route.id === routeId && item.ownerId === userId);
        if (userId === LOCAL_USER_ID) return true;
        queuePending();
        if (pendingCreate) return true;
        try {
          const { error } = await supabase.from('ascents').insert({ ...normalized, user_id: userId });
          if (error) throw error;
          if (!(await mutationStillCurrent(context))) return false;
          set((state) => ({
            routes: state.routes.map((route) => route.id === routeId && !(route.ascents || []).some((item) => item.id === normalized.id)
              ? { ...route, ascents: [...(route.ascents || []), normalized] }
              : route),
            pendingSocial: state.pendingSocial.filter((item) => !(item.routeId === routeId && item.kind === 'ascent' && item.payload.id === normalized.id)),
          }));
          return true;
        } catch {
          return true;
        }
      },

      addComment: async (routeId, comment) => {
        const value = comment.content.trim();
        if (!value || value.length > 1000) return false;
        const context = await captureMutationContext();
        if (!context) return false;
        const targetRoute = get().routes.find((route) => route.id === routeId);
        if (!targetRoute) return false;
        const userId = context.userId;
        const normalized = normalizeComment({ ...comment, content: value }, routeId, userId);
        const queuePending = () => set((state) => ({
          pendingSocial: [
            ...state.pendingSocial.filter((item) => !(item.routeId === routeId && item.kind === 'comment' && item.payload.id === normalized.id)),
            { routeId, ownerId: userId, kind: 'comment', payload: normalized },
          ],
          pendingRoutes: state.pendingRoutes.map((item) => item.route.id === routeId && item.ownerId === userId
            ? { ...item, route: { ...item.route, comments: [...(item.route.comments || []), normalized].filter((entry, index, values) => values.findIndex((candidate) => candidate.id === entry.id) === index) } }
            : item),
          isOfflineMode: true,
        }));
        if (!(await mutationStillCurrent(context))) return false;
        set((state) => ({
          routes: state.routes.map((route) => route.id === routeId
            ? { ...route, comments: [...(route.comments || []), normalized] }
            : route),
        }));
        const pendingCreate = get().pendingRoutes.some((item) => item.route.id === routeId && item.ownerId === userId);
        if (userId === LOCAL_USER_ID) return true;
        queuePending();
        if (pendingCreate) return true;
        try {
          const { error } = await supabase.from('comments').insert({ ...normalized, user_id: userId });
          if (error) throw error;
          if (!(await mutationStillCurrent(context))) return false;
          set((state) => ({
            routes: state.routes.map((route) => route.id === routeId && !(route.comments || []).some((item) => item.id === normalized.id)
              ? { ...route, comments: [...(route.comments || []), normalized] }
              : route),
            pendingSocial: state.pendingSocial.filter((item) => !(item.routeId === routeId && item.kind === 'comment' && item.payload.id === normalized.id)),
          }));
          return true;
        } catch {
          return true;
        }
      },

      updateComment: async (routeId, commentId, content, isBeta) => {
        const value = content.trim();
        if (!value || value.length > 1000) return false;
        const context = await captureMutationContext();
        if (!context) return false;
        const route = get().routes.find((item) => item.id === routeId);
        const current = route?.comments?.find((comment) => comment.id === commentId);
        const currentIndex = route?.comments?.findIndex((comment) => comment.id === commentId) ?? -1;
        const pendingCreate = route ? get().pendingRoutes.some((item) => item.route.id === routeId && item.ownerId === context.userId) : false;
        if (!current || !(await mutationStillCurrent(context))) return false;
        set((state) => ({ routes: state.routes.map((route) => route.id === routeId ? { ...route, comments: (route.comments || []).map((comment) => comment.id === commentId ? { ...comment, content: value, is_beta: isBeta } : comment) } : route) }));
        if (current.user_id === LOCAL_USER_ID) return true;
        if (pendingCreate) {
          set((state) => ({
            pendingSocial: state.pendingSocial.map((item) =>
              item.routeId === routeId && item.kind === 'comment' && item.payload.id === commentId
                ? { ...item, payload: { ...item.payload, content: value, is_beta: isBeta } }
                : item
            ),
            pendingRoutes: state.pendingRoutes.map((item) => item.route.id === routeId && item.ownerId === context.userId
              ? { ...item, route: { ...item.route, comments: (item.route.comments || []).map((comment) => comment.id === commentId ? { ...comment, content: value, is_beta: isBeta } : comment) } }
              : item),
            isOfflineMode: true,
          }));
          return true;
        }
        try {
          const { error } = await supabase.from('comments').update({ content: value, is_beta: isBeta }).eq('id', commentId);
          if (error) throw error;
          return await mutationStillCurrent(context);
        } catch {
          if (!(await mutationStillCurrent(context))) return false;
          set((state) => ({
            routes: state.routes.map((item) => {
              if (item.id !== routeId) return item;
              const comments = (item.comments || []).filter((comment) => comment.id !== commentId);
              comments.splice(Math.max(0, Math.min(currentIndex, comments.length)), 0, current);
              return { ...item, comments };
            }),
            isOfflineMode: true,
          }));
          return false;
        }
      },

      deleteComment: async (routeId, commentId) => {
        const context = await captureMutationContext();
        if (!context) return false;
        const route = get().routes.find((item) => item.id === routeId);
        const current = route?.comments?.find((comment) => comment.id === commentId);
        const currentIndex = route?.comments?.findIndex((comment) => comment.id === commentId) ?? -1;
        const pendingCreate = route ? get().pendingRoutes.some((item) => item.route.id === routeId && item.ownerId === context.userId) : false;
        if (!current || !(await mutationStillCurrent(context))) return false;
        set((state) => ({ routes: state.routes.map((route) => route.id === routeId ? { ...route, comments: (route.comments || []).filter((comment) => comment.id !== commentId) } : route) }));
        if (current.user_id === LOCAL_USER_ID) return true;
        if (pendingCreate) {
          set((state) => ({
            pendingSocial: state.pendingSocial.filter((item) => !(item.routeId === routeId && item.kind === 'comment' && item.payload.id === commentId)),
            pendingRoutes: state.pendingRoutes.map((item) => item.route.id === routeId && item.ownerId === context.userId
              ? { ...item, route: { ...item.route, comments: (item.route.comments || []).filter((comment) => comment.id !== commentId) } }
              : item),
            isOfflineMode: true,
          }));
          return true;
        }
        try {
          const { error } = await supabase.from('comments').delete().eq('id', commentId);
          if (error) throw error;
          return await mutationStillCurrent(context);
        } catch {
          if (!(await mutationStillCurrent(context))) return false;
          set((state) => ({
            routes: state.routes.map((item) => {
              if (item.id !== routeId) return item;
              const comments = (item.comments || []).filter((comment) => comment.id !== commentId);
              comments.splice(Math.max(0, Math.min(currentIndex, comments.length)), 0, current);
              return { ...item, comments };
            }),
            isOfflineMode: true,
          }));
          return false;
        }
      },

      incrementViewCount: async (routeId) => {
        const context = await captureMutationContext();
        if (!context) return;
        const route = get().routes.find((item) => item.id === routeId);
        if (!route) return;
        if (!route.is_public || route.user_id === LOCAL_USER_ID || get().pendingRoutes.some((item) => item.route.id === routeId && item.ownerId === route.user_id)) return;
        if (!(await mutationStillCurrent(context))) return;
        try {
          const { data, error } = await supabase.rpc('increment_route_view', { target_route_id: routeId });
          if (error || typeof data !== 'number') throw error || new Error('View increment was not authorized');
          if (!(await mutationStillCurrent(context))) return;
          set((state) => ({ routes: state.routes.map((item) => item.id === routeId ? { ...item, view_count: data } : item) }));
        } catch {
          if (!(await mutationStillCurrent(context))) return;
          set({ isOfflineMode: true });
        }
      },

      hasUserClimbed: (routeId, suppliedUserId) => {
        const userId = suppliedUserId || getCurrentUserId();
        return Boolean(get().routes.find((route) => route.id === routeId)?.ascents?.some((ascent) => ascent.user_id === userId));
      },

      getLikeCount: (routeId) => {
        const route = get().routes.find((item) => item.id === routeId);
        return route?.like_count ?? route?.liked_by?.length ?? 0;
      },
      syncLocalRoutes: async (wallIdMap = {}, isCurrent) => {
        await waitForHydration();
        const generation = syncGeneration;
        const userId = await currentUserId();
        if (userId === LOCAL_USER_ID || generation !== syncGeneration || isCurrent && !isCurrent()) return;
        const localRoutes = get().routes.filter((route) => route.user_id === LOCAL_USER_ID);
        for (const route of localRoutes) {
          if (generation !== syncGeneration || (isCurrent && !isCurrent()) || await currentUserId() !== userId) return;
          const persistedWallMap = useWallsStore.getState().legacyIdMap;
          const persistedWallId = persistedWallMap[`${userId}:wall:${route.wall_id}`];
          const remappedWallId = wallIdMap[route.wall_id] || persistedWallId || route.wall_id;
          const hasWallMigration = route.wall_id !== 'default-wall' && Boolean(wallIdMap[route.wall_id] || persistedWallId);
          const migratedWall = hasWallMigration
            ? useWallsStore.getState().walls.find((wall) => wall.id === remappedWallId)
            : undefined;
          if (hasWallMigration && (!migratedWall || migratedWall.user_id === LOCAL_USER_ID)) continue;
          if (route.wall_id !== 'default-wall' && !wallIdMap[route.wall_id] && !persistedWallId && !isUuid(route.wall_id)) continue;
          const currentMap = get().legacyIdMap;
          const migratedId = currentMap[mappedIdKey(userId, 'route', route.id)] || ensureUuid(route.id);
          const ascentIds = (route.ascents || []).map((ascent) => ({ ...ascent, id: currentMap[mappedIdKey(userId, 'ascent', ascent.id)] || ensureUuid(ascent.id) }));
          const commentIds = (route.comments || []).map((comment) => ({ ...comment, id: currentMap[mappedIdKey(userId, 'comment', comment.id)] || ensureUuid(comment.id) }));
          const updates: Record<string, string> = { ...currentMap, [mappedIdKey(userId, 'route', route.id)]: migratedId };
          (route.ascents || []).forEach((ascent, index) => { updates[mappedIdKey(userId, 'ascent', ascent.id)] = ascentIds[index].id; });
          (route.comments || []).forEach((comment, index) => { updates[mappedIdKey(userId, 'comment', comment.id)] = commentIds[index].id; });
          set((state) => ({
            legacyIdMap: updates,
            pendingSocial: state.pendingSocial.map((item) => {
              if (item.ownerId !== userId || item.routeId !== route.id) return item;
              if (item.kind === 'ascent') return { ...item, routeId: migratedId, payload: { ...item.payload, route_id: migratedId } };
              return { ...item, routeId: migratedId, payload: { ...item.payload, route_id: migratedId } };
            }),
          }));
          const migratedAscents = ascentIds.map((ascent) => normalizeAscent(ascent, migratedId, userId));
          const migratedComments = commentIds.map((comment) => normalizeComment(comment, migratedId, userId));
          try {
            const routeSnapshotUrl = await uploadRouteSnapshot(route, userId, remappedWallId, migratedId);
            const persistedWallImageUrl = routeSnapshotUrl || (route.wall_id !== 'default-wall' ? migratedWall?.image_url : defaultWallStorageUrl());
            const migratedRoute: Route = {
              ...route,
              id: migratedId,
              user_id: userId,
              wall_id: remappedWallId,
              wall_image_url: persistedWallImageUrl,
              wall_image_width: route.wall_image_width || migratedWall?.image_width,
              wall_image_height: route.wall_image_height || migratedWall?.image_height,
              ascents: migratedAscents,
              comments: migratedComments,
            };
            const { error: routeError } = await supabase.from('routes').upsert(routePayload(migratedRoute, userId), { onConflict: 'id' });
            if (routeError) throw routeError;
            if (migratedAscents.length) {
              const { error } = await supabase.from('ascents').upsert(migratedAscents.map((ascent) => ({ ...ascent, user_id: userId })), { onConflict: 'id' });
              if (error) throw error;
            }
            if (migratedComments.length) {
              const { error } = await supabase.from('comments').upsert(migratedComments.map((comment) => ({ ...comment, user_id: userId })), { onConflict: 'id' });
              if (error) throw error;
            }
            if (generation !== syncGeneration || isCurrent && !isCurrent() || await currentUserId() !== userId) return;
            set((state) => ({ routes: state.routes.map((item) => item.id === route.id ? migratedRoute : item) }));
          } catch {
            if (generation === syncGeneration && (!isCurrent || isCurrent()) && await currentUserId() === userId) set({ isOfflineMode: true });
          }
        }
      },

      purgeAccountData: async (userId) => {
        if (!userId || userId === LOCAL_USER_ID) return;
        syncGeneration += 1;
        fetchGeneration += 1;
        set((state) => {
          const legacyIdMap = Object.fromEntries(Object.entries(state.legacyIdMap).filter(([key]) => !key.startsWith(`${userId}:`)));
          return {
            routes: state.routes
              .filter((route) => route.user_id !== userId)
              .map((route) => {
                const likedBy = route.liked_by?.filter((id) => id !== userId);
                return {
                  ...route,
                  is_liked: false,
                  ...(likedBy ? { liked_by: likedBy, like_count: likedBy.length } : {}),
                  ascents: (route.ascents || []).filter((ascent) => ascent.user_id !== userId),
                  comments: (route.comments || []).filter((comment) => comment.user_id !== userId),
                };
              }),
            pendingRoutes: state.pendingRoutes.filter((item) => item.ownerId !== userId),
            pendingSocial: state.pendingSocial.filter((item) => item.ownerId !== userId),
            legacyIdMap,
            isLoading: false,
          };
        });
        await AsyncStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify({ state: { routes: get().routes, pendingRoutes: get().pendingRoutes, pendingSocial: get().pendingSocial, legacyIdMap: get().legacyIdMap } }));
      },
      clearLocalData: async () => {
        syncGeneration += 1;
        fetchGeneration += 1;
        set({ routes: [], pendingRoutes: [], pendingSocial: [], legacyIdMap: {}, isLoading: false });
        await AsyncStorage.removeItem(ROUTE_STORAGE_KEY);
      },

      exportSnapshot: () => ({ routes: get().routes, exportedAt: new Date().toISOString() }),
    }),
    {
      name: ROUTE_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ routes: state.routes, pendingRoutes: state.pendingRoutes, pendingSocial: state.pendingSocial, legacyIdMap: state.legacyIdMap }),
      onRehydrateStorage: () => () => {
        setTimeout(() => useRoutesStore.setState({ hasHydrated: true }), 0);
        resolveHydration?.();
      },
    },
  ),
);
