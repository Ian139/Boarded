'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient, type BrowserSupabaseClient } from '@/lib/supabase/client';
import type { Route, Ascent, Comment } from '@climbset/shared/types';
import { canonicalizeGrade, normalizeRouteGrades } from '@climbset/shared/utils/grades';
import { nanoid } from 'nanoid';
import { getWallStoragePathFromUrl } from '@/lib/utils/storage';

interface RoutesState {
  routes: Route[];
  isLoading: boolean;
  isOfflineMode: boolean;

  // Actions
  addRoute: (route: Route) => Promise<boolean>;
  updateRoute: (id: string, updates: Partial<Route>) => Promise<boolean>;
  deleteRoute: (id: string) => Promise<boolean>;
  getRoutesByWall: (wallId: string) => Route[];
  addAscent: (routeId: string, ascent: Ascent) => Promise<boolean>;
  removeAscent: (routeId: string, ascentId: string) => Promise<boolean>;
  hasUserClimbed: (routeId: string, userId: string) => boolean;

  // Comment actions
  addComment: (routeId: string, comment: Comment) => Promise<boolean>;
  deleteComment: (routeId: string, commentId: string) => Promise<boolean>;

  // View & Like actions
  incrementViewCount: (routeId: string) => Promise<void>;
  toggleLike: (routeId: string, userId: string) => Promise<boolean>;
  isLikedByUser: (routeId: string, userId: string) => boolean;
  getLikeCount: (routeId: string) => number;

  // Sync actions
  fetchRoutes: () => Promise<void>;
  fetchRouteById: (id: string) => Promise<Route | null>;
  syncLocalRoutes: () => Promise<void>;
  clearRemoteRoutes: (currentUserId?: string) => void;
}

type RouteRelationKey = 'ascents' | 'comments' | 'wall' | 'user' | 'is_liked' | 'like_count' | 'liked_by' | '_snapshotSyncPending' | '_socialSyncPending' | '_createSyncPending';

function stripRouteRelations<T extends Partial<Route>>(route: T): Omit<T, RouteRelationKey> {
  const persisted = { ...route };
  delete persisted.ascents;
  delete persisted.comments;
  delete persisted.wall;
  delete persisted.user;
  delete persisted.is_liked;
  delete persisted.like_count;
  delete persisted.liked_by;
  delete (persisted as Record<string, unknown>)._snapshotSyncPending;
  delete (persisted as Record<string, unknown>)._socialSyncPending;
  delete (persisted as Record<string, unknown>)._createSyncPending;
  return persisted as Omit<T, RouteRelationKey>;
}
type LocalRoute = Route & { _snapshotSyncPending?: boolean; _socialSyncPending?: boolean; _createSyncPending?: boolean };

let routeFetchGeneration = 0;
let routeSyncGeneration = 0;
let routeSyncLock = Promise.resolve();
let routeAuthGeneration = 0;

function isMissingSnapshotColumnsError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' ||
    /wall_image_(width|height)|column .*does not exist|could not find the .*column/i.test(error.message || '');
}
function isDuplicateRouteError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '23505' || /duplicate key|already exists/i.test(error?.message || '');
}

async function ownsRemoteRoute(supabase: BrowserSupabaseClient, routeId: string, userId: string) {
  const { data, error } = await supabase.from('routes').select('id, user_id').eq('id', routeId).maybeSingle();
  return !error && data?.user_id === userId;
}

function isCurrentStorageHost(source: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https?:\/\/[^/]+/i)?.[0].toLowerCase();
  const sourceOrigin = source.match(/^https?:\/\/[^/]+/i)?.[0].toLowerCase();
  return Boolean(configuredOrigin && sourceOrigin && configuredOrigin === sourceOrigin);
}
function isCurrentRouteSnapshot(sourcePath: string | null, route: Route, userId: string) {
  if (!sourcePath || !isCurrentStorageHost(route.wall_image_url || '')) return false;
  const wallId = route.wall_id.replace(/[^a-zA-Z0-9_-]/g, '-');
  const routeId = route.id.replace(/[^a-zA-Z0-9_-]/g, '-');
  return sourcePath.startsWith(`${userId}/${wallId}/route-${routeId}.`);
}

