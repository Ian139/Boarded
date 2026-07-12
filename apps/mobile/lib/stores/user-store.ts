import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import type { Profile } from '@climbset/shared';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

interface UserState {
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isProfileSyncing: boolean;
  profileSyncError: string | null;
  lastProfileSyncAt: string | null;

  signup: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  syncProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  uploadAvatar: (file: { uri: string; name?: string; type?: string }) => Promise<string | null>;
}

function mapSupabaseUser(user: SupabaseUser): User {
  const email = user.email || '';
  const displayName = user.user_metadata?.display_name || email.split('@')[0] || 'Climber';
  return {
    id: user.id,
    email,
    displayName,
    createdAt: user.created_at,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function buildUsername(displayName: string, email: string, userId: string) {
  const base = slugify(displayName || email.split('@')[0] || 'climber') || 'climber';
  return `${base}-${userId.slice(0, 4)}`;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isAuthenticated: false,
      isLoading: true,
      isProfileSyncing: false,
      profileSyncError: null,
      lastProfileSyncAt: null,

      initializeAuth: async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            const user = mapSupabaseUser(session.user);
            set({ user, isAuthenticated: true, isLoading: false });
            await get().syncProfile();
          } else {
            set({ isLoading: false });
          }

          supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
              const user = mapSupabaseUser(session.user);
              set({ user, isAuthenticated: true });
              get().syncProfile();
            } else {
              set({
                user: null,
                profile: null,
                isAuthenticated: false,
                isProfileSyncing: false,
                profileSyncError: null,
                lastProfileSyncAt: null,
              });
            }
          });
        } catch {
          set({ isLoading: false });
        }
      },

      signup: async (email, password, displayName) => {
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: displayName || email.split('@')[0] },
            },
          });

          if (error) return { success: false, error: error.message };
          if (data.user) {
            const user = mapSupabaseUser(data.user);
            set({ user, isAuthenticated: true });
            await get().syncProfile();
            return { success: true };
          }
          return { success: false, error: 'Signup failed' };
        } catch {
          return { success: false, error: 'Signup failed' };
        }
      },

      login: async (email, password) => {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) return { success: false, error: error.message };
          if (data.user) {
            const user = mapSupabaseUser(data.user);
            set({ user, isAuthenticated: true });
            await get().syncProfile();
            return { success: true };
          }
          return { success: false, error: 'Login failed' };
        } catch {
          return { success: false, error: 'Login failed' };
        }
      },

      logout: async () => {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        set({
          user: null,
          profile: null,
          isAuthenticated: false,
          isProfileSyncing: false,
          profileSyncError: null,
          lastProfileSyncAt: null,
        });
      },

      syncProfile: async () => {
        const state = get();
        const currentUser = state.user;
        if (!currentUser) {
          set({
            profile: null,
            isProfileSyncing: false,
            profileSyncError: null,
          });
          return;
        }

        set({ isProfileSyncing: true, profileSyncError: null });

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

          if (error && error.code !== 'PGRST116') {
            set({
              isProfileSyncing: false,
              profileSyncError: error.message || 'Failed to sync profile',
            });
            return;
          }

          if (data) {
            set({
              profile: data as Profile,
              isProfileSyncing: false,
              profileSyncError: null,
              lastProfileSyncAt: new Date().toISOString(),
            });
            return;
          }

          const username = buildUsername(currentUser.displayName, currentUser.email, currentUser.id);
          const { data: created, error: createError } = await supabase
            .from('profiles')
            .upsert({
              id: currentUser.id,
              username,
              full_name: currentUser.displayName,
              avatar_url: null,
              bio: null,
              is_public: true,
            })
            .select('*')
            .single();

          if (createError) {
            set({
              isProfileSyncing: false,
              profileSyncError: createError.message || 'Failed to create profile',
            });
            return;
          }
          set({
            profile: created as Profile,
            isProfileSyncing: false,
            profileSyncError: null,
            lastProfileSyncAt: new Date().toISOString(),
          });
        } catch {
          set({
            isProfileSyncing: false,
            profileSyncError: 'Failed to sync profile',
          });
        }
      },

      updateProfile: async (updates) => {
        const state = get();
        if (!state.user) return;

        try {
          const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', state.user.id)
            .select('*')
            .single();

          if (error) return;
          set({ profile: data as Profile });
        } catch {
          // ignore
        }
      },

      uploadAvatar: async (file) => {
        const state = get();
        if (!state.user) return null;

        try {
          const response = await fetch(file.uri);
          const blob = await response.blob();
          const ext = file.name?.split('.').pop() || 'jpg';
          const path = `${state.user.id}/avatar-${Date.now()}.${ext}`;

          const { error } = await supabase.storage
            .from('avatars')
            .upload(path, blob, { contentType: file.type, upsert: true });

          if (error) return null;

          const { data } = supabase.storage.from('avatars').getPublicUrl(path);
          const publicUrl = data.publicUrl;
          await get().updateProfile({ avatar_url: publicUrl });
          return publicUrl;
        } catch {
          return null;
        }
      },
    }),
    {
      name: 'climbset-user',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
