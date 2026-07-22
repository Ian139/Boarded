'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useUserStore } from '@/lib/stores/user-store';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { cn } from '@/lib/utils';
import { useIsClient } from '@/lib/hooks/useIsClient';
import { gradeToNumber, calculateDisplayGrade } from '@climbset/shared/utils/grades';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user, displayName, userId, isAuthenticated, profile, syncProfile, uploadAvatar } = useUserStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const { routes, fetchRoutes } = useRoutesStore();
  const isClient = useIsClient();

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  useEffect(() => {
    if (isAuthenticated) {
      syncProfile();
    }
  }, [isAuthenticated, syncProfile]);

  const handleAvatarSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || isUploadingAvatar) return;

    setIsUploadingAvatar(true);
    try {
      const avatarUrl = await uploadAvatar(file);
      if (avatarUrl) {
        toast.success('Avatar updated');
      } else {
        toast.error('Unable to update avatar. Please try again.');
      }
    } catch {
      toast.error('Unable to update avatar. Please try again.');
    } finally {
      input.value = '';
      setIsUploadingAvatar(false);
    }
  };

  const stats = useMemo(() => {
    const currentUserId = userId || 'local-user';

    const userRoutes = routes.filter(r => r.user_id === currentUserId);
    const userRouteStats = userRoutes.map((r) => {
      const ascents = r.ascents || [];
      const ratings = ascents.filter(a => a.rating).map(a => a.rating as number);
      const avgRating = ratings.length > 0
        ? ratings.reduce((sum, v) => sum + v, 0) / ratings.length
        : r.rating || 0;
      return {
        route: r,
        likeCount: r.liked_by?.length || r.like_count || 0,
        viewCount: r.view_count || 0,
        avgRating,
      };
    });

    const userAscents = routes.flatMap(r =>
      (r.ascents || []).filter(a => a.user_id === currentUserId)
    );

    const flashedAscents = userAscents.filter(a => a.flashed);
    const flashRate = userAscents.length > 0
      ? (flashedAscents.length / userAscents.length) * 100
      : 0;

    const gradeDistribution: Record<string, number> = {};
    userAscents.forEach(a => {
      const route = routes.find(r => r.id === a.route_id);
      const displayGrade = route ? calculateDisplayGrade(route.grade_v, route.ascents) : undefined;
      if (displayGrade) {
        gradeDistribution[displayGrade] = (gradeDistribution[displayGrade] || 0) + 1;
      }
    });

    const sortedGrades = Object.entries(gradeDistribution)
      .sort((a, b) => gradeToNumber(a[0]) - gradeToNumber(b[0]));
    const maxCount = Math.max(...Object.values(gradeDistribution), 1);

    const recentActivity = userAscents
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(ascent => {
        const route = routes.find(r => r.id === ascent.route_id);
        const displayGrade = route ? calculateDisplayGrade(route.grade_v, route.ascents) : undefined;
        return {
          ...ascent,
          routeName: route?.name || 'Unknown Route',
          routeGrade: displayGrade,
          userGrade: ascent.grade_v,
        };
      });

    const highestGrade = userAscents
      .map(a => {
        const route = routes.find(r => r.id === a.route_id);
        return route ? calculateDisplayGrade(route.grade_v, route.ascents) : undefined;
      })
      .filter(Boolean)
      .sort((a, b) => gradeToNumber(b) - gradeToNumber(a))[0];

    const totalLikes = userRouteStats.reduce((sum, r) => sum + r.likeCount, 0);
    const avgRouteRating = userRouteStats.length > 0
      ? userRouteStats.reduce((sum, r) => sum + r.avgRating, 0) / userRouteStats.length
      : 0;
    const topLikedRoute = userRouteStats.reduce((top, current) =>
      !top || current.likeCount > top.likeCount ? current : top
    , null as null | { route: typeof userRoutes[number]; likeCount: number; viewCount: number; avgRating: number })?.route;
    const topViewedRoute = userRouteStats.reduce((top, current) =>
      !top || current.viewCount > top.viewCount ? current : top
    , null as null | { route: typeof userRoutes[number]; likeCount: number; viewCount: number; avgRating: number })?.route;

    return {
      totalSends: userAscents.length,
      flashCount: flashedAscents.length,
      flashRate,
      routesCreated: userRoutes.length,
      gradeDistribution: sortedGrades,
      maxCount,
      recentActivity,
      highestGrade,
      totalLikes,
      avgRouteRating,
      topLikedRoute,
      topViewedRoute,
    };
  }, [routes, userId]);

  if (!isClient) return null;

  return (
    <div className="app-shell min-h-dvh pb-28">
      {/* Header */}
      <header className="page-header px-6 pt-5 pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Back to home"
              className="size-10 rounded-xl bg-card/60 backdrop-blur-xl border border-border/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-foreground">Profile</h1>
          </div>

          <Link
            href="/settings"
            aria-label="Settings"
            className="size-10 rounded-xl bg-card/60 backdrop-blur-xl border border-border/20 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="page-frame px-6 py-8 space-y-8">
        {/* User Info Card */}
        <section className="bg-card/60 backdrop-blur-xl border border-border/20 rounded-2xl p-5 shadow-lg flex items-center gap-4">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-border/40 shrink-0">
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={displayName}
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-primary">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground truncate">{displayName}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {isAuthenticated ? user?.email : 'Guest climber'}
            </p>
            {profile?.username && (
              <p className="text-xs text-muted-foreground mt-0.5">@{profile.username}</p>
            )}
            {user?.createdAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Member since {new Date(user.createdAt).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
            {profile?.bio && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{profile.bio}</p>
            )}
            {isAuthenticated && (
              <div className="mt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelect}
                  disabled={isUploadingAvatar}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  aria-busy={isUploadingAvatar}
                  className="text-xs font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUploadingAvatar ? 'Uploading...' : 'Change avatar'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Flighty-Style Grouped Overview Stats */}
        <section className="bg-card/60 backdrop-blur-xl border border-border/20 rounded-2xl overflow-hidden shadow-lg">
          <div className="grid grid-cols-4 divide-x divide-border/10">
            <div className="py-4 px-3 text-center">
              <p className="text-2xl font-bold text-primary">{stats.totalSends}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Sends</p>
            </div>
            <div className="py-4 px-3 text-center">
              <p className="text-2xl font-bold text-foreground">
                {stats.flashRate > 0 ? `${Math.round(stats.flashRate)}%` : '—'}
              </p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Flash Rate</p>
            </div>
            <div className="py-4 px-3 text-center">
              <p className="text-2xl font-bold text-foreground">{stats.routesCreated}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Routes Set</p>
            </div>
            <div className="py-4 px-3 text-center">
              <p className="text-2xl font-bold text-primary">{stats.highestGrade || '—'}</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">Best Grade</p>
            </div>
          </div>
        </section>

        {/* Setter Analytics Grouped Panel */}
        {stats.routesCreated > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Setter Analytics
            </h3>
            <div className="bg-card/60 backdrop-blur-xl border border-border/20 rounded-2xl overflow-hidden shadow-lg divide-y divide-border/10">
              <div className="grid grid-cols-2 divide-x divide-border/10">
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Total Likes</p>
                  <p className="text-xl font-bold text-foreground mt-1">{stats.totalLikes}</p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Avg Rating</p>
                  <p className="text-xl font-bold text-foreground mt-1">
                    {stats.avgRouteRating > 0 ? stats.avgRouteRating.toFixed(1) : '—'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/10">
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Most Liked</p>
                  <p className="text-sm font-semibold text-foreground truncate mt-1">
                    {stats.topLikedRoute?.name || '—'}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Most Viewed</p>
                  <p className="text-sm font-semibold text-foreground truncate mt-1">
                    {stats.topViewedRoute?.name || '—'}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Grade Pyramid Grouped Panel */}
        {stats.gradeDistribution.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Grade Pyramid
            </h3>
            <div className="bg-card/60 backdrop-blur-xl border border-border/20 rounded-2xl p-4 shadow-lg">
              <div className="space-y-2.5">
                {stats.gradeDistribution.map(([grade, count]) => (
                  <div key={grade} className="flex items-center gap-3">
                    <span className="w-8 text-sm font-semibold text-muted-foreground">{grade}</span>
                    <div className="flex-1 h-4 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${(count / stats.maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-sm font-semibold text-right text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Recent Activity Grouped Panel */}
        {stats.recentActivity.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Recent Activity
            </h3>
            <div className="bg-card/60 backdrop-blur-xl border border-border/20 rounded-2xl overflow-hidden shadow-lg divide-y divide-border/10">
              {stats.recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  <div className={cn(
                    "size-8 rounded-xl flex items-center justify-center shrink-0 border border-border/10",
                    activity.flashed ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground"
                  )}>
                    {activity.flashed ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate text-foreground">
                        {activity.routeName}
                      </p>
                      {activity.routeGrade && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                          {activity.routeGrade}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activity.flashed ? 'Flashed' : 'Sent'}
                      {activity.userGrade && activity.userGrade !== activity.routeGrade && (
                        <span> • Logged as {activity.userGrade}</span>
                      )}
                      {' • '}{new Date(activity.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {stats.totalSends === 0 && stats.routesCreated === 0 && (
          <section className="bg-card/60 backdrop-blur-xl border border-border/20 rounded-2xl text-center py-12 px-6 shadow-lg">
            <div className="size-16 rounded-full bg-muted/40 mx-auto mb-4 flex items-center justify-center border border-border/10">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-foreground mb-1">No climbing activity yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Start logging your sends to build your profile</p>
            <Link
              href="/"
              className="inline-flex items-center justify-center h-10 px-6 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              Browse Routes
            </Link>
          </section>
        )}

        {/* App Info */}
        <section className="pt-4 pb-4 text-center">
          <p className="text-xs text-muted-foreground font-medium">Boarded v0.1.2</p>
        </section>
      </main>
    </div>
  );
}
