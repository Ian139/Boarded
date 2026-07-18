import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'react-native';
import { supabase } from '../supabase';
import { ensureUuid } from '@climbset/shared';
import type { Wall } from '@climbset/shared';

const LOCAL_USER_ID = 'local-user';
const wallMapKey = (ownerId: string, id: string) => `${ownerId}:wall:${id}`;
const WALL_STORAGE_KEY = 'climbset-walls';
const SELECTED_WALL_STORAGE_KEY = 'climbset-wall';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bundledDefaultWall = Image.resolveAssetSource(require('../../assets/default-wall.jpg')).uri;
const defaultTimestamp = new Date().toISOString();

export const DEFAULT_WALL: Wall = {
  id: 'default-wall',
  user_id: LOCAL_USER_ID,
  name: 'Home Wall',
  image_url: process.env.EXPO_PUBLIC_DEFAULT_WALL_URL || bundledDefaultWall,
  image_width: 1920,
  image_height: 1080,
  is_public: true,
  created_at: defaultTimestamp,
  updated_at: defaultTimestamp,
};

interface WallsState {
  walls: Wall[];
  selectedWall: Wall | null;
  legacyIdMap: Record<string, string>;
  pendingWallIds: string[];
  pendingWallOwners: Record<string, string>;
  isLoading: boolean;
  isOfflineMode: boolean;
  hasHydrated: boolean;
  setSelectedWall: (wall?: Wall | null) => void;
  fetchWalls: () => Promise<boolean>;
  addWall: (wall: Wall) => Promise<void>;
  updateWall: (id: string, updates: Partial<Wall>) => Promise<void>;
  deleteWall: (id: string) => Promise<void>;
  getWallById: (id: string) => Wall | undefined;
  syncLocalWalls: (isCurrent?: () => boolean) => Promise<Record<string, string>>;
  drainPendingWalls: () => Promise<void>;
  purgeAccountData: (userId: string) => Promise<void>;
  clearLocalData: () => Promise<void>;
  exportSnapshot: () => { walls: Wall[]; selectedWall: Wall | null; exportedAt: string };
}

let syncGeneration = 0;
let fetchGeneration = 0;
let resolveHydration: (() => void) | undefined;
const hydrationReady = new Promise<void>((resolve) => { resolveHydration = resolve; });

async function waitForHydration() {
  if (!useWallsStore.getState().hasHydrated) await hydrationReady;
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id || LOCAL_USER_ID;
  } catch {
    return LOCAL_USER_ID;
  }
}

function persistSelection(wall: Wall | null) {
  if (wall) void AsyncStorage.setItem(SELECTED_WALL_STORAGE_KEY, JSON.stringify(wall));
  else void AsyncStorage.removeItem(SELECTED_WALL_STORAGE_KEY);
}

