import { useMemo, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { calculateDisplayGrade, gradeToNumber, type Route } from '@climbset/shared';
import { useRoutesStore } from '../../lib/stores/routes-store';
import { useUserStore } from '../../lib/stores/user-store';
import { colors } from '../../lib/theme';

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function StatBox({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 16, paddingVertical: 14, backgroundColor: colors.card, alignItems: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: tone || colors.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { routes, fetchRoutes } = useRoutesStore();
  const {
    user,
    profile,
    isAuthenticated,
    isProfileSyncing,
    profileSyncError,
    lastProfileSyncAt,
    syncProfile,
  } = useUserStore();

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  useEffect(() => {
    if (isAuthenticated) {
      syncProfile();
    }
  }, [isAuthenticated, syncProfile]);

  const stats = useMemo(() => {
    const currentUserId = user?.id || 'local-user';

    const userRoutes = routes.filter((r) => r.user_id === currentUserId);
    const userRouteStats = userRoutes.map((r) => {
      const ascents = r.ascents || [];
      const ratings = ascents.filter((a) => a.rating).map((a) => a.rating as number);
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

    const userAscents = routes.flatMap((r) => {
      return (r.ascents || []).filter((a) => {
        if (!a.user_id && currentUserId === 'local-user') return true;
        return a.user_id === currentUserId;
      });
    });

    const flashedAscents = userAscents.filter((a) => a.flashed);
    const flashRate = userAscents.length > 0
      ? (flashedAscents.length / userAscents.length) * 100
      : 0;

    const gradeDistribution: Record<string, number> = {};
    userAscents.forEach((a) => {
      const route = routes.find((r) => r.id === a.route_id);
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
      .map((ascent) => {
        const route = routes.find((r) => r.id === ascent.route_id);
        const displayGrade = route ? calculateDisplayGrade(route.grade_v, route.ascents) : undefined;
        return {
          ...ascent,
          routeName: route?.name || 'Unknown Route',
          routeGrade: displayGrade,
          userGrade: ascent.grade_v,
        };
      });

    const highestGrade = userAscents
      .map((a) => {
        const route = routes.find((r) => r.id === a.route_id);
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
    , null as null | { route: Route; likeCount: number; viewCount: number; avgRating: number })?.route;
    const topViewedRoute = userRouteStats.reduce((top, current) =>
      !top || current.viewCount > top.viewCount ? current : top
    , null as null | { route: Route; likeCount: number; viewCount: number; avgRating: number })?.route;

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
  }, [routes, user?.id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>Profile</Text>
          <Pressable
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.card }}
            onPress={() => router.push('/settings')}
          >
            <Text style={{ fontSize: 13, color: colors.text }}>Settings</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {(isProfileSyncing || profileSyncError) ? (
            <View style={{ borderRadius: 12, backgroundColor: colors.card, padding: 12, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {isProfileSyncing ? 'Syncing profile...' : profileSyncError || 'Profile sync failed'}
              </Text>
              {!isProfileSyncing ? (
                <Pressable
                  style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
                  onPress={syncProfile}
                >
                  <Text style={{ fontSize: 12, color: colors.card, fontWeight: '600' }}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.secondary}1f`, overflow: 'hidden' }}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={{ width: 64, height: 64 }} />
              ) : (
                <Text style={{ fontSize: 26 }}>🧗</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
                {profile?.full_name || user?.displayName || 'Climber'}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {profile?.username ? `@${profile.username}` : 'Guest climber'}
              </Text>
              {user?.email ? (
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{user.email}</Text>
              ) : null}
              {user?.createdAt ? (
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                  Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
              ) : null}
              {profile?.bio ? (
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }} numberOfLines={2}>{profile.bio}</Text>
              ) : null}
              {lastProfileSyncAt ? (
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                  Synced {getTimeAgo(lastProfileSyncAt)}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <StatBox label="Sends" value={stats.totalSends} tone={colors.primary} />
            <StatBox label="Flash Rate" value={stats.flashRate > 0 ? `${Math.round(stats.flashRate)}%` : '—'} />
            <StatBox label="Routes Set" value={stats.routesCreated} />
          </View>
        </View>

        {stats.highestGrade ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <SectionTitle>Highest Grade</SectionTitle>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.primary }}>{stats.highestGrade}</Text>
          </View>
        ) : null}

        {stats.routesCreated > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
            <SectionTitle>Setter Analytics</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <StatBox label="Total Likes" value={stats.totalLikes} />
              <StatBox label="Avg Rating" value={stats.avgRouteRating > 0 ? stats.avgRouteRating.toFixed(1) : '—'} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StatBox label="Most Liked" value={stats.topLikedRoute?.name || '—'} />
              <StatBox label="Most Viewed" value={stats.topViewedRoute?.name || '—'} />
            </View>
          </View>
        ) : null}

        {stats.gradeDistribution.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
            <SectionTitle>Grade Pyramid</SectionTitle>
            <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 12 }}>
              {stats.gradeDistribution.map(([grade, count], idx) => (
                <View key={grade} style={{ marginBottom: idx === stats.gradeDistribution.length - 1 ? 0 : 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 32, fontSize: 13, color: colors.muted }}>{grade}</Text>
                    <View style={{ flex: 1, height: 10, backgroundColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                      <View
                        style={{
                          height: 10,
                          width: `${(count / stats.maxCount) * 100}%`,
                          backgroundColor: `${colors.primary}cc`,
                          borderRadius: 8,
                        }}
                      />
                    </View>
                    <Text style={{ width: 24, textAlign: 'right', fontSize: 12, color: colors.text }}>{count}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {stats.recentActivity.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
            <SectionTitle>Recent Activity</SectionTitle>
            <View style={{ backgroundColor: colors.card, borderRadius: 16 }}>
              {stats.recentActivity.map((activity, idx) => (
                <Pressable
                  key={activity.id}
                  onPress={() => router.push('/(tabs)')}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: idx === stats.recentActivity.length - 1 ? 0 : 1,
                    borderBottomColor: `${colors.border}99`,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: activity.flashed ? `${colors.accent}22` : `${colors.border}99`,
                  }}>
                    <Text style={{ fontSize: 14 }}>{activity.flashed ? '⚡' : '✓'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                      {activity.routeName}
                      {activity.routeGrade ? ` ${activity.routeGrade}` : ''}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      {activity.flashed ? 'Flashed' : 'Sent'}
                      {activity.userGrade && activity.userGrade !== activity.routeGrade ? ` • You: ${activity.userGrade}` : ''}
                      {` • ${formatShortDate(activity.created_at)}`}
                    </Text>
                    {activity.rating ? (
                      <View style={{ flexDirection: 'row', gap: 2, marginTop: 3 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Text key={n} style={{ fontSize: 12, color: n <= activity.rating! ? colors.accent : colors.border }}>★</Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 16, color: colors.muted }}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {stats.totalSends === 0 && stats.routesCreated === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 24, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24 }}>🧗</Text>
            </View>
            <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: colors.text }}>No climbing activity yet</Text>
            <Text style={{ marginTop: 6, fontSize: 12, color: colors.muted, textAlign: 'center' }}>
              Start logging your sends to build your profile
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)')}
              style={{ marginTop: 12, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 8 }}
            >
              <Text style={{ color: colors.card, fontWeight: '600' }}>Browse Routes</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={{ paddingHorizontal: 16, paddingTop: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>ClimbSet v2.1.9</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
