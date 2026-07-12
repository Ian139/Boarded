import { create } from 'zustand';
import { supabase } from '../supabase';
import type { Route, Ascent, Comment } from '@climbset/shared';

interface RoutesState {
  routes: Route[];
  isLoading: boolean;
  isOfflineMode: boolean;

  fetchRoutes: () => Promise<void>;
  refreshRouteComments: (routeId: string) => Promise<void>;
  addRoute: (route: Route) => Promise<void>;
  updateRoute: (id: string, updates: Partial<Route>) => Promise<void>;
  deleteRoute: (id: string) => Promise<void>;
  toggleLike: (routeId: string) => Promise<void>;
  addAscent: (routeId: string, ascent: Ascent) => Promise<void>;
  addComment: (routeId: string, comment: Comment) => Promise<void>;
  updateComment: (routeId: string, commentId: string, content: string, isBeta: boolean) => Promise<void>;
  deleteComment: (routeId: string, commentId: string) => Promise<void>;
}

export const useRoutesStore = create<RoutesState>()(
  (set, get) => ({
    routes: [],
    isLoading: false,
    isOfflineMode: false,

    fetchRoutes: async () => {
      set({ isLoading: true });

      try {
        const { data: { user } } = await supabase.auth.getUser();
        const currentUserId = user?.id || 'local-user';

        // Fetch routes with ascents
        let result = await supabase
          .from('routes')
          .select(`
            *,
            ascents (*),
            comments (*)
          `)
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        if (result.error) {
          // Fallback without comments
          result = await supabase
            .from('routes')
            .select(`
              *,
              ascents (*)
            `)
            .eq('is_public', true)
            .order('created_at', { ascending: false });
        }

        if (result.error) {
          set({ isLoading: false, isOfflineMode: true });
          return;
        }

        // Fetch likes
        const { data: allLikes, error: likesError } = await supabase
          .from('route_likes')
          .select('route_id, user_id');

        const likesByRoute: Record<string, string[]> = {};
        if (!likesError && allLikes) {
          (allLikes as Array<{ route_id: string; user_id: string }>).forEach((like) => {
            if (!likesByRoute[like.route_id]) likesByRoute[like.route_id] = [];
            likesByRoute[like.route_id].push(like.user_id);
          });
        }

        const remoteRoutes = result.data?.map(r => {
          const likedBy = likesByRoute[r.id] || [];
          return {
            ...r,
            holds: r.holds || [],
            ascents: r.ascents || [],
            comments: r.comments || [],
            liked_by: likedBy,
            like_count: likedBy.length,
            is_liked: likedBy.includes(currentUserId),
          };
        });

        if (remoteRoutes) {
          set({
            routes: remoteRoutes,
            isLoading: false,
            isOfflineMode: false,
          });
        } else {
          set({ isLoading: false, isOfflineMode: false, routes: [] });
        }
      } catch {
        set({ isLoading: false, isOfflineMode: true });
      }
    },

    refreshRouteComments: async (routeId) => {
      try {
        const { data, error } = await supabase
          .from('comments')
          .select('*')
          .eq('route_id', routeId)
          .order('created_at', { ascending: true });

        if (error) return;

        set((state) => ({
          routes: state.routes.map((r) =>
            r.id === routeId ? { ...r, comments: (data as Comment[]) || [] } : r
          ),
        }));
      } catch {
        set({ isOfflineMode: true });
      }
    },

    addRoute: async (route) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const excludedRouteFields = new Set([
          'ascents',
          'wall',
          'user',
          'is_liked',
          'like_count',
          'liked_by',
          'comments',
        ]);
        const routeData = Object.fromEntries(
          Object.entries(route).filter(([key]) => !excludedRouteFields.has(key))
        );

        const { error } = await supabase.from('routes').insert({
          ...routeData,
          user_id: user?.id || null,
          is_public: true,
        });

        if (error) throw error;
        await get().fetchRoutes();
      } catch {
        set({ isOfflineMode: true });
      }
    },

    updateRoute: async (id, updates) => {
      try {
        const { error } = await supabase.from('routes').update({
          ...updates,
          updated_at: new Date().toISOString(),
        }).eq('id', id);

        if (error) throw error;
        await get().fetchRoutes();
      } catch {
        set({ isOfflineMode: true });
      }
    },

    deleteRoute: async (id) => {
      try {
        const { error } = await supabase.from('routes').delete().eq('id', id);
        if (error) throw error;
        await get().fetchRoutes();
      } catch {
        set({ isOfflineMode: true });
      }
    },

    toggleLike: async (routeId) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const route = get().routes.find(r => r.id === routeId);
      if (!route) return;

      const currentLikes = route.liked_by || [];
      const isCurrentlyLiked = currentLikes.includes(user.id);

      try {
        if (isCurrentlyLiked) {
          await supabase.from('route_likes').delete().eq('route_id', routeId).eq('user_id', user.id);
        } else {
          await supabase.from('route_likes').insert({ route_id: routeId, user_id: user.id });
        }
        await get().fetchRoutes();
      } catch {
        set({ isOfflineMode: true });
      }
    },

    addAscent: async (routeId, ascent) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('ascents').insert({
          id: ascent.id,
          route_id: routeId,
          user_id: user?.id || null,
          user_name: ascent.user_name,
          grade_v: ascent.grade_v,
          rating: ascent.rating,
          notes: ascent.notes,
          flashed: ascent.flashed,
        });
        if (error) throw error;
        await get().fetchRoutes();
      } catch {
        set({ isOfflineMode: true });
      }
    },

    addComment: async (routeId, comment) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('comments').insert({
          id: comment.id,
          route_id: routeId,
          user_id: user?.id || null,
          user_name: comment.user_name,
          content: comment.content,
          is_beta: comment.is_beta,
        });
        if (error) throw error;
        await get().refreshRouteComments(routeId);
      } catch {
        set({ isOfflineMode: true });
      }
    },

    updateComment: async (routeId, commentId, content, isBeta) => {
      try {
        const { error } = await supabase
          .from('comments')
          .update({ content, is_beta: isBeta })
          .eq('id', commentId);
        if (error) throw error;
        await get().refreshRouteComments(routeId);
      } catch {
        set({ isOfflineMode: true });
      }
    },

    deleteComment: async (routeId, commentId) => {
      try {
        const { error } = await supabase
          .from('comments')
          .delete()
          .eq('id', commentId);
        if (error) throw error;
        await get().refreshRouteComments(routeId);
      } catch {
        set({ isOfflineMode: true });
      }
    },
  })
);