function wallPayload(wall: Wall, userId: string): Record<string, unknown> {
  return {
    id: ensureUuid(wall.id),
    user_id: userId === LOCAL_USER_ID ? null : userId,
    name: wall.name.trim(),
    description: wall.description,
    image_url: wall.image_url,
    image_width: wall.image_width || 1920,
    image_height: wall.image_height || 1080,
    is_public: wall.is_public,
  };
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

async function uploadLocalWallImage(wall: Wall, userId: string, wallId: string): Promise<Wall> {
  const source = wall.image_url;
  const sourcePath = source && /^https?:\/\//i.test(source) ? storageObjectPath(source) : null;
  const isOwnedStorageObject = Boolean(source && sourcePath?.split('/')[0] === userId && isCurrentStorageHost(source));
  if (!source || isOwnedStorageObject || /^https?:\/\//i.test(source) && !sourcePath) return wall;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Unable to read wall image (${response.status})`);
  const blob = await response.blob();
  const contentType = blob.type || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${wallId}/wall.${extension}`;
  const { error } = await supabase.storage.from('walls').upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
  const image_url = supabase.storage.from('walls').getPublicUrl(path).data.publicUrl;
  return { ...wall, image_url };
}

function mergeDefault(walls: Wall[]) {
  const withoutDefault = walls.filter((wall) => wall.id !== DEFAULT_WALL.id);
  return [DEFAULT_WALL, ...withoutDefault];
}

export const useWallsStore = create<WallsState>()(
  persist(
    (set, get) => ({
      walls: [DEFAULT_WALL],
      selectedWall: null,
      legacyIdMap: {},
      pendingWallOwners: {},
      pendingWallIds: [],
      isLoading: false,
      isOfflineMode: false,
      hasHydrated: false,
      setSelectedWall: (wall) => {
        const selectedWall = wall || null;
        set({ selectedWall });
        persistSelection(selectedWall);
      },
      getWallById: (id) => get().walls.find((wall) => wall.id === id),
      fetchWalls: async () => {
        await waitForHydration();
        const request = ++fetchGeneration;
        set({ isLoading: true });
        try {
          const userId = await currentUserId();
          if (request !== fetchGeneration || userId !== await currentUserId()) {
            if (request === fetchGeneration) set({ isLoading: false });
            return false;
          }
          const query = supabase.from('walls').select('*').order('created_at', { ascending: false });
          const { data, error } = await query;
          if (request !== fetchGeneration || userId !== await currentUserId()) {
            if (request === fetchGeneration) set({ isLoading: false });
            return false;
          }
          if (error) throw error;
          const remoteWalls = (data || []) as Wall[];
          const remoteIds = new Set(remoteWalls.map((wall: Wall) => wall.id));
          const latestLocalWalls = get().walls.filter((wall: Wall) => wall.user_id === LOCAL_USER_ID || wall.id === DEFAULT_WALL.id || get().pendingWallIds.includes(wall.id));
          const merged = mergeDefault([...latestLocalWalls.filter((wall: Wall) => !remoteIds.has(wall.id)), ...remoteWalls]);
          const selectedId = get().selectedWall?.id;
          const selectedWall = selectedId ? merged.find((wall) => wall.id === selectedId) || null : null;
          const hasUnsynced = latestLocalWalls.some((wall) => wall.user_id === LOCAL_USER_ID && wall.id !== DEFAULT_WALL.id) || get().pendingWallIds.length > 0;
          set({ walls: merged, selectedWall, isLoading: false, isOfflineMode: hasUnsynced });
          persistSelection(selectedWall);
          await get().drainPendingWalls();
          return true;
        } catch {
          if (request === fetchGeneration) set({ walls: mergeDefault(get().walls), isLoading: false, isOfflineMode: true });
          return false;
        }
      },

      addWall: async (wall) => {
        await waitForHydration();
        const generation = syncGeneration;
        const userId = await currentUserId();
        if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
        const pendingLocal = wall.user_id === LOCAL_USER_ID && userId !== LOCAL_USER_ID;
        const normalized: Wall = {
          ...wall,
          id: wall.id === DEFAULT_WALL.id ? ensureUuid() : ensureUuid(wall.id),
          user_id: pendingLocal ? LOCAL_USER_ID : userId,
          name: wall.name.trim(),
          is_public: wall.is_public,
          image_width: wall.image_width || 1920,
          image_height: wall.image_height || 1080,
          created_at: wall.created_at || new Date().toISOString(),
          updated_at: wall.updated_at || new Date().toISOString(),
        };
        set((state) => ({ walls: [normalized, ...state.walls.filter((item) => item.id !== normalized.id)], selectedWall: normalized }));
        if (userId === LOCAL_USER_ID) return;
        try {
          const { error } = await supabase.from('walls').insert(wallPayload(normalized, userId));
          if (error) throw error;
          if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
          if (pendingLocal) {
            const migrated = { ...normalized, user_id: userId };
            set((state) => ({
              walls: state.walls.map((item) => item.id === normalized.id ? migrated : item),
              selectedWall: state.selectedWall?.id === normalized.id ? migrated : state.selectedWall,
              pendingWallIds: state.pendingWallIds.filter((pendingId) => pendingId !== normalized.id),
              pendingWallOwners: Object.fromEntries(Object.entries(state.pendingWallOwners).filter(([pendingId]) => pendingId !== normalized.id)),
            }));
            persistSelection(migrated);
          } else {
            set((state) => ({
              pendingWallIds: state.pendingWallIds.filter((pendingId) => pendingId !== normalized.id),
              pendingWallOwners: Object.fromEntries(Object.entries(state.pendingWallOwners).filter(([pendingId]) => pendingId !== normalized.id)),
            }));
          }
        } catch {
          if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
          set((state) => ({
            pendingWallIds: state.pendingWallIds.includes(normalized.id) ? state.pendingWallIds : [...state.pendingWallIds, normalized.id],
            pendingWallOwners: { ...state.pendingWallOwners, [normalized.id]: userId },
            isOfflineMode: true,
          }));
        }
      },

      updateWall: async (id, updates) => {
        const generation = syncGeneration;
        const mutationUserId = await currentUserId();
        if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return;
        const current = get().walls.find((wall) => wall.id === id);
        if (!current || id === DEFAULT_WALL.id) return;
        const next: Wall = { ...current, ...updates, id, updated_at: new Date().toISOString() };
        set((state) => ({ walls: state.walls.map((wall) => wall.id === id ? next : wall), selectedWall: state.selectedWall?.id === id ? next : state.selectedWall }));
        if (current.user_id === LOCAL_USER_ID) return;
        try {
          const payload = Object.fromEntries(Object.entries(updates).filter(([key]) => !['id', 'user_id', 'created_at'].includes(key)));
          payload.updated_at = next.updated_at;
          const { data, error } = await supabase.from('walls').update(payload).eq('id', id).select('id').maybeSingle();
          if (error || !data) throw error || new Error('Wall update was not authorized');
          if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return;
        } catch {
          if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return;
          if (current.user_id !== mutationUserId) {
            set((state) => ({
              walls: state.walls.map((wall) => wall.id === id ? current : wall),
              selectedWall: state.selectedWall?.id === id ? current : state.selectedWall,
              isOfflineMode: true,
            }));
          } else {
            set((state) => ({
              pendingWallIds: state.pendingWallIds.includes(id) ? state.pendingWallIds : [...state.pendingWallIds, id],
              pendingWallOwners: { ...state.pendingWallOwners, [id]: mutationUserId },
              isOfflineMode: true,
            }));
          }
        }
        persistSelection(get().selectedWall);
      },

      deleteWall: async (id) => {
        const generation = syncGeneration;
        const mutationUserId = await currentUserId();
        if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return;
        if (id === DEFAULT_WALL.id) return;
        const current = get().walls.find((wall) => wall.id === id);
        if (!current) return;
        const fallback = get().walls.find((wall) => wall.id === DEFAULT_WALL.id) || DEFAULT_WALL;
        if (current.user_id === LOCAL_USER_ID) {
          set((state) => ({ walls: state.walls.filter((wall) => wall.id !== id), selectedWall: state.selectedWall?.id === id ? fallback : state.selectedWall }));
          persistSelection(get().selectedWall);
          return;
        }
        try {
          const { error } = await supabase.from('walls').delete().eq('id', id);
          if (error) throw error;
          const { data: remaining, error: verifyError } = await supabase.from('walls').select('id').eq('id', id).maybeSingle();
          if (verifyError || remaining) throw verifyError || new Error('Wall deletion was not authorized');
          if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return;
          set((state) => ({ walls: state.walls.filter((wall) => wall.id !== id), selectedWall: state.selectedWall?.id === id ? fallback : state.selectedWall }));
          persistSelection(get().selectedWall);
        } catch {
          if (generation !== syncGeneration || (await currentUserId()) !== mutationUserId) return;
          // Preserve the wall when the database denies or cannot confirm deletion.
        }
      },
      drainPendingWalls: async () => {
        const generation = syncGeneration;
        const userId = await currentUserId();
        if (userId === LOCAL_USER_ID || generation !== syncGeneration) return;
        for (const id of [...get().pendingWallIds]) {
          if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
          const ownerId = get().pendingWallOwners[id];
          if (ownerId && ownerId !== userId) continue;
          const wall = get().walls.find((candidate) => candidate.id === id);
          if (!wall || (wall.user_id !== LOCAL_USER_ID && wall.user_id !== userId)) {
            set((state) => ({
              pendingWallIds: state.pendingWallIds.filter((pendingId) => pendingId !== id),
              pendingWallOwners: Object.fromEntries(Object.entries(state.pendingWallOwners).filter(([pendingId]) => pendingId !== id)),
            }));
            continue;
          }
          try {
            const uploaded = await uploadLocalWallImage(wall, userId, id);
            const { error } = await supabase.from('walls').upsert(wallPayload({ ...uploaded, user_id: userId }, userId), { onConflict: 'id' });
            if (error) throw error;
            if (generation !== syncGeneration || (await currentUserId()) !== userId) return;
            set((state) => ({
              pendingWallIds: state.pendingWallIds.filter((pendingId) => pendingId !== id),
              pendingWallOwners: Object.fromEntries(Object.entries(state.pendingWallOwners).filter(([pendingId]) => pendingId !== id)),
              walls: state.walls.map((item) => item.id === id ? { ...uploaded, user_id: userId } : item),
            }));
          } catch {
            if (generation === syncGeneration && await currentUserId() === userId) {
              // Preserve the pending wall until bytes and metadata both sync.
              set({ isOfflineMode: true });
            }
          }
        }
      },
      syncLocalWalls: async (isCurrent) => {
        await waitForHydration();
        const generation = syncGeneration;
        const userId = await currentUserId();
        const idMap: Record<string, string> = {};
        if (userId === LOCAL_USER_ID || generation !== syncGeneration || isCurrent && !isCurrent()) return idMap;
        const localWalls = get().walls.filter((wall) => wall.user_id === LOCAL_USER_ID && wall.id !== DEFAULT_WALL.id);
        for (const wall of localWalls) {
          if (generation !== syncGeneration || (isCurrent && !isCurrent()) || await currentUserId() !== userId) return idMap;
          const currentMap = get().legacyIdMap;
          const migratedId = currentMap[wallMapKey(userId, wall.id)] || ensureUuid(wall.id);
          set({ legacyIdMap: { ...currentMap, [wallMapKey(userId, wall.id)]: migratedId } });
          const migrated = { ...wall, id: migratedId, user_id: userId };
          try {
            const uploaded = await uploadLocalWallImage(migrated, userId, migratedId);
            const { error } = await supabase.from('walls').upsert(wallPayload(uploaded, userId), { onConflict: 'id' });
            if (error) throw error;
            if (generation !== syncGeneration || isCurrent && !isCurrent() || await currentUserId() !== userId) return idMap;
            idMap[wall.id] = migrated.id;
            const selected = get().selectedWall?.id === wall.id;
            set((state) => ({
              walls: state.walls.map((item) => item.id === wall.id ? uploaded : item),
              selectedWall: selected ? uploaded : state.selectedWall,
            }));
            if (selected) persistSelection(uploaded);
          } catch {
            if (generation === syncGeneration && (!isCurrent || isCurrent()) && await currentUserId() === userId) {
              // Keep the local wall for a future explicit sync.
              set({ isOfflineMode: true });
            }
          }
        }
        return idMap;
      },

      purgeAccountData: async (userId) => {
        if (!userId || userId === LOCAL_USER_ID) return;
        syncGeneration += 1;
        fetchGeneration += 1;
        set((state) => {
          const walls = state.walls.filter((wall) => wall.user_id !== userId);
          const selectedWall = walls.find((wall) => wall.id === state.selectedWall?.id) || DEFAULT_WALL;
          const pendingWallIds = state.pendingWallIds.filter((id) => state.pendingWallOwners[id] !== userId);
          const pendingWallOwners = Object.fromEntries(Object.entries(state.pendingWallOwners).filter(([, owner]) => owner !== userId));
          const legacyIdMap = Object.fromEntries(Object.entries(state.legacyIdMap).filter(([key]) => !key.startsWith(`${userId}:`)));
          return { walls, selectedWall, pendingWallIds, pendingWallOwners, legacyIdMap, isLoading: false };
        });
        persistSelection(get().selectedWall);
        await AsyncStorage.setItem(WALL_STORAGE_KEY, JSON.stringify({ state: { walls: get().walls, selectedWall: get().selectedWall, legacyIdMap: get().legacyIdMap, pendingWallIds: get().pendingWallIds, pendingWallOwners: get().pendingWallOwners } }));
      },
      clearLocalData: async () => {
        syncGeneration += 1;
        fetchGeneration += 1;
        set({ walls: [DEFAULT_WALL], selectedWall: DEFAULT_WALL, legacyIdMap: {}, pendingWallIds: [], pendingWallOwners: {}, isLoading: false });
        persistSelection(DEFAULT_WALL);
        await AsyncStorage.removeItem(WALL_STORAGE_KEY);
        await AsyncStorage.removeItem(SELECTED_WALL_STORAGE_KEY);
      },

      exportSnapshot: () => ({ walls: get().walls, selectedWall: get().selectedWall, exportedAt: new Date().toISOString() }),
    }),
    {
      name: WALL_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ walls: state.walls, selectedWall: state.selectedWall, legacyIdMap: state.legacyIdMap, pendingWallIds: state.pendingWallIds, pendingWallOwners: state.pendingWallOwners }),
      merge: (persisted, current) => {
        const value = persisted as Partial<WallsState> | undefined;
        const walls = mergeDefault(value?.walls || current.walls);
        const selectedWall = value?.selectedWall ? walls.find((wall) => wall.id === value.selectedWall?.id) || null : null;
        return { ...current, walls, selectedWall, legacyIdMap: value?.legacyIdMap || current.legacyIdMap, pendingWallIds: value?.pendingWallIds || current.pendingWallIds, pendingWallOwners: value?.pendingWallOwners || current.pendingWallOwners };
      },
      onRehydrateStorage: () => () => {
        useWallsStore.setState({ hasHydrated: true });
        resolveHydration?.();
      },
    },
  ),
);
