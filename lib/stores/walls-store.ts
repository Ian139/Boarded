'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/lib/supabase/client';
import type { Wall } from '@/lib/types';

// Default wall
export const DEFAULT_WALL: Wall = {
  id: 'default-wall',
  user_id: 'local',
  name: 'Home Wall',
  image_url: '/walls/default-wall.jpg',
  image_width: 1920,
  image_height: 1080,
  is_public: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let wallFetchGeneration = 0;
let wallAuthGeneration = 0;
type LocalWall = Wall & { _derivedFromRoute?: boolean };

function isDerivedWall(wall: Wall) {
  return Boolean(
    (wall as LocalWall)._derivedFromRoute ||
    /^Imported Wall [A-Z0-9]{4}$/i.test(wall.name)
  );
}

function isLocalWall(wall: Wall) {
  return wall.id === 'default-wall' ||
    wall.user_id === 'local' ||
    (wall.user_id === 'local-user' && !isDerivedWall(wall));
}

interface WallsState {
  walls: Wall[];
  selectedWall: Wall | null;
  isLoading: boolean;

  // Actions
  setSelectedWall: (wall: Wall | null) => void;
  addWall: (wall: Wall) => Promise<boolean>;
  updateWall: (id: string, updates: Partial<Wall>) => Promise<boolean>;
  deleteWall: (id: string) => Promise<boolean>;
  getWallById: (id: string) => Wall | undefined;
  clearRemoteWalls: () => void;
  // Sync actions
  fetchWalls: () => Promise<void>;
}

export const useWallsStore = create<WallsState>()(
  persist(
    (set, get) => ({
      walls: [DEFAULT_WALL],
      selectedWall: DEFAULT_WALL,
      isLoading: false,

      setSelectedWall: (wall) => set({ selectedWall: wall }),

      // Fetch walls allowed by Supabase RLS (public plus the signed-in user's private walls).
      fetchWalls: async () => {
        const fetchGeneration = ++wallFetchGeneration;
        set({ isLoading: true });

        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          const currentUserId = user?.id || 'local-user';
          const { data: remoteWalls, error } = await supabase
            .from('walls')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) {
            console.error('Error fetching walls:', error);
            if (fetchGeneration === wallFetchGeneration) set({ isLoading: false });
            return;
          }

          const { data: { user: latestUser } } = await supabase.auth.getUser();
          if (
            fetchGeneration !== wallFetchGeneration ||
            (latestUser?.id || 'local-user') !== currentUserId
          ) {
            return;
          }

          if (remoteWalls) {
            const localWalls = get().walls.filter(isLocalWall);
            const mergedWalls = [
              ...localWalls,
              ...remoteWalls.filter(rw => !localWalls.some(lw => lw.id === rw.id))
            ];
            set({ walls: mergedWalls, isLoading: false });
          }
        } catch (error) {
          console.error('Error fetching walls:', error);
          if (fetchGeneration === wallFetchGeneration) set({ isLoading: false });
        }
      },

      clearRemoteWalls: () => {
        wallFetchGeneration += 1;
        wallAuthGeneration += 1;
        set((state) => {
          const selected = state.selectedWall;
          const selectedIsLocal = selected ? isLocalWall(selected) : false;
          return {
            walls: state.walls.filter(isLocalWall),
            selectedWall: selectedIsLocal ? selected : DEFAULT_WALL,
            isLoading: false,
          };
        });
      },

      addWall: async (wall) => {
        // Add to local state immediately and remove it again if persistence fails.
        set((state) => ({
          walls: [...state.walls, wall],
        }));

        // Local-only walls are intentionally not sent to Supabase.
        if (wall.user_id === 'local-user' || wall.user_id === 'local') return true;

        try {
          const supabase = createClient();
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!user) throw new Error('Unable to authenticate wall owner');

          const { error } = await supabase
            .from('walls')
            .insert({
              id: wall.id,
              user_id: user.id,
              name: wall.name,
              description: wall.description,
              image_url: wall.image_url,
              image_width: wall.image_width,
              image_height: wall.image_height,
              is_public: wall.is_public,
            });

          if (error) throw error;
          return true;
        } catch (error) {
          console.error('Error saving wall:', error);
          set((state) => ({ walls: state.walls.filter((candidate) => candidate.id !== wall.id) }));
          return false;
        }
      },

      updateWall: async (id, updates) => {
        const current = get().walls.find((wall) => wall.id === id);
        const authGeneration = wallAuthGeneration;
        if (!current) return false;

        const next = { ...current, ...updates, updated_at: new Date().toISOString() };
        set((state) => ({
          walls: state.walls.map((wall) => wall.id === id ? next : wall),
          selectedWall: state.selectedWall?.id === id ? next : state.selectedWall,
        }));

        // Default and local-only walls are persisted by the local store only.
        if (id === 'default-wall' || current.user_id === 'local-user' || current.user_id === 'local') {
          return true;
        }

        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('walls')
            .update({ ...updates, updated_at: next.updated_at })
            .eq('id', id)
            .select('id')
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Wall update was not authorized');
          return true;
        } catch (error) {
          console.error('Error updating wall:', error);
          if (authGeneration !== wallAuthGeneration) return false;
          set((state) => ({
            walls: state.walls.map((wall) => wall.id === id ? current : wall),
            selectedWall: state.selectedWall?.id === id ? current : state.selectedWall,
          }));
          return false;
        }
      },

      deleteWall: async (id) => {
        if (id === 'default-wall') return false;
        const wall = get().walls.find((candidate) => candidate.id === id);
        if (!wall) return false;
        const authGeneration = wallAuthGeneration;
        const wallIndex = get().walls.findIndex((candidate) => candidate.id === id);
        const selected = get().selectedWall;
        set((state) => ({
          walls: state.walls.filter((candidate) => candidate.id !== id),
          selectedWall: selected?.id === id ? DEFAULT_WALL : selected,
        }));

        // Local-only walls are intentionally removed from local state only.
        if (wall.user_id === 'local-user' || wall.user_id === 'local') return true;

        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from('walls')
            .delete()
            .eq('id', id)
            .select('id')
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Wall deletion was not authorized');
          return true;
        } catch (error) {
          console.error('Error deleting wall:', error);
          if (authGeneration !== wallAuthGeneration) return false;
          set((state) => {
            const walls = [...state.walls];
            walls.splice(Math.min(wallIndex, walls.length), 0, wall);
            return {
              walls,
              selectedWall: selected?.id === id ? wall : state.selectedWall,
            };
          });
          return false;
        }
      },

      getWallById: (id) => get().walls.find((w) => w.id === id),
    }),
    {
      name: 'climbset-walls',
      partialize: (state) => ({
        walls: state.walls,
        selectedWall: state.selectedWall,
      }),
    }
  )
);
