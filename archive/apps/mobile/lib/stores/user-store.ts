import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import type { Profile } from '@climbset/shared';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const USER_STORAGE_KEY = 'climbset-user';

interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  isModerator: boolean;
}

interface UserState {
  user: User | null;
  userId: string | null;
  displayName: string;
  profile: Profile | null;
  isAuthenticated: boolean;
  isModerator: boolean;
  isLoading: boolean;
  isProfileSyncing: boolean;
  profileSyncError: string | null;
  lastProfileSyncAt: string | null;
  signup: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string; requiresConfirmation?: boolean }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  syncProfile: () => Promise<void>;
  setDisplayName: (name: string) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (updates: Partial<Profile>) => Promise<boolean>;
  uploadAvatar: (file: { uri: string; name?: string; type?: string }) => Promise<string | null>;
}
function mapSupabaseUser(user: SupabaseUser): User {
  const email = user.email || '';
  const displayName = user.user_metadata?.display_name || email.split('@')[0] || 'Climber';
  const metadata = user.app_metadata as { role?: string; is_moderator?: boolean } | undefined;
  return { id: user.id, email, displayName, createdAt: user.created_at, isModerator: metadata?.role === 'moderator' || metadata?.is_moderator === true };
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function buildUsername(displayName: string, email: string, userId: string) {
  const base = slugify(displayName || email.split('@')[0] || 'climber') || 'climber';
  return `${base}-${userId.slice(0, 4)}`;
}
function moderatorFor(user: User | null) {
  return Boolean(user?.isModerator);
}

function authErrorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : fallback;
}

let authInitialization: Promise<void> | null = null;
let authListenerRegistered = false;
let offlineSync: { userId: string; promise: Promise<void> } | null = null;
let authEpoch = 0;
async function syncOfflineData(userId: string, isCurrent: () => boolean) {
  if (!isCurrent()) return;
  const previous = offlineSync;
  if (previous?.userId === userId) return previous.promise;
  if (previous) await previous.promise;
  if (!isCurrent()) return;
  const promise = (async () => {
    const [{ useWallsStore }, { useRoutesStore }] = await Promise.all([
      import('./walls-store'),
      import('./routes-store'),
    ]);
    if (!isCurrent()) return;
    const wallIdMap = await useWallsStore.getState().syncLocalWalls(isCurrent);
    if (isCurrent()) await useWallsStore.getState().drainPendingWalls();
    await useRoutesStore.getState().syncLocalRoutes(wallIdMap, isCurrent);
    if (isCurrent()) await useRoutesStore.getState().drainPendingRoutes();
    if (isCurrent()) await useRoutesStore.getState().drainPendingSocial();
  })();
  offlineSync = { userId, promise };
  try {
    await promise;
  } finally {
    if (offlineSync?.promise === promise) offlineSync = null;
  }
}

async function clearAccountData(userId: string) {
  if (!userId || userId === 'local-user') return;
  const [{ useRoutesStore }, { useWallsStore }] = await Promise.all([
    import('./routes-store'),
    import('./walls-store'),
  ]);
  await Promise.all([
    useRoutesStore.getState().purgeAccountData(userId),
    useWallsStore.getState().purgeAccountData(userId),
    AsyncStorage.removeItem(`climbset-draft:${userId}`),
  ]);
}

