'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useHolds } from '@/lib/hooks/useHolds';
import { HoldType, HoldSize, Route, V_GRADES, HOLD_COLORS, HOLD_TYPE_CYCLE, HOLD_BORDER_WIDTH, Hold } from '@climbset/shared/types';
import { pixelToPercentage } from '@climbset/shared/utils/holds';
import { HoldMarker } from '@/components/wall/HoldMarker';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWallsStore, DEFAULT_WALL } from '@/lib/stores/walls-store';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useUserStore } from '@/lib/stores/user-store';

export default function EditorPage() {
  const [editRouteId, setEditRouteId] = useState<string | null>(null);
  const [paramsReady, setParamsReady] = useState(false);

  useEffect(() => {
    let active = true;
    const search = new URLSearchParams(window.location.search).get('edit');
    queueMicrotask(() => {
      if (!active) return;
      setEditRouteId(search);
      setParamsReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!paramsReady) {
    return (
      <div className="h-dvh bg-background flex items-center justify-center">
        <div className="text-muted-foreground font-medium">Loading editor...</div>
      </div>
    );
  }

  return <EditorContent editRouteId={editRouteId} />;
}

interface FullBleedCanvasProps {
  wallImageUrl: string;
  wallImageWidth?: number;
  wallImageHeight?: number;
  holds: Hold[];
  showSequence: boolean;
  onAddHold: (x: number, y: number) => void;
  onRemoveHold: (x: number, y: number) => void;
  onTap: (x: number, y: number) => void;
}

function FullBleedCanvas({
  wallImageUrl,
  wallImageWidth,
  wallImageHeight,
  holds,
  showSequence,
  onAddHold,
  onRemoveHold,
  onTap,
}: FullBleedCanvasProps) {
  const imageWidth = wallImageWidth && wallImageWidth > 0 ? wallImageWidth : 1920;
  const imageHeight = wallImageHeight && wallImageHeight > 0 ? wallImageHeight : 1080;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressRef = useRef(false);
  const ignoreNextClickRef = useRef(false);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const percentCoords = pixelToPercentage(x, y, rect.width, rect.height);
    onAddHold(percentCoords.x, percentCoords.y);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const percentCoords = pixelToPercentage(x, y, rect.width, rect.height);
    onRemoveHold(percentCoords.x, percentCoords.y);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    touchStartPosRef.current = { x, y };
    isLongPressRef.current = false;

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartPosRef.current || !containerRef.current) return;

    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const dx = Math.abs(x - touchStartPosRef.current.x);
    const dy = Math.abs(y - touchStartPosRef.current.y);

    if (dx > 10 || dy > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (!containerRef.current || !touchStartPosRef.current) return;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const { x, y } = touchStartPosRef.current;
    const percentCoords = pixelToPercentage(x, y, rect.width, rect.height);

    if (isLongPressRef.current) {
      onRemoveHold(percentCoords.x, percentCoords.y);
    } else {
      onTap(percentCoords.x, percentCoords.y);
    }

    ignoreNextClickRef.current = true;
    setTimeout(() => {
      ignoreNextClickRef.current = false;
    }, 0);

    touchStartPosRef.current = null;
    isLongPressRef.current = false;
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-background overflow-hidden select-none">
      <div
        ref={containerRef}
        className="relative w-full h-full cursor-crosshair touch-none select-none"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          src={wallImageUrl}
          alt="Climbing wall"
          width={imageWidth}
          height={imageHeight}
          className="w-full h-full object-cover select-none pointer-events-none"
          priority
          draggable={false}
          onLoad={() => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              setDimensions({ width: rect.width, height: rect.height });
            }
          }}
        />

        {dimensions.width > 0 &&
          holds.map((hold) => (
            <HoldMarker
              key={hold.id}
              hold={hold}
              containerWidth={dimensions.width}
              containerHeight={dimensions.height}
              showSequence={showSequence}
            />
          ))}
      </div>
    </div>
  );
}

