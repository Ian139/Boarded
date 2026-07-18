import { useEffect, useMemo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { calculateDisplayGrade, gradeToNumber } from '@climbset/shared';
import { AppScreen, Button, Card, IconButton, InlineNotice, TopBar } from '../../components/ui';
import { useRoutesStore } from '../../lib/stores/routes-store';
import { useUserStore } from '../../lib/stores/user-store';
import { useTheme } from '../../lib/theme';

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}><Text style={{ fontSize: 20, fontWeight: '700', color }}>{value}</Text><Text style={{ color: `${color}bb`, fontSize: 11, marginTop: 4 }}>{label}</Text></View>;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { routes, fetchRoutes } = useRoutesStore();
  const { user, profile, isAuthenticated, isProfileSyncing, profileSyncError, lastProfileSyncAt, syncProfile } = useUserStore();

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);
  useEffect(() => { if (isAuthenticated) syncProfile(); }, [isAuthenticated, syncProfile]);

  const stats = useMemo(() => {
    const currentUserId = user?.id || 'local-user';
    const created = routes.filter((route) => route.user_id === currentUserId);
    const ascents = routes.flatMap((route) => (route.ascents || []).filter((ascent) => ascent.user_id === currentUserId || (!ascent.user_id && currentUserId === 'local-user')));
    const flashed = ascents.filter((ascent) => ascent.flashed).length;
    const grades: Record<string, number> = {};
    ascents.forEach((ascent) => {
      const route = routes.find((candidate) => candidate.id === ascent.route_id);
      const grade = route ? calculateDisplayGrade(route.grade_v, route.ascents) : undefined;
      if (grade) grades[grade] = (grades[grade] || 0) + 1;
    });
    const activity = ascents
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map((ascent) => {
        const route = routes.find((candidate) => candidate.id === ascent.route_id);
        const grade = route ? calculateDisplayGrade(route.grade_v, route.ascents) : undefined;
        return { ascent, route, grade };
      });
    const sortedGrades = Object.entries(grades).sort((a, b) => gradeToNumber(a[0]) - gradeToNumber(b[0]));
    const createdStats = created.map((route) => {
      const ratings = (route.ascents || []).map((ascent) => ascent.rating).filter((rating): rating is number => typeof rating === 'number');
      return { route, likes: route.liked_by?.length ?? route.like_count ?? 0, views: route.view_count || 0, rating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : route.rating || 0 };
    });
    const topLiked = createdStats.slice().sort((a, b) => b.likes - a.likes)[0];
    const topViewed = createdStats.slice().sort((a, b) => b.views - a.views)[0];
    const highest = ascents.map((ascent) => routes.find((route) => route.id === ascent.route_id)).map((route) => route ? calculateDisplayGrade(route.grade_v, route.ascents) : undefined).filter((grade): grade is string => Boolean(grade)).sort((a, b) => gradeToNumber(b) - gradeToNumber(a))[0];
    return { created, ascents, flashed, grades: sortedGrades, maxGradeCount: Math.max(1, ...Object.values(grades)), activity, highest, totalLikes: createdStats.reduce((sum, value) => sum + value.likes, 0), avgRating: createdStats.length ? createdStats.reduce((sum, value) => sum + value.rating, 0) / createdStats.length : 0, topLiked: topLiked?.route, topViewed: topViewed?.route };
  }, [routes, user?.id]);

  const displayName = profile?.full_name || user?.displayName || 'Climber';
  return (
    <AppScreen testID="profile-screen" accessibilityLabel="Profile" scroll contentStyle={{ paddingBottom: 36 }}>
      <TopBar title="Profile" action={<IconButton label="Open settings" icon="⚙" testID="open-settings-button" onPress={() => router.push('/settings')} />} />
      {isProfileSyncing || profileSyncError ? <InlineNotice tone={profileSyncError ? 'error' : 'info'} message={isProfileSyncing ? 'Syncing profile…' : profileSyncError || 'Profile sync failed'} /> : null}
      {profileSyncError ? <Button label="Retry profile sync" variant="outline" onPress={syncProfile} style={{ marginTop: 8 }} /> : null}

      <Card style={{ marginTop: 12, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 68, height: 68, borderRadius: 34, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inputFill }}>
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} accessibilityLabel="Profile avatar" alt="Profile avatar" style={{ width: 68, height: 68 }} /> : <Text style={{ color: colors.primary, fontSize: 26, fontWeight: '700' }}>{displayName.slice(0, 1).toUpperCase()}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700', fontSize: 19 }}>{displayName}</Text>
            <Text style={{ color: colors.textMuted, marginTop: 2 }}>{profile?.username ? `@${profile.username}` : 'Guest climber'}</Text>
            {user?.email ? <Text style={{ color: colors.textMuted, marginTop: 2 }}>{user.email}</Text> : null}
            {user?.createdAt ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text> : null}
          </View>
        </View>
        {profile?.bio ? <Text style={{ color: colors.textMuted, marginTop: 12 }}>{profile.bio}</Text> : null}
        {lastProfileSyncAt ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>Profile synced {formatShortDate(lastProfileSyncAt)}</Text> : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><Card style={{ flex: 1 }}><Stat label="Sends" value={stats.ascents.length} color={colors.primary} /></Card><Card style={{ flex: 1 }}><Stat label="Flash rate" value={stats.ascents.length ? `${Math.round((stats.flashed / stats.ascents.length) * 100)}%` : '—'} color={colors.text} /></Card><Card style={{ flex: 1 }}><Stat label="Routes set" value={stats.created.length} color={colors.text} /></Card></View>

      {stats.highest ? <Card style={{ marginTop: 14, padding: 16 }}><Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Highest grade</Text><Text style={{ color: colors.primary, fontSize: 30, fontWeight: '800', marginTop: 6 }}>{stats.highest}</Text></Card> : null}

      {stats.created.length ? <Card style={{ marginTop: 14, padding: 16 }}><Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Setter analytics</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><Stat label="Total likes" value={stats.totalLikes} color={colors.text} /><Stat label="Avg rating" value={stats.avgRating ? stats.avgRating.toFixed(1) : '—'} color={colors.text} /></View><Text style={{ color: colors.textMuted, marginTop: 8 }}>Most liked: {stats.topLiked?.name || '—'}</Text><Text style={{ color: colors.textMuted, marginTop: 4 }}>Most viewed: {stats.topViewed?.name || '—'}</Text></Card> : null}

      {stats.grades.length ? <Card style={{ marginTop: 14, padding: 16 }}><Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Grade pyramid</Text>{stats.grades.map(([grade, count]) => <View key={grade} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}><Text style={{ width: 30, color: colors.text }}>{grade}</Text><View style={{ flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.inputFill }}><View style={{ width: `${(count / stats.maxGradeCount) * 100}%`, height: 10, backgroundColor: colors.primary }} /></View><Text style={{ width: 24, textAlign: 'right', color: colors.textMuted }}>{count}</Text></View>)}</Card> : null}

      {stats.activity.length ? <Card style={{ marginTop: 14, padding: 6 }}><Text style={{ color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, padding: 10 }}>Recent activity</Text>{stats.activity.map(({ ascent, route, grade }, index) => <Pressable key={ascent.id} accessibilityRole="button" accessibilityLabel={`View ${route?.name || 'route'}`} onPress={() => router.push({ pathname: '/(tabs)', params: { routeId: route?.id } })} style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: index ? 1 : 0, borderTopColor: colors.border }}><Text style={{ width: 32, color: ascent.flashed ? colors.accent : colors.primary, fontSize: 18 }}>{ascent.flashed ? '⚡' : '✓'}</Text><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>{route?.name || 'Unknown route'}{grade ? ` · ${grade}` : ''}</Text><Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>{ascent.flashed ? 'Flashed' : 'Sent'}{ascent.grade_v && ascent.grade_v !== grade ? ` · You: ${ascent.grade_v}` : ''} · {formatShortDate(ascent.created_at)}</Text></View><Text style={{ color: colors.textMuted }}>›</Text></Pressable>)}</Card> : null}

      {!stats.ascents.length ? <View style={{ alignItems: 'center', paddingVertical: 30 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>No climbing activity yet</Text><Text style={{ color: colors.textMuted, marginTop: 6, textAlign: 'center' }}>Start logging your sends to build your profile.</Text><Button label="Browse routes" onPress={() => router.push('/(tabs)')} style={{ marginTop: 14 }} /></View> : null}
      <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 11, marginTop: 24 }}>ClimbSet v2.1.9</Text>
    </AppScreen>
  );
}
