'use client';

import { useState } from 'react';
import { nanoid } from 'nanoid';
import { motion, AnimatePresence } from 'motion/react';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useUserStore } from '@/lib/stores/user-store';
import { useWallsStore, DEFAULT_WALL } from '@/lib/stores/walls-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { StarRating } from '@/components/ui/star-rating';
import { HOLD_COLORS } from '@/lib/types';
import { calculateDisplayGrade } from '@/lib/utils/grades';
import type { Route } from '@/lib/types';
import Image from 'next/image';

interface RouteListProps {
  routes: Route[];
  onViewRoute: (route: Route) => void;
  onLogClimb: (route: Route) => void;
  onDeleteRoute: (route: Route) => void;
  onEditRoute: (route: Route) => void;
}

export function RouteList({ routes, onViewRoute, onLogClimb, onDeleteRoute, onEditRoute }: RouteListProps) {
  const { userId, isModerator } = useUserStore();
  const { toggleLike, isLikedByUser, getLikeCount, hasUserClimbed, updateRoute } = useRoutesStore();
  const { getWallById } = useWallsStore();

  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());

  const toggleCardFlip = (routeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(routeId)) {
        newSet.delete(routeId);
      } else {
        newSet.add(routeId);
      }
      return newSet;
    });
  };

  const handleToggleLike = (route: Route, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(route.id, userId || 'local-user');
  };

  const getShareUrl = (token: string) => {
    if (typeof window === 'undefined') return token;
    return `${window.location.origin}/share/${token}`;
  };

  const handleShareRoute = async (route: Route, e: React.MouseEvent) => {
    e.stopPropagation();
    let token = route.share_token;

    if (!token) {
      if (!userId) {
        toast.error('Log in to enable sharing for existing routes');
        return;
      }
      token = nanoid(10);
      await updateRoute(route.id, { share_token: token });
    }

    const url = getShareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Share link copied: ${url}`);
    } catch {
      toast.error('Unable to copy link');
    }
  };

  const canDeleteRoute = (route: Route) => {
    return isModerator || route.user_id === userId || route.user_id === 'local-user';
  };

  const canEditRoute = canDeleteRoute;

  return (
    <>
      {/* Mobile Routes List */}
      <div className="md:hidden divide-y divide-border/50">
        {routes.map((route, index) => {
          const ascents = route.ascents || [];
          const avgRating = ascents.length > 0
            ? ascents.reduce((sum, a) => sum + (a.rating || 0), 0) / ascents.filter(a => a.rating).length || route.rating || 0
            : route.rating || 0;
          const displayGrade = calculateDisplayGrade(route.grade_v, ascents);
          const isExpanded = flippedCards.has(route.id);

          const wall = getWallById(route.wall_id);
          const wallImage = route.wall_image_url || wall?.image_url || DEFAULT_WALL.image_url;
          const wallName = wall?.name || 'Unknown wall';

          return (
            <motion.div
              key={route.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.03 }}
              className="relative"
            >
              {/* Feathered active background */}
              <div className={cn(
                "absolute inset-0 -mx-2 rounded-xl transition-all duration-200",
                isExpanded ? "bg-muted/40" : "bg-transparent active:bg-muted/30"
              )} />

              <div
                onClick={() => onViewRoute(route)}
                className="relative flex items-center gap-3 py-4 cursor-pointer"
              >
                {/* Grade */}
                <div className="w-12 shrink-0">
                  <span className={cn(
                    "text-lg font-bold",
                    displayGrade ? "text-primary" : "text-muted-foreground"
                  )}>
                    {displayGrade || '—'}
                  </span>
                </div>

                {/* Wall thumbnail */}
                <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
                  <Image
                    src={wallImage}
                    alt={wallName}
                    fill
                    className="object-cover"
                  />
                </div>

                {/* Route Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{route.name}</h3>
                  <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                    <span className="truncate">{route.user_name || 'Anonymous'}</span>
                    <span className="truncate text-xs">{wallName}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <div className="flex gap-0.5">
                        {route.holds.slice(0, 3).map((hold, i) => (
                          <div
                            key={i}
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: HOLD_COLORS[hold.type] }}
                          />
                        ))}
                      </div>
                      {route.holds.length}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => handleToggleLike(route, e)}
                    aria-label="Like route"
                    className={cn(
                      "size-9 rounded-lg flex items-center justify-center transition-colors",
                      isLikedByUser(route.id, userId || 'local-user')
                        ? "text-red-500"
                        : "text-muted-foreground"
                    )}
                  >
                    <svg
                      className="w-5 h-5"
                      fill={isLikedByUser(route.id, userId || 'local-user') ? "currentColor" : "none"}
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onLogClimb(route);
                    }}
                    aria-label="Log climb"
                    className={cn(
                      "size-9 rounded-lg flex items-center justify-center transition-colors",
                      hasUserClimbed(route.id, userId || 'local-user')
                        ? "text-secondary"
                        : "text-muted-foreground"
                    )}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleShareRoute(route, e)}
                    aria-label="Share route"
                    className="size-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm9-6.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm0 13.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-4.243-11.121l3.486 1.743m-3.486 5.006l3.486-1.743" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => toggleCardFlip(route.id, e)}
                    aria-label="View info"
                    className={cn(
                      "size-9 rounded-lg flex items-center justify-center transition-colors",
                      isExpanded
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    <svg
                      className={cn(
                        "w-5 h-5 transition-transform duration-200",
                        isExpanded && "rotate-180"
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded Info Panel */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="relative overflow-hidden"
                  >
                    <div className="pb-4 space-y-3">
                      {/* Stats Grid */}
                      <div className="grid grid-cols-5 gap-2">
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">Grade</p>
                          <p className="font-bold text-primary">{displayGrade || '—'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">Rating</p>
                          <div className="flex justify-center">
                            {avgRating > 0 ? (
                              <span className="font-bold">{avgRating.toFixed(1)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">Sends</p>
                          <p className="font-bold">{ascents.length}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">Likes</p>
                          <p className="font-bold">{getLikeCount(route.id)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">Views</p>
                          <p className="font-bold">{route.view_count || 0}</p>
                        </div>
                      </div>

                      {/* Rating Stars */}
                      {avgRating > 0 && (
                        <div className="flex justify-center">
                          <StarRating rating={Math.round(avgRating)} />
                        </div>
                      )}

                      {/* Recent Climbers */}
                      {ascents.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5 text-center">Recent climbers</p>
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {ascents.slice(0, 4).map((a, i) => (
                              <span key={i} className="text-xs bg-muted/60 px-2 py-0.5 rounded">
                                {a.user_name || 'Anonymous'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex justify-center gap-2 pt-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLogClimb(route);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/10 text-secondary text-sm font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Log
                        </button>
                        <button
                          onClick={(e) => handleShareRoute(route, e)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm9-6.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm0 13.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-4.243-11.121l3.486 1.743m-3.486 5.006l3.486-1.743" />
                          </svg>
                          Share
                        </button>
                        {canEditRoute(route) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditRoute(route);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-500 text-sm font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                            Edit
                          </button>
                        )}
                        {canDeleteRoute(route) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteRoute(route);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-sm font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Desktop Routes List */}
      <div className="hidden md:block">
        <div className="divide-y divide-border/50">
          {routes.map((route, index) => {
            const ascents = route.ascents || [];
            const avgRating = ascents.length > 0
              ? ascents.reduce((sum, a) => sum + (a.rating || 0), 0) / ascents.filter(a => a.rating).length || route.rating || 0
              : route.rating || 0;
            const displayGrade = calculateDisplayGrade(route.grade_v, ascents);
            const isExpanded = flippedCards.has(route.id);

            const wall = getWallById(route.wall_id);
            const wallImage = route.wall_image_url || wall?.image_url || DEFAULT_WALL.image_url;
            const wallName = wall?.name || 'Unknown wall';

            return (
              <motion.div
                key={route.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.03 }}
                className="group relative"
              >
                {/* Feathered hover background */}
                <div className={cn(
                  "absolute inset-0 -mx-2 rounded-xl transition-all duration-300 ease-out",
                  isExpanded ? "bg-muted/30" : "bg-muted/0 group-hover:bg-muted/50"
                )} />

                <div
                  onClick={() => onViewRoute(route)}
                  className="relative flex items-center gap-6 py-4 px-2 cursor-pointer"
                >
                  {/* Grade */}
                  <div className="w-14 shrink-0">
                    <span className={cn(
                      "text-lg font-bold",
                      displayGrade ? "text-primary" : "text-muted-foreground"
                    )}>
                      {displayGrade || '—'}
                    </span>
                  </div>

                  {/* Wall thumbnail */}
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
                    <Image
                      src={wallImage}
                      alt={wallName}
                      fill
                      className="object-cover"
                    />
                  </div>

                  {/* Route Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {route.name}
                    </h3>
                    <div className="flex items-center gap-4 mt-0.5 text-sm text-muted-foreground">
                      <span>{route.user_name || 'Anonymous'}</span>
                      <span className="truncate text-xs">{wallName}</span>
                      <span className="flex items-center gap-1">
                        <div className="flex gap-0.5">
                          {route.holds.slice(0, 4).map((hold, i) => (
                            <div
                              key={i}
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: HOLD_COLORS[hold.type] }}
                            />
                          ))}
                        </div>
                        {route.holds.length}
                      </span>
                      {avgRating > 0 && <StarRating rating={Math.round(avgRating)} />}
                      {ascents.length > 0 && (
                        <span>{ascents.length} ascent{ascents.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className={cn(
                    "flex items-center gap-2 transition-opacity duration-200",
                    isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}>
                    <button
                      onClick={(e) => handleToggleLike(route, e)}
                      aria-label="Like route"
                      className={cn(
                        "size-8 rounded-lg flex items-center justify-center transition-colors",
                        isLikedByUser(route.id, userId || 'local-user')
                          ? "text-red-500"
                          : "text-muted-foreground hover:text-red-500"
                      )}
                    >
                      <svg
                        className="w-4 h-4"
                        fill={isLikedByUser(route.id, userId || 'local-user') ? "currentColor" : "none"}
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLogClimb(route);
                      }}
                      aria-label="Log climb"
                      className={cn(
                        "size-8 rounded-lg flex items-center justify-center transition-colors",
                        hasUserClimbed(route.id, userId || 'local-user')
                          ? "text-secondary"
                          : "text-muted-foreground hover:text-secondary"
                      )}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => handleShareRoute(route, e)}
                      aria-label="Share route"
                      className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 12a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm9-6.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm0 13.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-4.243-11.121l3.486 1.743m-3.486 5.006l3.486-1.743" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => toggleCardFlip(route.id, e)}
                      aria-label="View info"
                      className={cn(
                        "size-8 rounded-lg flex items-center justify-center transition-colors",
                        isExpanded
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-primary"
                      )}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                      </svg>
                    </button>
                    {canEditRoute(route) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditRoute(route);
                        }}
                        aria-label="Edit route"
                        className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-blue-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                    )}
                    {canDeleteRoute(route) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRoute(route);
                        }}
                        aria-label="Delete route"
                        className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Chevron */}
                  <svg
                    className={cn(
                      "w-4 h-4 transition-all",
                      isExpanded
                        ? "text-primary rotate-90"
                        : "text-muted-foreground/50 group-hover:text-muted-foreground"
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>

                {/* Expanded Info Panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="relative overflow-hidden"
                    >
                      <div className="px-2 pb-4 pt-2">
                        <div className="flex gap-6 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Grade</p>
                            <p className="font-bold text-primary">{displayGrade || 'Ungraded'}</p>
                            {route.grade_v && displayGrade !== route.grade_v && (
                              <p className="text-xs text-muted-foreground">Setter: {route.grade_v}</p>
                            )}
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Rating</p>
                            <div className="flex items-center gap-1.5">
                              <StarRating rating={Math.round(avgRating)} />
                              {avgRating > 0 && <span className="text-sm font-medium">{avgRating.toFixed(1)}</span>}
                            </div>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Setter</p>
                            <p className="font-medium">{route.user_name || 'Anonymous'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Sends</p>
                            <p className="font-bold">{ascents.length}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Likes</p>
                            <p className="font-bold text-red-500">{getLikeCount(route.id)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Views</p>
                            <p className="font-bold">{route.view_count || 0}</p>
                          </div>
                          {ascents.length > 0 && (
                            <div className="flex-1">
                              <p className="text-muted-foreground text-xs mb-1">Recent climbers</p>
                              <div className="flex flex-wrap gap-1.5">
                                {ascents.slice(0, 5).map((a, i) => (
                                  <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">
                                    {a.user_name || 'Anonymous'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </>
  );
}