function EditorContent({ editRouteId }: { editRouteId: string | null }) {
  const router = useRouter();

  const {
    holds,
    selectedType,
    selectedSize,
    showSequence,
    setSelectedType,
    setSelectedSize,
    addHold,
    removeHold,
    handleTap,
    clearHolds,
    clearDraft,
    setAllHolds,
    undo,
    redo,
    canUndo,
    canRedo,
    toggleSequenceVisibility,
  } = useHolds();

  const { selectedWall } = useWallsStore();
  const {
    routes,
    addRoute,
    updateRoute,
    fetchRouteById,
  } = useRoutesStore();
  const {
    userId,
    displayName,
    isModerator,
    isLoading: userLoading,
  } = useUserStore();
  const wall = selectedWall?.id === 'all-walls' ? DEFAULT_WALL : (selectedWall || DEFAULT_WALL);

  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [editResolution, setEditResolution] = useState<'loading' | 'ready' | 'error'>(
    editRouteId ? 'loading' : 'ready'
  );
  const editFetchRef = useRef<string | null>(null);
  const isEditMode = !!editRouteId;
  const canvasWall = editingRoute
    ? {
        ...wall,
        image_url: editingRoute.wall_image_url || editingRoute.wall?.image_url || wall.image_url,
        image_width: editingRoute.wall_image_width || editingRoute.wall?.image_width || wall.image_width,
        image_height: editingRoute.wall_image_height || editingRoute.wall?.image_height || wall.image_height,
      }
    : wall;
  const loadedEditRef = useRef<string | null>(null);

  const canEditRoute = useCallback((route: Route) => {
    return isModerator || route.user_id === userId || route.user_id === 'local-user';
  }, [isModerator, userId]);

  useEffect(() => {
    if (!editRouteId) {
      editFetchRef.current = null;
      loadedEditRef.current = null;
      setEditingRoute(null);
      setEditResolution('ready');
      return;
    }
    if (userLoading) return;
    if (editFetchRef.current && editFetchRef.current !== editRouteId) {
      editFetchRef.current = null;
      loadedEditRef.current = null;
    }
    if (loadedEditRef.current === editRouteId) return;

    const loadRoute = (route: Route) => {
      if (!canEditRoute(route)) {
        setEditResolution('error');
        toast.error('You do not have permission to edit this route');
        router.push('/');
        return;
      }
      setEditingRoute(route);
      setAllHolds(route.holds);
      setEditResolution('ready');
      localStorage.removeItem('climbset-draft');
      loadedEditRef.current = editRouteId;
    };

    const route = routes.find((candidate) => candidate.id === editRouteId);
    if (route) {
      loadRoute(route);
      return;
    }
    if (editFetchRef.current === editRouteId) return;

    editFetchRef.current = editRouteId;
    setEditResolution('loading');
    let active = true;
    void fetchRouteById(editRouteId).then((resolvedRoute) => {
      if (!active) return;
      if (resolvedRoute) {
        loadRoute(resolvedRoute);
        return;
      }
      setEditResolution('error');
      toast.error('Route not found');
      router.push('/');
    }).catch(() => {
      if (!active) return;
      setEditResolution('error');
      toast.error('Unable to load this route');
      router.push('/');
    });

    return () => {
      active = false;
    };
  }, [editRouteId, userLoading, routes, router, setAllHolds, canEditRoute, fetchRouteById]);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [routeGrade, setRouteGrade] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (editingRoute) {
      setRouteName(editingRoute.name);
      setRouteGrade(editingRoute.grade_v || '');
    }
  }, [editingRoute]);

  const handleSave = async () => {
    if (isEditMode && (editResolution !== 'ready' || !editingRoute)) {
      setSaveError('This route is still loading. Please try again.');
      return;
    }
    if (!routeName.trim()) {
      setSaveError('Please enter a route name');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      if (isEditMode && editingRoute) {
        const updated = await updateRoute(editingRoute.id, {
          name: routeName.trim(),
          grade_v: routeGrade && routeGrade !== 'ungraded' ? routeGrade : undefined,
          holds,
        });
        if (!updated) throw new Error('Unable to update this route. Check your permissions and try again.');
        toast.success('Route updated!');
        router.push('/');
      } else {
        const route: Route = {
          id: crypto.randomUUID(),
          user_id: userId || 'local-user',
          user_name: displayName || 'Anonymous',
          wall_id: wall.id,
          wall_image_url: wall.image_url,
          wall_image_width: wall.image_width,
          wall_image_height: wall.image_height,
          name: routeName.trim(),
          grade_v: routeGrade && routeGrade !== 'ungraded' ? routeGrade : undefined,
          holds,
          is_public: false,
          view_count: 0,
          share_token: nanoid(10),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const saved = await addRoute(route);
        if (!saved) throw new Error('Route was saved locally but could not be synced to the server.');
        toast.success('Route saved!');
      }

      clearDraft();
      setShowSaveDialog(false);
      setRouteName('');
      setRouteGrade('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === '1') setSelectedType('start');
      if (e.key === '2') setSelectedType('hand');
      if (e.key === '3') setSelectedType('foot');
      if (e.key === '4') setSelectedType('finish');

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedType, undo, redo]);

  const holdTypes: HoldType[] = ['start', 'hand', 'foot', 'finish'];

  const sizeToValue = (size: HoldSize): number => {
    switch (size) {
      case 'small': return 0;
      case 'medium': return 50;
      case 'large': return 100;
    }
  };

  const valueToSize = (value: number): HoldSize => {
    if (value < 33) return 'small';
    if (value < 67) return 'medium';
    return 'large';
  };

  const [sizeValue, setSizeValue] = useState(sizeToValue(selectedSize));

  useEffect(() => {
    setSizeValue(sizeToValue(selectedSize));
  }, [selectedSize]);

  const handleSizeChange = (value: number) => {
    setSizeValue(value);
    const newSize = valueToSize(value);
    if (newSize !== selectedSize) {
      setSelectedSize(newSize);
    }
  };

  const [isDraggingSize, setIsDraggingSize] = useState(false);
  const dragStartRef = useRef<{ x: number; startValue: number } | null>(null);

  const handleSizeDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingSize(true);
    dragStartRef.current = { x: e.clientX, startValue: sizeValue };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleSizeDragMove = (e: React.PointerEvent) => {
    if (!isDraggingSize || !dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const newValue = Math.max(0, Math.min(100, dragStartRef.current.startValue + deltaX * 1.5));
    handleSizeChange(newValue);
  };

  const handleSizeDragEnd = (e: React.PointerEvent) => {
    setIsDraggingSize(false);
    dragStartRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const previewSize = 12 + (sizeValue / 100) * 20;
  const previewBorderWidth = HOLD_BORDER_WIDTH[selectedSize];

  const cycleHoldType = () => {
    const currentIndex = HOLD_TYPE_CYCLE.indexOf(selectedType);
    const nextIndex = (currentIndex + 1) % HOLD_TYPE_CYCLE.length;
    setSelectedType(HOLD_TYPE_CYCLE[nextIndex]);
  };

  const handleSaveDialogChange = (open: boolean) => {
    setShowSaveDialog(open);

    if (open) {
      if (isEditMode && editingRoute) {
        setRouteName(editingRoute.name);
        setRouteGrade(editingRoute.grade_v || '');
      }
      return;
    }

    if (!isEditMode) {
      setRouteName('');
      setRouteGrade('');
    }

    setSaveError(null);
  };

  if (isEditMode && editResolution !== 'ready') {
    return (
      <div className="h-dvh bg-background flex items-center justify-center">
        <div className="text-center text-muted-foreground font-medium" aria-live="polite">
          {editResolution === 'error' ? 'Unable to load route.' : 'Loading route...'}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-dvh overflow-hidden bg-background">
      {/* Full-bleed wall canvas */}
      <FullBleedCanvas
        wallImageWidth={canvasWall.image_width}
        wallImageHeight={canvasWall.image_height}
        wallImageUrl={canvasWall.image_url}
        holds={holds}
        showSequence={showSequence}
        onAddHold={addHold}
        onRemoveHold={removeHold}
        onTap={handleTap}
      />

      {/* Header - translucent blurred overlay */}
      <header className="fixed top-0 left-0 right-0 z-40 px-4 pt-safe pt-4 pb-3 bg-card/40 backdrop-blur-2xl border-b border-border/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            aria-label="Back to home"
            className="size-10 rounded-xl bg-card/60 backdrop-blur-xl border border-border/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
              className="size-10 rounded-xl bg-card/60 backdrop-blur-xl border border-border/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
              className="size-10 rounded-xl bg-card/60 backdrop-blur-xl border border-border/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
              </svg>
            </button>
            <button
              onClick={() => setShowSaveDialog(true)}
              disabled={holds.length === 0 || (isEditMode && editResolution !== 'ready')}
              className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-95 active:scale-95"
            >
              {isEditMode ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </header>

      {/* Floating instructional hint pill */}
      <p className="pointer-events-none fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-full border border-border/20 bg-card/60 px-4 py-1.5 text-center text-xs font-medium text-muted-foreground shadow-lg backdrop-blur-xl">
        Tap the wall to place holds · tap a hold to change its type
      </p>

      {/* Bottom Controls - translucent blurred overlay above fixed bottom nav safe area */}
      <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
        {/* Mobile: Bottom controls elevated above fixed bottom nav */}
        <div className="md:hidden pb-[84px] px-4 pointer-events-auto">
          <div className="bg-card/75 backdrop-blur-2xl border border-border/20 rounded-2xl p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={cycleHoldType}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/20 bg-muted/40 active:scale-95 transition-all"
                style={{
                  backgroundColor: `${HOLD_COLORS[selectedType]}15`,
                  borderColor: `${HOLD_COLORS[selectedType]}40`,
                }}
              >
                <div
                  className="size-4 rounded-full shadow-sm"
                  style={{ backgroundColor: HOLD_COLORS[selectedType] }}
                />
                <span className="text-sm font-semibold text-foreground capitalize">
                  {selectedType}
                </span>
                <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                </svg>
              </button>

              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border/20 transition-all touch-none select-none",
                  isDraggingSize
                    ? "bg-primary/10 border-primary/40 scale-105"
                    : "bg-muted/40"
                )}
                onPointerDown={handleSizeDragStart}
                onPointerMove={handleSizeDragMove}
                onPointerUp={handleSizeDragEnd}
                onPointerCancel={handleSizeDragEnd}
              >
                <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
                <div
                  className="rounded-full transition-all"
                  style={{
                    width: previewSize,
                    height: previewSize,
                    border: `${previewBorderWidth}px solid ${HOLD_COLORS[selectedType]}`,
                    backgroundColor: `${HOLD_COLORS[selectedType]}30`,
                    boxShadow: isDraggingSize ? `0 0 8px ${HOLD_COLORS[selectedType]}66` : undefined,
                  }}
                />
                <span className="text-xs text-muted-foreground capitalize w-12">{selectedSize}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleSequenceVisibility(!showSequence)}
                  aria-label="Toggle sequence numbers"
                  title={showSequence ? "Hide sequence numbers" : "Show sequence numbers"}
                  className={cn(
                    'h-10 rounded-xl px-2.5 flex items-center justify-center gap-1.5 transition-all border border-transparent',
                    showSequence
                      ? 'bg-primary/15 text-primary border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
                  </svg>
                  <span className="hidden text-xs font-medium min-[400px]:inline">Sequence</span>
                </button>

                <button
                  onClick={clearHolds}
                  aria-label="Clear all holds"
                  title="Clear all holds"
                  className="h-10 rounded-xl px-2.5 flex items-center justify-center gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  <span className="hidden text-xs font-medium min-[400px]:inline">Clear</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop controls overlay */}
        <div className="hidden md:block pb-safe p-4 pointer-events-auto">
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2">
              <span className="text-xs font-medium text-foreground bg-card/80 backdrop-blur-xl border border-border/20 px-3 py-1.5 rounded-lg shadow-lg">
                {holds.length} holds
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/20 bg-card/80 backdrop-blur-2xl p-2 shadow-2xl">
              <div className="flex min-w-[22rem] flex-1 gap-1 max-lg:basis-full">
                {holdTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={cn(
                      'flex-1 py-2 rounded-xl flex items-center justify-center gap-2 transition-all border-2',
                      selectedType === type
                        ? 'bg-muted/80 shadow-inner'
                        : 'border-transparent hover:bg-muted/40'
                    )}
                    style={selectedType === type ? {
                      borderColor: HOLD_COLORS[type],
                      boxShadow: `0 0 12px ${HOLD_COLORS[type]}66`,
                    } : undefined}
                  >
                    <div
                      className={cn(
                        'size-4 rounded-full shadow-sm transition-transform',
                        selectedType === type && 'scale-110'
                      )}
                      style={{ backgroundColor: HOLD_COLORS[type] }}
                    />
                    <span className={cn(
                      'text-xs font-medium capitalize',
                      selectedType === type ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {type}
                    </span>
                  </button>
                ))}
              </div>

              <div className="hidden h-8 w-px bg-border/20 mx-1 lg:block" />

              <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2 border border-border/10">
                <div
                  className="shrink-0 rounded-full transition-all"
                  style={{
                    width: previewSize,
                    height: previewSize,
                    border: `${previewBorderWidth}px solid ${HOLD_COLORS[selectedType]}`,
                    backgroundColor: `${HOLD_COLORS[selectedType]}30`,
                  }}
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sizeValue}
                  onChange={(e) => handleSizeChange(Number(e.target.value))}
                  className="w-20 h-1.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:cursor-pointer"
                  title={`Size: ${selectedSize}`}
                />
                <span className="text-xs text-muted-foreground w-10 capitalize">{selectedSize}</span>
              </div>

              <div className="hidden h-8 w-px bg-border/20 mx-1 lg:block" />

              <button
                onClick={() => toggleSequenceVisibility(!showSequence)}
                aria-label="Toggle sequence numbers"
                title={showSequence ? "Hide sequence numbers" : "Show sequence numbers"}
                className={cn(
                  'h-10 rounded-xl px-3 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors border border-transparent',
                  showSequence
                    ? 'bg-primary/20 text-primary border-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
                </svg>
                <span>Sequence</span>
              </button>

              <button
                onClick={clearHolds}
                aria-label="Clear all holds"
                title="Clear all holds"
                className="h-10 rounded-xl px-3 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                <span>Clear</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save / Edit Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={handleSaveDialogChange}>
        <DialogContent className="bg-card/95 backdrop-blur-2xl border-border/20">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Update Route' : 'Save Route'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="route-name">Route Name</Label>
              <Input
                id="route-name"
                type="text"
                value={routeName}
                onChange={(e) => {
                  setRouteName(e.target.value);
                  setSaveError(null);
                }}
                placeholder="e.g., Crimpy Corner"
                disabled={isSaving}
                autoFocus
              />
              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="route-grade">Grade (Your Suggestion)</Label>
              <Select value={routeGrade} onValueChange={setRouteGrade}>
                <SelectTrigger id="route-grade">
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ungraded">Ungraded</SelectItem>
                  {V_GRADES.map((grade) => (
                    <SelectItem key={grade} value={grade}>
                      {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This is your suggested grade as the setter
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleSaveDialogChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !routeName.trim()}
            >
              {isSaving ? 'Saving...' : isEditMode ? 'Update Route' : 'Save Route'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
