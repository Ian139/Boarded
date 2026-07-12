'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// Moderator emails - these users can delete any route/wall
const MODERATOR_EMAILS = ['ian139@example.com', 'ian139'];

interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  isModerator: boolean;
}

interface UserState {
  // Current user state
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isModerator: boolean;

  // For backwards compatibility
  userId: string;
  displayName: string;

  // Actions
  signup: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setDisplayName: (name: string) => void;
  initializeAuth: () => Promise<void>;
  syncProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string | null>;
}

function mapSupabaseUser(supabaseUser: SupabaseUser): User {
  const email = supabaseUser.email || '';
  const displayName = supabaseUser.user_metadata?.display_name || email.split('@')[0] || 'User';

  // Check if user is a moderator
  const isModerator = MODERATOR_EMAILS.some(
    modEmail => email.toLowerCase() === modEmail.toLowerCase() ||
                displayName.toLowerCase() === modEmail.toLowerCase()
  );

  return {
    id: supabaseUser.id,
    email,
    displayName,
    createdAt: supabaseUser.created_at,
    isModerator,
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

let removeAuthListener: (() => void) | null = null;

function authenticatedState(user: User) {
  return {
    user,
    isAuthenticated: true,
    isModerator: user.isModerator,
    userId: user.id,
    displayName: user.displayName,
  };
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isAuthenticated: false,
      isLoading: true,
      isModerator: false,
      userId: '',
      displayName: 'Guest',

      initializeAuth: async () => {
        const supabase = createClient();

        try {
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            const user = mapSupabaseUser(session.user);
            set({ ...authenticatedState(user), isLoading: false });
            await get().syncProfile();
          } else {
            set({ isLoading: false });
          }

          if (!removeAuthListener) {
            const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
              if (nextSession?.user) {
                const user = mapSupabaseUser(nextSession.user);
                set(authenticatedState(user));
                void get().syncProfile();
              } else {
                set({
                  user: null,
                  profile: null,
                  isAuthenticated: false,
                  isModerator: false,
                  userId: '',
                  displayName: 'Guest',
                });
              }
            });
            removeAuthListener = () => subscription.unsubscribe();
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({ isLoading: false });
        }
      },

      signup: async (email: string, password: string, displayName?: string) => {
        const supabase = createClient();

        // Validate email format
        if (!email.includes('@') || !email.includes('.')) {
          return { success: false, error: 'Invalid email format' };
        }

        // Validate password length
        if (password.length < 6) {
          return { success: false, error: 'Password must be at least 6 characters' };
        }

        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                display_name: displayName || email.split('@')[0],
              },
            },
          });

          if (error) {
            return { success: false, error: error.message };
          }

          if (data.user) {
            const user = mapSupabaseUser(data.user);
            set(authenticatedState(user));
            await get().syncProfile();
            return { success: true };
          }

          return { success: false, error: 'Signup failed' };
        } catch {
          return { success: false, error: 'An unexpected error occurred' };
        }
      },

      login: async (email: string, password: string) => {
        const supabase = createClient();

        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            return { success: false, error: error.message };
          }

          if (data.user) {
            const user = mapSupabaseUser(data.user);
            set(authenticatedState(user));
            await get().syncProfile();
            return { success: true };
          }

          return { success: false, error: 'Login failed' };
        } catch {
          return { success: false, error: 'An unexpected error occurred' };
        }
      },

      logout: async () => {
        const supabase = createClient();

        try {
          await supabase.auth.signOut();
        } catch (error) {
          console.error('Logout error:', error);
        }

        set({
          user: null,
          profile: null,
          isAuthenticated: false,
          isModerator: false,
          userId: '',
          displayName: 'Guest',
        });
      },

      setDisplayName: async (name: string) => {
        const supabase = createClient();
        const state = get();

        if (state.user) {
          try {
            await supabase.auth.updateUser({
              data: { display_name: name },
            });
            await supabase
              .from('profiles')
              .update({ full_name: name })
              .eq('id', state.user.id);
          } catch (error) {
            console.error('Failed to update display name:', error);
          }

          set({
            displayName: name,
            user: { ...state.user, displayName: name },
            profile: state.profile ? { ...state.profile, full_name: name } : state.profile,
          });
        } else {
          set({ displayName: name });
        }
      },

      syncProfile: async () => {
        const supabase = createClient();
        const state = get();
        const currentUser = state.user;
        if (!currentUser) {
          set({ profile: null });
          return;
        }

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

          if (error && error.code !== 'PGRST116') {
            console.error('Failed to fetch profile:', error);
            return;
          }

          if (data) {
            set({ profile: data as Profile });
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
            console.error('Failed to create profile:', createError);
            return;
          }

          set({ profile: created as Profile });
        } catch (error) {
          console.error('Profile sync error:', error);
        }
      },

      updateProfile: async (updates) => {
        const state = get();
        if (!state.user) return;
        const supabase = createClient();

        try {
          const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', state.user.id)
            .select('*')
            .single();

          if (error) {
            console.error('Failed to update profile:', error);
            return;
          }

          set({ profile: data as Profile });
        } catch (error) {
          console.error('Failed to update profile:', error);
        }
      },

      uploadAvatar: async (file: File) => {
        const state = get();
        if (!state.user) return null;
        const supabase = createClient();
        const ext = file.name.split('.').pop() || 'png';
        const path = `${state.user.id}/avatar-${Date.now()}.${ext}`;

        try {
          const { error } = await supabase.storage
            .from('avatars')
            .upload(path, file, { upsert: true });

          if (error) {
            console.error('Avatar upload failed:', error);
            return null;
          }

          const { data } = supabase.storage.from('avatars').getPublicUrl(path);
          const publicUrl = data.publicUrl;
          await get().updateProfile({ avatar_url: publicUrl });
          return publicUrl;
        } catch (error) {
          console.error('Avatar upload failed:', error);
          return null;
        }
      },
    }),
    {
      name: 'climbset-user',
      partialize: (state) => ({
        displayName: state.displayName,
        profile: state.profile,
      }),
    }
  )
);
