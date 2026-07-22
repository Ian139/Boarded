'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import { HOLD_BORDER_WIDTH, HOLD_COLORS, type Comment, type Hold, type Route } from '@climbset/shared/types';
import { CommentsSection } from '@/components/route/CommentsSection';
import { LogClimbDialog } from '@/components/home/LogClimbDialog';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useUserStore } from '@/lib/stores/user-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface RouteViewerProps {
  wallImageUrl: string;
  wallImageWidth?: number;
  wallImageHeight?: number;
  holds: Hold[];
  routeName: string;
  grade?: string;
  setterName?: string;
  routeId?: string;
  comments?: Comment[];
  fitToContent?: boolean;
  route?: Route;
}

type Point = { x: number; y: number };
type ViewerSize = { width: number; height: number };
type Pan = Point;
type Gesture =
  | { kind: 'pan'; startPoint: Point; startPan: Pan }
  | {
      kind: 'pinch';
      startDistance: number;
      startMidpoint: Point;
      startZoom: number;
      startPan: Pan;
    };

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distanceBetween(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpointBetween(first: Point, second: Point): Point {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

export function RouteViewer({
  wallImageUrl,
  wallImageWidth,
  wallImageHeight,
  holds,
  routeName,
  grade,
  setterName,
  routeId,
  comments = [],
  fitToContent = false,
  route,
}: RouteViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState<ViewerSize>({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState<ViewerSize | null>(null);
  const [naturalSize, setNaturalSize] = useState<ViewerSize>({
    width: wallImageWidth || 1920,
    height: wallImageHeight || 1080,
  });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [isLogOpen, setIsLogOpen] = useState(false);
  const zoomRef = useRef(MIN_ZOOM);
  const panRef = useRef<Pan>({ x: 0, y: 0 });
  const pointerMapRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const reducedMotion = useReducedMotion();

  const { routes, toggleLike, isLikedByUser, getLikeCount } = useRoutesStore();
  const { userId } = useUserStore();

  const updateViewportSize = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    setViewportSize((current) => {
      if (current.width === rect.width && current.height === rect.height) return current;
      return { width: rect.width, height: rect.height };
    });
  }, []);

  useEffect(() => {
    updateViewportSize();
    const viewport = viewportRef.current;
    if (!viewport) return;

    const resizeObserver = new ResizeObserver(updateViewportSize);
    resizeObserver.observe(viewport);
    window.addEventListener('resize', updateViewportSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateViewportSize);
    };
  }, [updateViewportSize]);

  useEffect(() => {
    if (!fitToContent) {
      setDisplaySize(null);
      return;
    }

    const aspect = naturalSize.width / Math.max(1, naturalSize.height);
    const fit = () => {
      const maxWidth = Math.min(window.innerWidth * 0.95, naturalSize.width);
      const maxHeight = Math.min(
        window.innerHeight * (routeId ? 0.64 : 0.9),
        naturalSize.height
      );
      let width = maxWidth;
      let height = width / aspect;

      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspect;
      }

      setDisplaySize({
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      });
    };

    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fitToContent, naturalSize, routeId]);

  const canvasSize = useMemo<ViewerSize>(() => {
    if (fitToContent && displaySize) return displaySize;
    if (!viewportSize.width || !viewportSize.height) return { width: 0, height: 0 };

    const aspect = naturalSize.width / Math.max(1, naturalSize.height);
    let width = Math.min(viewportSize.width, naturalSize.width);
    let height = width / aspect;
    if (height > viewportSize.height) {
      height = viewportSize.height;
      width = height * aspect;
    }

    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }, [displaySize, fitToContent, naturalSize, viewportSize]);

  const clampPan = useCallback(
    (candidate: Pan, scale: number): Pan => {
      if (!viewportSize.width || !viewportSize.height || !canvasSize.width || !canvasSize.height) {
        return { x: 0, y: 0 };
      }

      const maxX = Math.max(0, (canvasSize.width * scale - viewportSize.width) / 2);
      const maxY = Math.max(0, (canvasSize.height * scale - viewportSize.height) / 2);
      return {
        x: clamp(candidate.x, -maxX, maxX),
        y: clamp(candidate.y, -maxY, maxY),
      };
    },
    [canvasSize, viewportSize]
  );

  const commitPan = useCallback((nextPan: Pan) => {
    panRef.current = nextPan;
    setPan(nextPan);
  }, []);

  const applyZoom = useCallback(
    (requestedZoom: number, anchor?: Point) => {
      const nextZoom = clamp(requestedZoom, MIN_ZOOM, MAX_ZOOM);
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      let nextPan: Pan = { x: 0, y: 0 };

      if (anchor && viewportSize.width && viewportSize.height) {
        const center = {
          x: viewportSize.width / 2,
          y: viewportSize.height / 2,
        };
        const worldPoint = {
          x: (anchor.x - center.x - currentPan.x) / currentZoom,
          y: (anchor.y - center.y - currentPan.y) / currentZoom,
        };
        nextPan = {
          x: anchor.x - center.x - worldPoint.x * nextZoom,
          y: anchor.y - center.y - worldPoint.y * nextZoom,
        };
      }

      nextPan = clampPan(nextPan, nextZoom);
      zoomRef.current = nextZoom;
      commitPan(nextPan);
      setZoom(nextZoom);
    },
    [clampPan, commitPan, viewportSize]
  );

  const resetView = useCallback(() => {
    zoomRef.current = MIN_ZOOM;
    commitPan({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
  }, [commitPan]);

  useEffect(() => {
    const nextPan = clampPan(panRef.current, zoomRef.current);
    if (nextPan.x !== panRef.current.x || nextPan.y !== panRef.current.y) {
      commitPan(nextPan);
    }
  }, [canvasSize, clampPan, commitPan, viewportSize]);

  useEffect(() => {
    resetView();
    pointerMapRef.current.clear();
    gestureRef.current = null;
  }, [resetView, routeId, wallImageUrl]);

  const handleImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget;
      if (image.naturalWidth && image.naturalHeight) {
        setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
      }
      updateViewportSize();
    },
    [updateViewportSize]
  );

  const getLocalPoint = useCallback((event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const beginPinch = useCallback(() => {
    const points = Array.from(pointerMapRef.current.values()).slice(0, 2);
    if (points.length < 2) return;

    gestureRef.current = {
      kind: 'pinch',
      startDistance: Math.max(1, distanceBetween(points[0], points[1])),
      startMidpoint: midpointBetween(points[0], points[1]),
      startZoom: zoomRef.current,
      startPan: panRef.current,
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const point = getLocalPoint(event);
      pointerMapRef.current.set(event.pointerId, point);
      event.currentTarget.setPointerCapture(event.pointerId);

      if (pointerMapRef.current.size >= 2) {
        beginPinch();
      } else {
        gestureRef.current = {
          kind: 'pan',
          startPoint: point,
          startPan: panRef.current,
        };
      }
    },
    [beginPinch, getLocalPoint]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointerMapRef.current.has(event.pointerId)) return;
      const point = getLocalPoint(event);
      pointerMapRef.current.set(event.pointerId, point);
      const gesture = gestureRef.current;

      if (pointerMapRef.current.size >= 2) {
        if (!gesture || gesture.kind !== 'pinch') {
          beginPinch();
          return;
        }

        const points = Array.from(pointerMapRef.current.values()).slice(0, 2);
        const midpoint = midpointBetween(points[0], points[1]);
        const pinchZoom =
          gesture.startZoom *
          (distanceBetween(points[0], points[1]) / Math.max(1, gesture.startDistance));
        const nextZoom = clamp(pinchZoom, MIN_ZOOM, MAX_ZOOM);
        const center = {
          x: viewportSize.width / 2,
          y: viewportSize.height / 2,
        };
        const worldPoint = {
          x: (gesture.startMidpoint.x - center.x - gesture.startPan.x) / gesture.startZoom,
          y: (gesture.startMidpoint.y - center.y - gesture.startPan.y) / gesture.startZoom,
        };
        const nextPan = clampPan(
          {
            x: midpoint.x - center.x - worldPoint.x * nextZoom,
            y: midpoint.y - center.y - worldPoint.y * nextZoom,
          },
          nextZoom
        );

        zoomRef.current = nextZoom;
        commitPan(nextPan);
        setZoom(nextZoom);
        return;
      }

      if (gesture?.kind === 'pan' && zoomRef.current > MIN_ZOOM) {
        commitPan(
          clampPan(
            {
              x: gesture.startPan.x + point.x - gesture.startPoint.x,
              y: gesture.startPan.y + point.y - gesture.startPoint.y,
            },
            zoomRef.current
          )
        );
      }
    },
    [beginPinch, clampPan, commitPan, getLocalPoint, viewportSize]
  );

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointerMapRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const remaining = Array.from(pointerMapRef.current.entries());
    if (remaining.length === 1) {
      gestureRef.current = {
        kind: 'pan',
        startPoint: remaining[0][1],
        startPan: panRef.current,
      };
    } else {
      gestureRef.current = null;
    }
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const nextZoom = zoomRef.current * Math.exp(-event.deltaY * 0.0015);
      applyZoom(nextZoom, anchor);
    },
    [applyZoom]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && zoomRef.current > MIN_ZOOM) {
        event.preventDefault();
        resetView();
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        applyZoom(zoomRef.current * 1.2);
      } else if (event.key === '-') {
        event.preventDefault();
        applyZoom(zoomRef.current / 1.2);
      }
    },
    [applyZoom, resetView]
  );

  const currentRoute = routeId ? routes.find((candidate) => candidate.id === routeId) : undefined;
  const routeForActions = currentRoute || route;
  const visibleComments = currentRoute?.comments ?? comments;
  const likeCount = routeId ? getLikeCount(routeId) : routeForActions?.liked_by?.length || 0;
  const sendCount = routeForActions?.ascents?.length || 0;
  const isLiked = Boolean(routeId && userId && isLikedByUser(routeId, userId));

  const handleLike = useCallback(async () => {
    if (!routeId) return;
    if (!userId) {
      toast.error('Log in to like routes.');
      return;
    }
    if (routeForActions?.user_id === 'local-user') {
      toast.error('Sync this route before liking it.');
      return;
    }

    const saved = await toggleLike(routeId, userId);
    if (!saved) toast.error('Unable to update like. Please try again.');
  }, [routeForActions?.user_id, routeId, toggleLike, userId]);

  const handleShare = useCallback(async () => {
    const shareUrl =
      routeForActions?.share_token && typeof window !== 'undefined'
        ? `${window.location.origin}/share/${routeForActions.share_token}`
        : typeof window !== 'undefined'
          ? window.location.href
          : '';
    if (!shareUrl) return;

    try {
      if (navigator.share) {
        await navigator.share({ title: routeName, text: `Check out ${routeName}`, url: shareUrl });
        return;
      }
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error('Unable to share this route.');
    }
  }, [routeForActions?.share_token, routeName]);

  const viewportStyle =
    fitToContent && displaySize
      ? { width: displaySize.width, height: displaySize.height }
      : undefined;
  const rootStyle = fitToContent && displaySize ? { width: displaySize.width } : undefined;
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.24, ease: 'easeOut' as const };

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col',
        fitToContent ? 'w-fit max-w-full' : 'h-full w-full min-h-0'
      )}
      style={rootStyle}
    >
      <div
        ref={viewportRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={resetView}
        aria-label="Route wall viewer. Pinch or scroll to zoom, then drag to pan."
        className={cn(
          'relative min-w-0 touch-none select-none overflow-hidden outline-none',
          fitToContent ? 'shrink-0' : 'min-h-0 flex-1'
        )}
        style={viewportStyle}
      >
        <div className="absolute inset-0 flex items-center justify-center overflow-visible">
          {canvasSize.width > 0 && canvasSize.height > 0 && (
            <div
              className="relative shrink-0 origin-center will-change-transform"
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              }}
            >
              <Image
                src={wallImageUrl}
                alt="Climbing wall"
                width={wallImageWidth || naturalSize.width}
                height={wallImageHeight || naturalSize.height}
                className="absolute inset-0 block h-full w-full select-none object-fill"
                priority
                draggable={false}
                onLoad={handleImageLoad}
              />

              <div className="pointer-events-none absolute inset-0">
                {holds.map((hold) => {
                  const size = hold.size === 'small' ? 24 : hold.size === 'large' ? 56 : 36;
                  const borderWidth = HOLD_BORDER_WIDTH[hold.size];
                  const label =
                    hold.type === 'start' ? 'S' : hold.type === 'finish' ? 'F' : null;

                  return (
                    <div
                      key={hold.id}
                      className="absolute flex items-center justify-center"
                      style={{
                        left: `${hold.x}%`,
                        top: `${hold.y}%`,
                        width: size,
                        height: size,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <div
                        className="relative flex h-full w-full items-center justify-center rounded-full border-solid"
                        style={{
                          borderWidth: `${borderWidth}px`,
                          borderColor: HOLD_COLORS[hold.type],
                        }}
                      >
                        <div
                          className="absolute inset-0 rounded-full opacity-25"
                          style={{ backgroundColor: HOLD_COLORS[hold.type] }}
                        />
                        {label && (
                          <span className="relative text-sm font-bold text-foreground">{label}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end p-3">
          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-foreground/[0.12] bg-card/75 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => applyZoom(zoomRef.current / 1.2)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              className="flex size-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/[0.08] hover:text-foreground disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none"
            >
              <span aria-hidden="true" className="text-lg leading-none">−</span>
            </button>
            <span className="min-w-12 text-center text-xs font-medium tabular-nums text-foreground/70">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => applyZoom(zoomRef.current * 1.2)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              className="flex size-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/[0.08] hover:text-foreground disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none"
            >
              <span aria-hidden="true" className="text-lg leading-none">+</span>
            </button>
            {zoom > MIN_ZOOM && (
              <button
                type="button"
                onClick={resetView}
                aria-label="Reset zoom and pan"
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/[0.08] hover:text-foreground motion-reduce:transition-none"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {routeId && (
        <motion.section
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
          className="w-full shrink-0 border-t border-foreground/[0.12] bg-card/80 backdrop-blur-xl motion-reduce:transition-none"
        >
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-foreground">{routeName}</h3>
                {setterName && <p className="mt-0.5 text-sm text-muted-foreground">by {setterName}</p>}
              </div>
              {grade && (
                <span className="shrink-0 rounded-full bg-primary/90 px-3 py-1 text-xs font-bold text-primary-foreground">
                  {grade}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  <strong className="font-semibold text-foreground">{likeCount}</strong> likes
                </span>
                <span>
                  <strong className="font-semibold text-foreground">{sendCount}</strong> sends
                </span>
                <span>
                  <strong className="font-semibold text-foreground">{visibleComments.length}</strong>{' '}
                  comments
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleLike}
                  aria-label={isLiked ? 'Unlike route' : 'Like route'}
                  aria-pressed={isLiked}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-xl border border-foreground/[0.12] px-3 text-xs font-semibold transition-colors motion-reduce:transition-none',
                    isLiked
                      ? 'border-border/50 bg-muted/50 text-red-500'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-red-500'
                  )}
                >
                  <svg className="size-4" fill={isLiked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.1-.39.15-.79.15-1.19V6.75A2.25 2.25 0 019.033 4.5h.322a1.5 1.5 0 011.414 1l.676 2.028c.122.365.464.612.849.612h4.657a2.25 2.25 0 012.214 2.66l-1.027 5.65a2.25 2.25 0 01-2.214 1.848H9.75a3 3 0 01-3-3v-5.048c0-.002-.003-.003-.004-.001L6.633 10.25z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 10.5h2.25v7.5H3.75a.75.75 0 01-.75-.75v-6a.75.75 0 01.75-.75z" />
                  </svg>
                  Like
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/50 bg-muted/50 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-primary motion-reduce:transition-none"
                >
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12a4.5 4.5 0 014.5-4.5h2.25m0 0L11.25 4.5m3 3l-3 3M16.5 12a4.5 4.5 0 01-4.5 4.5H9.75m0 0l3 3m-3-3l3-3" />
                  </svg>
                  Share
                </button>
                {routeForActions && (
                  <button
                    type="button"
                    onClick={() => setIsLogOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 motion-reduce:transition-none"
                  >
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m9-9H3" />
                    </svg>
                    Log Send
                  </button>
                )}
              </div>
            </div>

            <CommentsSection routeId={routeId} comments={visibleComments} />
          </div>
        </motion.section>
      )}

      {isLogOpen && routeForActions && (
        <LogClimbDialog route={routeForActions} onOpenChange={setIsLogOpen} />
      )}
    </div>
  );
}