async function refreshRemoteData(isCurrent?: () => boolean) {
  const [{ useRoutesStore }, { useWallsStore }] = await Promise.all([
    import('./routes-store'),
    import('./walls-store'),
  ]);
  if (isCurrent && !isCurrent()) return;
  await Promise.all([
    useRoutesStore.getState().fetchRoutes(),
    useWallsStore.getState().fetchWalls(),
  ]);
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      userId: null,
      displayName: '',
      profile: null,
      isAuthenticated: false,
      isModerator: false,
      isLoading: true,
      isProfileSyncing: false,
      profileSyncError: null,
      lastProfileSyncAt: null,
      initializeAuth: async () => {
        if (authInitialization) return authInitialization;
        authInitialization = (async () => {
          try {
            if (!authListenerRegistered) {
              supabase.auth.onAuthStateChange((_event, sessionState) => {
                const previousId = get().user?.id;
                const epoch = ++authEpoch;
                if (sessionState?.user) {
                  const nextUser = mapSupabaseUser(sessionState.user);
                  const isCurrent = () => authEpoch === epoch && get().user?.id === nextUser.id && get().isAuthenticated;
                  set({ user: nextUser, userId: nextUser.id, displayName: nextUser.displayName, profile: null, isModerator: moderatorFor(nextUser), isAuthenticated: true, isLoading: false, isProfileSyncing: false, profileSyncError: null, lastProfileSyncAt: null });
                  if (previousId && previousId !== nextUser.id) void clearAccountData(previousId);
                  void get().syncProfile();
                  void syncOfflineData(nextUser.id, isCurrent).finally(() => { void refreshRemoteData(isCurrent); });
                } else {
                  set({ user: null, userId: null, displayName: '', profile: null, isAuthenticated: false, isModerator: false, isProfileSyncing: false, profileSyncError: null, lastProfileSyncAt: null });
                  const purge = previousId ? clearAccountData(previousId) : Promise.resolve();
                  void purge.finally(() => { void refreshRemoteData(); });
                }
              });
              authListenerRegistered = true;
            }

            const restoreEpoch = authEpoch;
            const { data: { session } } = await supabase.auth.getSession();
            if (authEpoch !== restoreEpoch) {
              set({ isLoading: false });
              return;
            }

            const sessionEpoch = ++authEpoch;
            if (session?.user) {
              const nextUser = mapSupabaseUser(session.user);
              const isCurrent = () => authEpoch === sessionEpoch && get().user?.id === nextUser.id && get().isAuthenticated;
              set({ user: nextUser, userId: nextUser.id, displayName: nextUser.displayName, profile: null, isModerator: moderatorFor(nextUser), isAuthenticated: true, isLoading: false, isProfileSyncing: false, profileSyncError: null, lastProfileSyncAt: null });
              await get().syncProfile();
              await syncOfflineData(nextUser.id, isCurrent);
              await refreshRemoteData(isCurrent);
            } else {
              const previousId = get().user?.id;
              set({ user: null, userId: null, displayName: '', profile: null, isAuthenticated: false, isModerator: false, isLoading: false, isProfileSyncing: false, profileSyncError: null, lastProfileSyncAt: null });
              if (previousId) await clearAccountData(previousId);
              await refreshRemoteData();
            }
          } catch {
            const previousId = get().user?.id;
            ++authEpoch;
            set({ user: null, userId: null, displayName: '', profile: null, isAuthenticated: false, isModerator: false, isLoading: false, isProfileSyncing: false, profileSyncError: 'Unable to restore session' });
            if (previousId) await clearAccountData(previousId);
            await refreshRemoteData();
          } finally {
            authInitialization = null;
          }
        })();
        return authInitialization;
      },

      signup: async (email, password, displayName) => {
        const startEpoch = ++authEpoch;
        const normalizedEmail = email.trim();
        if (!normalizedEmail.includes('@') || !normalizedEmail.includes('.')) return { success: false, error: 'Please enter a valid email address' };
        if (password.length < 6) return { success: false, error: 'Password must be at least 6 characters' };
        try {
          const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password, options: { data: { display_name: displayName?.trim() || normalizedEmail.split('@')[0] } } });
          if (authEpoch !== startEpoch && !data.session) return { success: false, error: 'Session changed; please retry' };
          if (error) return { success: false, error: error.message };
          if (!data.user) return { success: false, error: 'Signup failed' };
          if (!data.session) return { success: true, requiresConfirmation: true };
          const nextUser = mapSupabaseUser(data.user);
          set({ user: nextUser, userId: nextUser.id, displayName: nextUser.displayName, profile: null, isAuthenticated: true, isModerator: moderatorFor(nextUser), isProfileSyncing: false, profileSyncError: null, lastProfileSyncAt: null });
          await get().syncProfile();
          if (get().user?.id !== nextUser.id || !get().isAuthenticated) return { success: false, error: 'Session changed; please retry' };
          const isCurrent = () => get().user?.id === nextUser.id && get().isAuthenticated;
          await syncOfflineData(nextUser.id, isCurrent);
          await refreshRemoteData(isCurrent);
          return { success: true };
        } catch (error) {
          return { success: false, error: authErrorMessage(error, 'Signup failed') };
        }
      },
      login: async (email, password) => {
        const startEpoch = ++authEpoch;
        if (!email.trim() || !password) return { success: false, error: 'Email and password are required' };
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (error) return { success: false, error: error.message };
          if (!data.user || (authEpoch !== startEpoch && get().user?.id !== data.user.id)) return { success: false, error: 'Session changed; please retry' };
          const nextUser = mapSupabaseUser(data.user);
          set({ user: nextUser, userId: nextUser.id, displayName: nextUser.displayName, profile: null, isAuthenticated: true, isModerator: moderatorFor(nextUser), isProfileSyncing: false, profileSyncError: null, lastProfileSyncAt: null });
          await get().syncProfile();
          if (get().user?.id !== nextUser.id || !get().isAuthenticated) return { success: false, error: 'Session changed; please retry' };
          const isCurrent = () => get().user?.id === nextUser.id && get().isAuthenticated;
          await syncOfflineData(nextUser.id, isCurrent);
          await refreshRemoteData(isCurrent);
          return { success: true };
        } catch (error) {
          return { success: false, error: authErrorMessage(error, 'Login failed') };
        }
      },

      logout: async () => {
        const logoutEpoch = ++authEpoch;
        const oldUserId = get().user?.id;
        try { await supabase.auth.signOut(); } catch { /* local logout still clears identity */ }
        try { if (oldUserId) await clearAccountData(oldUserId); } finally {
          if (authEpoch === logoutEpoch) set({ user: null, userId: null, displayName: '', profile: null, isAuthenticated: false, isModerator: false, isProfileSyncing: false, profileSyncError: null, lastProfileSyncAt: null });
          await refreshRemoteData();
        }
      },

      syncProfile: async () => {
        const currentUser = get().user;
        const profileEpoch = authEpoch;
        if (!currentUser) {
          set({ profile: null, isProfileSyncing: false, profileSyncError: null });
          return;
        }
        const isCurrent = () => authEpoch === profileEpoch && get().user?.id === currentUser.id && get().isAuthenticated;
        set({ isProfileSyncing: true, profileSyncError: null });
        try {
          const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
          if (error && error.code !== 'PGRST116') throw error;
          if (!isCurrent()) return;
          if (data) {
            set({ profile: data as Profile, isProfileSyncing: false, profileSyncError: null, lastProfileSyncAt: new Date().toISOString() });
            return;
          }
          const { data: created, error: createError } = await supabase.from('profiles').upsert({ id: currentUser.id, username: buildUsername(currentUser.displayName, currentUser.email, currentUser.id), full_name: currentUser.displayName, avatar_url: null, bio: null, is_public: true }).select('*').single();
          if (createError) throw createError;
          if (isCurrent()) set({ profile: created as Profile, isProfileSyncing: false, profileSyncError: null, lastProfileSyncAt: new Date().toISOString() });
        } catch (error) {
          if (isCurrent()) set({ isProfileSyncing: false, profileSyncError: authErrorMessage(error, 'Failed to sync profile') });
        }
      },

      setDisplayName: async (name) => {
        const value = name.trim();
        if (!value) return { success: false, error: 'Display name is required' };
        const currentUser = get().user;
        if (!currentUser) return { success: false, error: 'Sign in to update your display name' };
        const previous = currentUser;
        const isCurrent = () => get().user?.id === currentUser.id && get().isAuthenticated;
        const nextUser = { ...currentUser, displayName: value };
        set({ user: nextUser, displayName: value, isModerator: moderatorFor(nextUser) });
        try {
          const { error } = await supabase.auth.updateUser({ data: { display_name: value } });
          if (error) throw error;
          if (!isCurrent() || !(await get().updateProfile({ full_name: value })) || !isCurrent()) return { success: false, error: 'Session changed; please retry' };
          return { success: true };
        } catch (error) {
          if (isCurrent()) set({ user: previous, displayName: previous.displayName, isModerator: moderatorFor(previous) });
          return { success: false, error: authErrorMessage(error, 'Failed to update display name') };
        }
      },
      updateProfile: async (updates) => {
        const currentUser = get().user;
        const profileEpoch = authEpoch;
        if (!currentUser) return false;
        const isCurrent = () => authEpoch === profileEpoch && get().user?.id === currentUser.id && get().isAuthenticated;
        const previous = get().profile;
        set({ profile: previous ? { ...previous, ...updates } : previous });
        try {
          const { data, error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id).select('*').single();
          if (error || !data || !isCurrent()) throw error || new Error('Profile session changed');
          set({ profile: data as Profile });
          return true;
        } catch {
          if (isCurrent()) set({ profile: previous });
          return false;
        }
      },

      uploadAvatar: async (file) => {
        const currentUser = get().user;
        const avatarEpoch = authEpoch;
        if (!currentUser) return null;
        const isCurrent = () => authEpoch === avatarEpoch && get().user?.id === currentUser.id && get().isAuthenticated;
        try {
          const response = await fetch(file.uri);
          const blob = await response.blob();
          const extension = file.name?.split('.').pop() || 'jpg';
          const path = `${currentUser.id}/avatar-${Date.now()}.${extension}`;
          const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: file.type || 'image/jpeg', upsert: true });
          if (error || !isCurrent()) return null;
          const { data } = supabase.storage.from('avatars').getPublicUrl(path);
          if (!isCurrent() || !(await get().updateProfile({ avatar_url: data.publicUrl })) || !isCurrent()) return null;
          return data.publicUrl;
        } catch {
          return null;
        }
      },
    }),
    {
      name: USER_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ user: state.user, userId: state.userId, displayName: state.displayName, profile: state.profile, isAuthenticated: state.isAuthenticated, isModerator: state.isModerator }),
    },
  ),
);

export function getCurrentUserId() {
  return useUserStore.getState().userId || 'local-user';
}

export function getCurrentDisplayName() {
  return useUserStore.getState().displayName || 'Anonymous';
}

export function isCurrentUserModerator() {
  return useUserStore.getState().isModerator;
}