async function normalizeRouteImage(supabase: BrowserSupabaseClient, route: Route, userId: string) {
  const source = route.wall_image_url;
  const sourcePath = source && /^https?:\/\//i.test(source) ? getWallStoragePathFromUrl(source) : null;
  const hasCurrentRouteSnapshot = isCurrentRouteSnapshot(sourcePath, route, userId);
  if (!source || hasCurrentRouteSnapshot || /^https?:\/\//i.test(source) && !sourcePath) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to read route wall snapshot (${response.status})`);
  const blob = await response.blob();
  const contentType = blob.type || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const wallId = route.wall_id.replace(/[^a-zA-Z0-9_-]/g, '-');
  const routeId = route.id.replace(/[^a-zA-Z0-9_-]/g, '-');
  const path = `${userId}/${wallId}/route-${routeId}.${extension}`;
  const { error } = await supabase.storage.from('walls').upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from('walls').getPublicUrl(path).data.publicUrl;
}

function routeDataWithoutSnapshotDimensions(routeData: Record<string, unknown>) {
  const fallback = { ...routeData };
  delete fallback.wall_image_width;
  delete fallback.wall_image_height;
  return fallback;
}

export const useRoutesStore = create<RoutesState>()(
  persist(
    (set, get) => ({
      routes: [],
      isLoading: false,
      isOfflineMode: false,

      // Fetch routes allowed by Supabase RLS (public plus the signed-in user's private routes).
      fetchRoutes: async () => {
        const fetchGeneration = ++routeFetchGeneration;
        set({ isLoading: true });

        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          const currentUserId = user?.id || 'local-user';

          // Try fetching routes with related data (comments may not exist in some DBs)
          let result = await supabase
            .from('routes')
            .select(`
              *,
              ascents (*),
              comments (*)
            `)
            .order('created_at', { ascending: false });

          if (result.error) {
            // Fallback: comments table/relation may not exist
            result = await supabase
              .from('routes')
              .select(`
                *,
                ascents (*)
              `)
              .order('created_at', { ascending: false });
          }

          if (result.error) {
            // Supabase not configured or permissions issue - keep existing local data
            if (fetchGeneration === routeFetchGeneration) set({ isLoading: false, isOfflineMode: true });
            return;
          }

          // Fetch likes separately to avoid join issues
          const { data: allLikes, error: likesError } = await supabase
            .from('route_likes')
            .select('route_id, user_id');

          // Group likes by route_id
          const likesByRoute: Record<string, string[]> = {};
          if (!likesError) {
            const likes = (allLikes || []) as Array<{ route_id: string; user_id: string }>;
            likes.forEach((like) => {
              if (!likesByRoute[like.route_id]) {
                likesByRoute[like.route_id] = [];
              }
              likesByRoute[like.route_id].push(like.user_id);
            });
          }

          const existingRoutes = get().routes.map((route) => normalizeRouteGrades(route));
          const remoteRoutes = result.data?.map(r => {
            const likedBy = likesByRoute[r.id] || [];
            const localSnapshot = existingRoutes.find(existing => existing.id === r.id);
            const ownedSnapshot = localSnapshot?.user_id === currentUserId && r.user_id === currentUserId
              ? localSnapshot as LocalRoute
              : undefined;
            return normalizeRouteGrades({
              ...r,
              // Older schemas do not return these columns. Keep the local snapshot
              // until a later full-schema sync can persist it.
              wall_image_url: r.wall_image_url ?? ownedSnapshot?.wall_image_url,
              wall_image_width: r.wall_image_width ?? ownedSnapshot?.wall_image_width,
              wall_image_height: r.wall_image_height ?? ownedSnapshot?.wall_image_height,
              _snapshotSyncPending: ownedSnapshot?._snapshotSyncPending,
              _socialSyncPending: ownedSnapshot?._socialSyncPending,
              _createSyncPending: ownedSnapshot?._createSyncPending,
              holds: r.holds || [],
              ascents: ownedSnapshot?._socialSyncPending
                ? ownedSnapshot.ascents || r.ascents || []
                : r.ascents || [],
              comments: ownedSnapshot?._socialSyncPending
                ? ownedSnapshot.comments || r.comments || []
                : r.comments || [],
              liked_by: likedBy,
              like_count: likedBy.length,
              is_liked: likedBy.includes(currentUserId),
            }) as LocalRoute;
          });

          const { data: { user: latestUser } } = await supabase.auth.getUser();
          if (
            fetchGeneration !== routeFetchGeneration ||
            (latestUser?.id || 'local-user') !== currentUserId
          ) {
            return;
          }
          if (remoteRoutes) {
            // Keep local-only routes and any local snapshot metadata for older rows.
            const localRoutes = existingRoutes.filter(r =>
              r.user_id === 'local-user' ||
              (((r as LocalRoute)._snapshotSyncPending || (r as LocalRoute)._socialSyncPending || (r as LocalRoute)._createSyncPending) && r.user_id === currentUserId)
            );
            const mergedRoutes = [
              ...remoteRoutes,
              ...localRoutes.filter(localRoute =>
                !remoteRoutes.some(remoteRoute => remoteRoute.id === localRoute.id)
              ),
            ];

            set({
              routes: mergedRoutes,
              isLoading: false,
              isOfflineMode: false,
            });
          } else {
            set({ isLoading: false, isOfflineMode: false });
          }
        } catch {
          // Network error - keep existing local data
          if (fetchGeneration !== routeFetchGeneration) return;
          set({ isLoading: false, isOfflineMode: true });
        }
      },
      clearRemoteRoutes: (currentUserId) => {
        routeFetchGeneration += 1;
        routeSyncGeneration += 1;
        routeAuthGeneration += 1;
        set((state) => ({
          routes: state.routes.filter((route) =>
            route.user_id === 'local-user' ||
            (currentUserId && ((route as LocalRoute)._snapshotSyncPending || (route as LocalRoute)._socialSyncPending || (route as LocalRoute)._createSyncPending) && route.user_id === currentUserId)
          ),
          isLoading: false,
        }));
      },

      // Fetch one route for an authenticated edit flow, including private routes.
      fetchRouteById: async (id) => {
        const authGeneration = routeAuthGeneration;
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const { data, error } = await supabase
          .from('routes')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error || !data) return null;
        const { data: { user: latestUser } } = await supabase.auth.getUser();
        if (authGeneration !== routeAuthGeneration || latestUser?.id !== user.id) return null;

        const existing = get().routes.find((route) => route.id === id);
        const ownedExisting = existing?.user_id === user.id && data.user_id === user.id
          ? existing as LocalRoute
          : undefined;
        const route = normalizeRouteGrades({
          ...data,
          wall_image_url: data.wall_image_url ?? ownedExisting?.wall_image_url,
          wall_image_width: data.wall_image_width ?? ownedExisting?.wall_image_width,
          wall_image_height: data.wall_image_height ?? ownedExisting?.wall_image_height,
          _snapshotSyncPending: ownedExisting?._snapshotSyncPending,
          _socialSyncPending: ownedExisting?._socialSyncPending,
          _createSyncPending: ownedExisting?._createSyncPending,
          holds: data.holds || [],
          ascents: ownedExisting?.ascents || [],
          comments: ownedExisting?.comments || [],
        }) as Route & LocalRoute;

        set((state) => ({
          routes: state.routes.some((candidate) => candidate.id === id)
            ? state.routes.map((candidate) => candidate.id === id ? route : candidate)
            : [...state.routes, route],
        }));
        return route;
      },

      syncLocalRoutes: async () => {
        const authGeneration = routeAuthGeneration;
        const previousSync = routeSyncLock;
        const { promise: syncDone, resolve: releaseSync } = Promise.withResolvers<void>();
        routeSyncLock = syncDone;
        await previousSync;
        if (authGeneration !== routeAuthGeneration) {
          releaseSync();
          return;
        }
        try {
          const syncGeneration = ++routeSyncGeneration;
          const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const localRoutes = get().routes.filter(r =>
          r.user_id === 'local-user' ||
          (((r as LocalRoute)._snapshotSyncPending || (r as LocalRoute)._socialSyncPending || (r as LocalRoute)._createSyncPending) && r.user_id === user.id)
        );

        for (const route of localRoutes) {
          if (syncGeneration !== routeSyncGeneration || authGeneration !== routeAuthGeneration) return;
          const localRoute = route as LocalRoute;
          let routeForSync = localRoute;
          try {
            const wallImageUrl = await normalizeRouteImage(supabase, localRoute, user.id);
            if (syncGeneration !== routeSyncGeneration || authGeneration !== routeAuthGeneration) return;
            if (wallImageUrl !== localRoute.wall_image_url) {
              routeForSync = { ...localRoute, wall_image_url: wallImageUrl };
              set((state) => ({
                routes: state.routes.map((candidate) => candidate.id === route.id
                  ? { ...candidate, wall_image_url: wallImageUrl }
                  : candidate),
              }));
            }
          } catch (error) {
            console.error('Failed to migrate route wall image:', error);
            continue;
          }
          const routeData = stripRouteRelations(routeForSync) as Record<string, unknown>;
          const snapshot = {
            wall_image_width: localRoute.wall_image_width,
            wall_image_height: localRoute.wall_image_height,
          };
          let synced = false;
          let remoteRouteAvailable = false;
          let snapshotSyncPending = localRoute._snapshotSyncPending ?? false;

          // A previous pre-011 insert may have succeeded without dimensions.
          // Retry only the metadata first so a later migration can complete it.
          if (localRoute._snapshotSyncPending && !localRoute._createSyncPending) {
            remoteRouteAvailable = true;
            const { data: snapshotData, error: snapshotError } = await supabase
              .from('routes')
              .update(snapshot)
              .eq('id', route.id)
              .select('id')
              .maybeSingle();
            if (syncGeneration !== routeSyncGeneration || authGeneration !== routeAuthGeneration) return;
            if (!snapshotError && snapshotData) {
              synced = true;
              remoteRouteAvailable = true;
              snapshotSyncPending = false;
            } else if (!isMissingSnapshotColumnsError(snapshotError)) {
              console.error('Failed to sync route snapshot metadata:', snapshotError);
            }
          } else if (localRoute._socialSyncPending && !localRoute._createSyncPending) {
            synced = true;
            remoteRouteAvailable = true;
          } else {
            const firstInsert = await supabase
              .from('routes')
              .insert({
                ...routeData,
                user_id: user.id,
                is_public: localRoute.is_public,
              });
            if (syncGeneration !== routeSyncGeneration || authGeneration !== routeAuthGeneration) return;

            if (!firstInsert.error) {
              synced = true;
              remoteRouteAvailable = true;
            } else if (isDuplicateRouteError(firstInsert.error)) {
              if (await ownsRemoteRoute(supabase, route.id, user.id)) {
                synced = true;
                remoteRouteAvailable = true;
                snapshotSyncPending = localRoute.wall_image_width !== undefined || localRoute.wall_image_height !== undefined;
              } else {
                console.error('Failed to verify existing local route:', firstInsert.error);
              }
            } else if (isMissingSnapshotColumnsError(firstInsert.error)) {
              const fallbackInsert = await supabase
                .from('routes')
                .insert({
                  ...routeDataWithoutSnapshotDimensions(routeData),
                  user_id: user.id,
                  is_public: localRoute.is_public,
                });
              if (syncGeneration !== routeSyncGeneration || authGeneration !== routeAuthGeneration) return;
              if (!fallbackInsert.error) {
                const hasSnapshot = localRoute.wall_image_width !== undefined || localRoute.wall_image_height !== undefined;
                snapshotSyncPending = hasSnapshot;
                set((state) => ({
                  routes: state.routes.map(r => {
                    if (r.id !== route.id) return r;
                    const next = { ...r, user_id: user.id } as LocalRoute;
                    if (hasSnapshot) next._snapshotSyncPending = true;
                    else delete next._snapshotSyncPending;
                    return next;
                  }),
                }));
                remoteRouteAvailable = true;
                synced = true;
              } else if (isDuplicateRouteError(fallbackInsert.error) && await ownsRemoteRoute(supabase, route.id, user.id)) {
                snapshotSyncPending = localRoute.wall_image_width !== undefined || localRoute.wall_image_height !== undefined;
                remoteRouteAvailable = true;
                synced = true;
              } else {
                console.error('Failed to sync local route:', fallbackInsert.error);
              }
            } else if (localRoute.wall_image_width !== undefined || localRoute.wall_image_height !== undefined) {
              const { data: snapshotData, error: snapshotError } = await supabase
                .from('routes')
                .update(snapshot)
                .eq('id', route.id)
                .select('id')
                .maybeSingle();
              if (syncGeneration !== routeSyncGeneration || authGeneration !== routeAuthGeneration) return;
              if (!snapshotError && snapshotData) {
                synced = true;
                remoteRouteAvailable = true;
              }
            } else {
              console.error('Failed to sync local route:', firstInsert.error);
            }
          }
          if (syncGeneration !== routeSyncGeneration || authGeneration !== routeAuthGeneration) return;
          let socialSyncPending = false;
          if (remoteRouteAvailable) {
            const ascents = (localRoute.ascents || []).map((ascent) => ({
              ...ascent,
              route_id: route.id,
              user_id: user.id,
            }));
            if (ascents.length) {
              const { error } = await supabase.from('ascents').upsert(ascents);
              if (syncGeneration !== routeSyncGeneration || authGeneration !== routeAuthGeneration) return;
              if (error) {
                socialSyncPending = true;
                console.error('Failed to sync route ascents:', error);
              }
            }
            const comments = (localRoute.comments || []).map((comment) => ({
              ...comment,
              route_id: route.id,
              user_id: user.id,
            }));
            if (comments.length) {
              const { error } = await supabase.from('comments').upsert(comments);
              if (syncGeneration !== routeSyncGeneration || authGeneration !== routeAuthGeneration) return;
              if (error) {
                socialSyncPending = true;
                console.error('Failed to sync route comments:', error);
              }
            }
          }
          if (synced || snapshotSyncPending || socialSyncPending) {
            set((state) => ({
              routes: state.routes.map(r => r.id === route.id
                ? (() => {
                    const next = { ...r, user_id: user.id } as LocalRoute;
                    if (snapshotSyncPending) next._snapshotSyncPending = true;
                    else delete next._snapshotSyncPending;
                    if (socialSyncPending) next._socialSyncPending = true;
                    else delete next._socialSyncPending;
                    delete next._createSyncPending;
                    return next;
                  })()
                : r),
            }));
          }
        }
        } finally {
          releaseSync();
        }
      },

      addRoute: async (route) => {
        const authGeneration = routeAuthGeneration;
        const ensuredRoute = normalizeRouteGrades(
          route.share_token ? route : { ...route, share_token: nanoid(10) }
        );
        // Add to local state immediately
        set((state) => ({
          routes: [ensuredRoute, ...state.routes]
        }));
        const markCreatePending = () => set((state) => ({
          routes: state.routes.map(r => r.id === ensuredRoute.id
            ? { ...r, _createSyncPending: true } as LocalRoute
            : r),
          isOfflineMode: true,
        }));

        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (authGeneration !== routeAuthGeneration) return true;
          // Signed-out routes stay local; never create unowned remote rows.
          if (!user) return true;
          let routeForPersistence = ensuredRoute;
          const wallImageUrl = await normalizeRouteImage(supabase, ensuredRoute, user.id);
          if (authGeneration !== routeAuthGeneration) return true;
          if (wallImageUrl !== ensuredRoute.wall_image_url) {
            routeForPersistence = { ...ensuredRoute, wall_image_url: wallImageUrl };
            set((state) => ({
              routes: state.routes.map(r => r.id === ensuredRoute.id
                ? { ...r, wall_image_url: wallImageUrl }
                : r),
            }));
          }
          const routeData = stripRouteRelations(routeForPersistence) as Record<string, unknown>;
          const payload = {
            ...routeData,
            user_id: user.id,
            is_public: routeForPersistence.is_public,
          };

          let result = await supabase
            .from('routes')
            .insert(payload)
            .select('id')
            .maybeSingle();
          if (authGeneration !== routeAuthGeneration) return true;

          if (result.error && isMissingSnapshotColumnsError(result.error)) {
            result = await supabase
              .from('routes')
              .insert({
                ...routeDataWithoutSnapshotDimensions(routeData),
                user_id: user.id,
                is_public: routeForPersistence.is_public,
              })
              .select('id')
              .maybeSingle();
            if (authGeneration !== routeAuthGeneration) return true;

            if (!result.error && (routeForPersistence.wall_image_width !== undefined || routeForPersistence.wall_image_height !== undefined)) {
              // Keep dimensions locally when migration 011 is not deployed.
              set((state) => ({
                routes: state.routes.map(r => r.id === ensuredRoute.id
                  ? { ...r, _snapshotSyncPending: true } as Route
                  : r),
              }));
            }
          }

          if (result.error || !result.data) {
            const saveError = result.error || new Error('Route insert was not authorized');
            console.error('Failed to save route:', saveError);
            markCreatePending();
            return true;
          }
          if (authGeneration !== routeAuthGeneration) return true;
          set((state) => ({
            routes: state.routes.map(r => r.id === ensuredRoute.id
              ? { ...r, user_id: user.id } as Route
              : r),
          }));
          return true;
        } catch (error) {
          console.error('Failed to save route:', error);
          markCreatePending();
          return true;
        }
      },

      updateRoute: async (id, updates) => {
        const previousRoute = get().routes.find((route) => route.id === id);
        if (!previousRoute) return false;
        const authGeneration = routeAuthGeneration;
        const nextRoute = normalizeRouteGrades({
          ...previousRoute,
          ...updates,
          updated_at: new Date().toISOString(),
        });
        const normalizedUpdates: Partial<Route> = { ...updates };
        if ('grade_v' in updates) normalizedUpdates.grade_v = nextRoute.grade_v;
        if ('ascents' in updates) normalizedUpdates.ascents = nextRoute.ascents;

        set((state) => ({
          routes: state.routes.map((route) =>
            route.id === id ? nextRoute : route
          ),
        }));

        if (previousRoute.user_id === 'local-user' || (previousRoute as LocalRoute)._createSyncPending) return true;

        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('routes')
            .update(stripRouteRelations(normalizedUpdates))
            .eq('id', id)
            .select('id')
            .maybeSingle();
          if (error || !data) throw error || new Error('Route update was not authorized');
          return true;
        } catch {
          if (authGeneration !== routeAuthGeneration) return false;
          set((state) => ({
            routes: state.routes.map((route) => route.id === id ? previousRoute : route),
          }));
          return false;
        }
      },

      deleteRoute: async (id) => {
        const route = get().routes.find(r => r.id === id);
        if (!route) return false;
        const authGeneration = routeAuthGeneration;
        set((state) => ({ routes: state.routes.filter((r) => r.id !== id) }));
        if (route.user_id === 'local-user' || (route as LocalRoute)._createSyncPending) return true;
        try {
          const supabase = createClient();
          const { data, error } = await supabase.from('routes').delete().eq('id', id).select('id').maybeSingle();
          if (error || !data) throw error || new Error('Route deletion was not authorized');
          return true;
        } catch (error) {
          if (authGeneration !== routeAuthGeneration) return false;
          console.error('Failed to delete route:', error);
          set((state) => ({ routes: [route, ...state.routes] }));
          return false;
        }
      },

      getRoutesByWall: (wallId) =>
        get().routes.filter((r) => r.wall_id === wallId),
      addAscent: async (routeId, ascent) => {
        const previousRoute = get().routes.find(r => r.id === routeId);
        const normalizedAscent = {
          ...ascent,
          grade_v: canonicalizeGrade(ascent.grade_v),
        };
        if (!previousRoute) return false;
        const isLocalOnly = previousRoute.user_id === 'local-user' || (previousRoute as LocalRoute)._createSyncPending;
        const applyLocal = () => set((state) => ({
          routes: state.routes.map((r) =>
            r.id === routeId
              ? { ...r, ascents: [...(r.ascents || []), normalizedAscent], updated_at: new Date().toISOString() }
              : r
          ),
        }));
        if (isLocalOnly) {
          applyLocal();
          return true;
        }

        const authGeneration = routeAuthGeneration;
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return false;
          applyLocal();
          const { error } = await supabase
            .from('ascents')
            .insert({
              id: normalizedAscent.id,
              route_id: routeId,
              user_id: user.id,
              user_name: normalizedAscent.user_name,
              grade_v: normalizedAscent.grade_v,
              rating: ascent.rating,
              notes: ascent.notes,
              flashed: ascent.flashed,
            });
          if (error) throw error;
          return true;
        } catch (error) {
          if (authGeneration !== routeAuthGeneration) return false;
          console.error('Failed to save ascent:', error);
          set((state) => ({
            routes: state.routes.map((r) => r.id === routeId ? previousRoute : r),
          }));
          return false;
        }
      },

      removeAscent: async (routeId, ascentId) => {
        const previousRoute = get().routes.find(r => r.id === routeId);
        if (!previousRoute) return false;
        const authGeneration = routeAuthGeneration;

        set((state) => ({
          routes: state.routes.map((r) =>
            r.id === routeId
              ? { ...r, ascents: (r.ascents || []).filter((a) => a.id !== ascentId), updated_at: new Date().toISOString() }
              : r
          ),
        }));
        if (previousRoute.user_id === 'local-user' || (previousRoute as LocalRoute)._createSyncPending) return true;

        try {
          const supabase = createClient();
          const { error } = await supabase
            .from('ascents')
            .delete()
            .eq('id', ascentId);
          if (error) throw error;
          return true;
        } catch (error) {
          if (authGeneration !== routeAuthGeneration) return false;
          console.error('Failed to remove ascent:', error);
          set((state) => ({
            routes: state.routes.map((r) => r.id === routeId ? previousRoute : r),
          }));
          return false;
        }
      },
      hasUserClimbed: (routeId, userId) => {
        const route = get().routes.find((r) => r.id === routeId);
        return route?.ascents?.some((a) => a.user_id === userId) || false;
      },

      addComment: async (routeId, comment) => {
        const previousRoute = get().routes.find(r => r.id === routeId);
        if (!previousRoute) return false;
        const isLocalOnly = previousRoute.user_id === 'local-user' || (previousRoute as LocalRoute)._createSyncPending;
        const applyLocal = () => set((state) => ({
          routes: state.routes.map((r) =>
            r.id === routeId
              ? { ...r, comments: [...(r.comments || []), comment], updated_at: new Date().toISOString() }
              : r
          ),
        }));
        if (isLocalOnly) {
          applyLocal();
          return true;
        }

        const authGeneration = routeAuthGeneration;
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return false;
          applyLocal();
          const { error } = await supabase
            .from('comments')
            .insert({
              id: comment.id,
              route_id: routeId,
              user_id: user.id,
              user_name: comment.user_name,
              content: comment.content,
              is_beta: comment.is_beta,
            });
          if (error) throw error;
          return true;
        } catch (error) {
          if (authGeneration !== routeAuthGeneration) return false;
          console.error('Failed to save comment:', error);
          if (previousRoute) {
            set((state) => ({
              routes: state.routes.map((r) => r.id === routeId ? previousRoute : r),
            }));
          }
          return false;
        }
      },

      deleteComment: async (routeId, commentId) => {
        const previousRoute = get().routes.find(r => r.id === routeId);

        const authGeneration = routeAuthGeneration;
        if (previousRoute) {
          set((state) => ({
            routes: state.routes.map((r) =>
              r.id === routeId
                ? { ...r, comments: (r.comments || []).filter((c) => c.id !== commentId), updated_at: new Date().toISOString() }
                : r
            ),
          }));
        }
        if (previousRoute?.user_id === 'local-user' || (previousRoute && (previousRoute as LocalRoute)._createSyncPending)) return true;

        try {
          const supabase = createClient();
          const { error } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId);
          if (error) throw error;
          return true;
        } catch (error) {
          if (authGeneration !== routeAuthGeneration) return false;
          console.error('Failed to delete comment:', error);
          if (previousRoute) {
            set((state) => ({
              routes: state.routes.map((r) => r.id === routeId ? previousRoute : r),
            }));
          }
          return false;
        }
      },

      incrementViewCount: async (routeId) => {
        const authGeneration = routeAuthGeneration;
        const route = get().routes.find((r) => r.id === routeId);
        if (!route || route.user_id === 'local-user' || (route as LocalRoute)._createSyncPending || !route.is_public) return;
        try {
          const supabase = createClient();
          const { data, error } = await supabase.rpc('increment_route_view', { target_route_id: routeId });
          if (authGeneration !== routeAuthGeneration) return;
          if (error || typeof data !== 'number') throw error || new Error('View increment was not authorized');
          set((state) => ({ routes: state.routes.map((r) => r.id === routeId ? { ...r, view_count: data } : r) }));
        } catch {
          // Keep the last confirmed server count.
        }
      },
      toggleLike: async (routeId, localUserId) => {
        const authGeneration = routeAuthGeneration;
        const route = get().routes.find(r => r.id === routeId);
        if (!route) return false;
        if (route.user_id === 'local-user' || (route as LocalRoute)._createSyncPending) return true;
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (authGeneration !== routeAuthGeneration) return false;
        const userId = user?.id || localUserId;

        const currentLikes = route.liked_by || [];
        const isCurrentlyLiked = currentLikes.includes(userId);
        const newLikes = isCurrentlyLiked
          ? currentLikes.filter((id: string) => id !== userId)
          : [...currentLikes, userId];

        set((state) => ({
          routes: state.routes.map((r) =>
            r.id === routeId
              ? { ...r, liked_by: newLikes, like_count: newLikes.length, is_liked: !isCurrentlyLiked }
              : r
          ),
        }));

        if (!user) return true;

        try {
          const result = isCurrentlyLiked
            ? await supabase
                .from('route_likes')
                .delete()
                .eq('route_id', routeId)
                .eq('user_id', user.id)
            : await supabase
                .from('route_likes')
                .insert({ route_id: routeId, user_id: user.id });
          if (authGeneration !== routeAuthGeneration) return false;
          if (result.error) throw result.error;
          return true;
        } catch (error) {
          if (authGeneration !== routeAuthGeneration) return false;
          console.error('Failed to update route like:', error);
          set((state) => ({
            routes: state.routes.map((r) =>
              r.id === routeId
                ? { ...r, liked_by: currentLikes, like_count: currentLikes.length, is_liked: isCurrentlyLiked }
                : r
            ),
          }));
          return false;
        }
      },

      isLikedByUser: (routeId, userId) => {
        const route = get().routes.find((r) => r.id === routeId);
        if (!route) return false;
        // Check is_liked first (set during fetch with correct user), fallback to liked_by array
        if (route.is_liked !== undefined) return route.is_liked;
        const likedBy = route.liked_by || [];
        return likedBy.includes(userId);
      },

      getLikeCount: (routeId) => {
        const route = get().routes.find(r => r.id === routeId);
        if (!route) return 0;
        return route.liked_by?.length || route.like_count || 0;
      },
    }),
    {
      name: 'climbset-routes',
      partialize: (state) => ({
        routes: state.routes,
      }),
      merge: (persistedState, currentState) => {
        const persistedRoutes = (persistedState as Partial<RoutesState> | null)?.routes;
        return {
          ...currentState,
          routes: Array.isArray(persistedRoutes)
            ? persistedRoutes.map((route) => normalizeRouteGrades(route))
            : currentState.routes,
        };
      },
    }
  )
);
