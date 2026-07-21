'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useWallsStore, DEFAULT_WALL } from '@/lib/stores/walls-store';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useTransitionStore } from '@/lib/stores/transition-store';
import { useIsClient } from '@/lib/hooks/useIsClient';
import { gradeToNumber, calculateDisplayGrade } from '@climbset/shared/utils/grades';
import { Button } from '@/components/ui/button';
import { InstallPrompt } from '@/components/shared/InstallPrompt';
import { ConfirmDialog } from '@/components/home/ConfirmDialog';
import { LogClimbDialog } from '@/components/home/LogClimbDialog';
import { RouteViewerDialog } from '@/components/home/RouteViewerDialog';
import { SearchFilterBar } from '@/components/home/SearchFilterBar';
import { WallPickerDialog } from '@/components/home/WallPickerDialog';
import { RouteList } from '@/components/home/RouteList';
import { toast } from 'sonner';
import type { Route, Wall } from '@climbset/shared/types';

type SortOption =
  | 'newest'
  | 'oldest'
  | 'name'
  | 'grade-asc'
  | 'grade-desc'
  | 'rating'
  | 'most-liked'
  | 'most-climbed'
  | 'most-viewed';

export default function Home() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { walls, selectedWall, setSelectedWall, addWall } = useWallsStore();
  const { routes, deleteRoute, isLoading: routesLoading, incrementViewCount, isOfflineMode } = useRoutesStore();
  const startTransition = useTransitionStore((state) => state.startTransition);
  const isClient = useIsClient();

  // Dialog trigger state
  const [showWallPicker, setShowWallPicker] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null);
  const [routeToView, setRouteToView] = useState<Route | null>(null);
  const [routeToLog, setRouteToLog] = useState<Route | null>(null);

  // Search, sort, and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterGrade, setFilterGrade] = useState<string>('all');


  // Ensure walls exist locally for any fetched routes (important for new devices)
  useEffect(() => {
    if (routes.length === 0) return;

    const knownWallIds = new Set(walls.map((w) => w.id));
    const missingWalls = new Map<string, { imageUrl?: string; imageWidth?: number; imageHeight?: number }>();

    routes.forEach((route) => {
      if (!route.wall_id || route.wall_id === 'default-wall') return;
      if (knownWallIds.has(route.wall_id)) return;
      if (!missingWalls.has(route.wall_id)) {
        missingWalls.set(route.wall_id, {
          imageUrl: route.wall_image_url,
          imageWidth: route.wall_image_width,
          imageHeight: route.wall_image_height,
        });
      }
    });

    if (missingWalls.size === 0) return;

    missingWalls.forEach((meta, wallId) => {
      const derivedWall = {
        id: wallId,
        user_id: 'local-user',
        name: `Imported Wall ${wallId.slice(0, 4).toUpperCase()}`,
        image_url: meta.imageUrl || DEFAULT_WALL.image_url,
        image_width: meta.imageWidth || 1920,
        image_height: meta.imageHeight || 1080,
        is_public: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _derivedFromRoute: true,
      } as Wall & { _derivedFromRoute: true };
      addWall(derivedWall);
    });

  }, [routes, walls, addWall]);

  // Auto-select first wall if none selected
  useEffect(() => {
    if (!selectedWall && walls.length > 0) {
      setSelectedWall(walls[0]);
    }
  }, [selectedWall, walls, setSelectedWall]);

  const allWallsSelected = selectedWall?.id === 'all-walls';

  // Get routes for selected wall with search, sort, and filter
  const wallRoutes = useMemo(() => {
    if (!selectedWall) return [];

    let filtered = allWallsSelected
      ? [...routes]
      : routes.filter((r) => r.wall_id === selectedWall.id);

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(query) ||
        (r.user_name?.toLowerCase().includes(query)) ||
        (r.grade_v?.toLowerCase().includes(query))
      );
    }

    // Grade filter
    if (filterGrade !== 'all') {
      filtered = filtered.filter(r => r.grade_v === filterGrade);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        case 'grade-asc':
          return gradeToNumber(calculateDisplayGrade(a.grade_v, a.ascents)) - gradeToNumber(calculateDisplayGrade(b.grade_v, b.ascents));
        case 'grade-desc':
          return gradeToNumber(calculateDisplayGrade(b.grade_v, b.ascents)) - gradeToNumber(calculateDisplayGrade(a.grade_v, a.ascents));
        case 'rating': {
          const aAscents = a.ascents || [];
          const bAscents = b.ascents || [];
          const aRatings = aAscents.filter(asc => asc.rating).map(asc => asc.rating!);
          const bRatings = bAscents.filter(asc => asc.rating).map(asc => asc.rating!);
          const aAvg = aRatings.length > 0 ? aRatings.reduce((sum, r) => sum + r, 0) / aRatings.length : 0;
          const bAvg = bRatings.length > 0 ? bRatings.reduce((sum, r) => sum + r, 0) / bRatings.length : 0;
          return bAvg - aAvg;
        }
        case 'most-liked':
          return (b.like_count || b.liked_by?.length || 0) - (a.like_count || a.liked_by?.length || 0);
        case 'most-climbed':
          return (b.ascents?.length || 0) - (a.ascents?.length || 0);
        case 'most-viewed':
          return (b.view_count || 0) - (a.view_count || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [selectedWall, routes, searchQuery, sortBy, filterGrade, allWallsSelected]);

  // Get unique grades from wall routes for filter dropdown
  const availableGrades = useMemo(() => {
    if (!selectedWall) return [];
    const grades = routes
      .filter(r => (allWallsSelected || r.wall_id === selectedWall.id) && r.grade_v)
      .map(r => r.grade_v!)
      .filter((grade, index, self) => self.indexOf(grade) === index)
      .sort((a, b) => gradeToNumber(a) - gradeToNumber(b));
    return grades;
  }, [selectedWall, routes, allWallsSelected]);

  // Handle viewing a route (increments view count)
  const handleViewRoute = (route: Route) => {
    setRouteToView(route);
    incrementViewCount(route.id);
  };

  // Navigate to editor with route to edit
  const handleEditRoute = (route: Route) => {
    router.push(`/editor?edit=${route.id}`);
  };

  // Navigate to editor with transition
  const handleNewRoute = (e: React.MouseEvent) => {
    e.preventDefault();
    if (allWallsSelected) {
      setSelectedWall(DEFAULT_WALL);
    }
    const rect = e.currentTarget.getBoundingClientRect();
    startTransition(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setTimeout(() => router.push('/editor'), 100);
  };

  if (!isClient) return null;

  return (
    <div className="app-shell min-h-dvh pb-28 md:pb-10">
      {/* Header */}
      <header className="page-header px-4 md:px-8 pt-5 pb-4">
        {isOfflineMode && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
            Local-only mode. Cloud sync is unavailable.
          </div>
        )}
        <InstallPrompt />
        {/* Desktop Header */}
        <div className="hidden md:flex items-center justify-between border-b border-border/50 pb-4">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <Image
                src="/icon.png"
                alt="Boarded logo"
                width={24}
                height={24}
                className="rounded-md"
              />
              <h1 className="text-xl font-bold tracking-[-0.02em]">Boarded</h1>
            </div>

            {/* Wall Selector - Desktop inline dropdown */}
            <button
              onClick={() => setShowWallPicker(true)}
              className="flex items-center gap-2 text-foreground hover:text-primary transition-colors group"
            >
              <span className="font-medium">{selectedWall?.name || 'Select Wall'}</span>
              <span className="text-muted-foreground text-sm">({wallRoutes.length})</span>
              <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle dark mode"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5 dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
              <svg className="w-5 h-5 hidden dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            </button>
            <Link
              href="/settings"
              aria-label="Settings"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between border-b border-border/50 pb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Image
                src="/icon.png"
                alt="Boarded logo"
                width={22}
                height={22}
                className="rounded-md"
              />
              <h1 className="text-xl font-bold tracking-[-0.02em]">Boarded</h1>
            </div>

            {/* Wall Selector - Mobile inline */}
            <button
              onClick={() => setShowWallPicker(true)}
              className="flex items-center gap-1.5 text-foreground active:text-primary transition-colors"
            >
              <span className="font-medium text-sm">{selectedWall?.name || 'Select Wall'}</span>
              <span className="text-muted-foreground text-xs">({wallRoutes.length})</span>
              <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle dark mode"
              className="text-muted-foreground active:text-foreground transition-colors"
            >
              <svg className="w-5 h-5 dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
              <svg className="w-5 h-5 hidden dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            </button>
            <Link
              href="/settings"
              aria-label="Settings"
              className="text-muted-foreground active:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* Routes List */}
      <main className="page-frame px-4 md:px-8 mt-5 md:mt-8">
        {!selectedWall ? (
          <div className="py-12 text-center max-w-sm mx-auto">
            <div className="size-20 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 mx-auto mb-6 flex items-center justify-center">
              <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Welcome to Boarded</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Start by selecting or adding a climbing wall. Take a photo of your wall to begin setting routes.
            </p>
            <Button onClick={() => setShowWallPicker(true)} size="lg" className="gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              Get Started
            </Button>
          </div>
        ) : (
          <>
            <SearchFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              filterGrade={filterGrade}
              onFilterGradeChange={setFilterGrade}
              availableGrades={availableGrades}
              resultCount={wallRoutes.length}
            />

            {/* Loading state */}
            {routesLoading && wallRoutes.length === 0 ? (
              <div className="py-16 text-center">
                <div className="size-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center animate-pulse">
                  <svg className="w-8 h-8 text-muted-foreground animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-1">Loading routes...</h3>
                <p className="text-sm text-muted-foreground">Fetching climbs from the cloud</p>
              </div>
            ) : wallRoutes.length === 0 && (searchQuery || filterGrade !== 'all') ? (
              <div className="py-12 text-center">
                <div className="size-14 rounded-2xl bg-muted mx-auto mb-3 flex items-center justify-center">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-1">No routes found</h3>
                <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            ) : wallRoutes.length === 0 ? (
              <div className="py-12 text-center max-w-sm mx-auto">
                <div className="size-20 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 mx-auto mb-6 flex items-center justify-center">
                  <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">Create your first route</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Tap on the wall to place holds and build climbing routes. Mark start holds, hand holds, foot chips, and the finish.
                </p>
                <Button onClick={handleNewRoute} size="lg" className="gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Create Route
                </Button>
                <div className="mt-8 pt-6 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-3">Quick tips</p>
                  <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <div className="size-2.5 rounded-full bg-green-500" />
                      <span>Start</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="size-2.5 rounded-full bg-red-500" />
                      <span>Hands</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="size-2.5 rounded-full bg-blue-500" />
                      <span>Feet</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="size-2.5 rounded-full bg-yellow-500" />
                      <span>Finish</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <RouteList
                  routes={wallRoutes}
                  onViewRoute={handleViewRoute}
                  onLogClimb={setRouteToLog}
                  onDeleteRoute={setRouteToDelete}
                  onEditRoute={handleEditRoute}
                />
                {wallRoutes.length <= 3 && (
                  <div className="mx-auto mt-8 flex max-w-md items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/55 px-4 py-3">
                    <p className="text-sm text-muted-foreground">Add another problem to this wall.</p>
                    <Button onClick={handleNewRoute} variant="outline" size="sm">Create route</Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* Dialogs */}
      <WallPickerDialog
        open={showWallPicker}
        onOpenChange={setShowWallPicker}
      />

      <ConfirmDialog
        open={!!routeToDelete}
        onOpenChange={() => setRouteToDelete(null)}
        title="Delete Route"
        description={`Are you sure you want to delete "${routeToDelete?.name}"? This action cannot be undone.`}
        onConfirm={async () => {
          if (routeToDelete) {
            const deleted = await deleteRoute(routeToDelete.id);
            if (deleted) {
              toast.success('Route deleted');
            } else {
              toast.error('Unable to delete route. Please try again.');
            }
          }
        }}
      />

      <RouteViewerDialog
        route={routeToView}
        onOpenChange={() => setRouteToView(null)}
        wallImageUrl={selectedWall?.image_url || DEFAULT_WALL.image_url}
      />

      <LogClimbDialog
        route={routeToLog}
        onOpenChange={() => setRouteToLog(null)}
      />
    </div>
  );
}
