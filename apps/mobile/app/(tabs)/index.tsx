import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Image,
  Share,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { nanoid } from 'nanoid/non-secure';
import {
  HOLD_COLORS,
  type Route,
  type Hold,
} from '@climbset/shared';
import { calculateDisplayGrade } from '@climbset/shared';
import { useRoutesStore } from '../../lib/stores/routes-store';
import { useWallsStore } from '../../lib/stores/walls-store';
import { useUserStore } from '../../lib/stores/user-store';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';

function HoldDots({ holds }: { holds: Hold[] }) {
  const typeCounts: Record<string, number> = {};
  holds.forEach((h) => { typeCounts[h.type] = (typeCounts[h.type] || 0) + 1; });
  return (
    <View className="flex-row items-center gap-1.5">
      {Object.entries(typeCounts).map(([type, count]) => (
        <View key={type} className="flex-row items-center gap-0.5">
          <View style={{ backgroundColor: HOLD_COLORS[type as keyof typeof HOLD_COLORS], width: 6, height: 6, borderRadius: 3 }} />
          <Text style={{ fontSize: 10, color: colors.muted }}>{count}</Text>
        </View>
      ))}
    </View>
  );
}

function RouteRow({
  route,
  wallName,
  wallImage,
  now,
  onPress,
  onLike,
  onLog,
  onShare,
  onExpand,
  isExpanded,
}: {
  route: Route;
  wallName?: string;
  wallImage?: string;
  now: number;
  onPress: () => void;
  onLike?: (route: Route) => void;
  onLog?: (route: Route) => void;
  onShare?: (route: Route) => void;
  onExpand?: () => void;
  isExpanded?: boolean;
}) {
  const displayGrade = calculateDisplayGrade(route.grade_v, route.ascents);
  const sendCount = route.ascents?.length || 0;
  const timeAgo = getTimeAgo(route.created_at, now);
  const meta = `${route.user_name || 'Setter'}${wallName ? ` • ${wallName}` : ''}`;
  const metrics = `${route.like_count || 0} likes${sendCount > 0 ? ` • ${sendCount} ${sendCount === 1 ? 'send' : 'sends'}` : ''}`;
  const ascents = route.ascents || [];
  const avgRating = ascents.length > 0
    ? ascents.reduce((sum, a) => sum + (a.rating || 0), 0) / ascents.filter(a => a.rating).length || route.rating || 0
    : route.rating || 0;

  const isLiked = route.is_liked || false;
  const hasClimbed = route.ascents?.some((a) => a.user_id === route.user_id) || false;
  const likeCount = route.liked_by?.length || route.like_count || 0;
  const recentClimbers = route.ascents?.slice(0, 4) || [];

  return (
    <View>
      <Pressable
        style={{
          paddingVertical: 14,
          paddingHorizontal: 4,
          borderRadius: 16,
          backgroundColor: 'transparent',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
        className="active:opacity-60"
        onPress={onPress}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', marginRight: 12, backgroundColor: colors.border }}>
            {wallImage ? (
              <Image source={{ uri: wallImage }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.muted, fontSize: 10 }}>Wall</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                {route.name}
              </Text>
              {displayGrade && (
                <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: `${colors.primary}1a` }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{displayGrade}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }} numberOfLines={1}>
              {meta}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <HoldDots holds={route.holds} />
              <Text style={{ fontSize: 11, color: `${colors.muted}80` }} numberOfLines={1}>
                {metrics}
              </Text>
            </View>
            <Text style={{ fontSize: 10, color: `${colors.muted}60`, marginTop: 6 }}>{timeAgo}</Text>
          </View>
        </View>

        {/* Action Buttons Row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: `${colors.border}66` }}>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); onLike?.(route); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 }}
            className="active:opacity-50"
          >
            <Text style={{ fontSize: 14, color: isLiked ? '#ef4444' : colors.muted }}>
              {isLiked ? '\u2665' : '\u2661'}
            </Text>
            {likeCount > 0 && (
              <Text style={{ fontSize: 11, color: isLiked ? '#ef4444' : colors.muted }}>{likeCount}</Text>
            )}
          </Pressable>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); onLog?.(route); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 }}
            className="active:opacity-50"
          >
            <Text style={{ fontSize: 14, color: hasClimbed ? colors.secondary : colors.muted }}>
              {hasClimbed ? '\u2713' : '\u25CB'} Log
            </Text>
          </Pressable>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); onShare?.(route); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 }}
            className="active:opacity-50"
          >
            <Text style={{ fontSize: 14, color: colors.muted }}>{'\u2197'}</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>Share</Text>
          </Pressable>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); onExpand?.(); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 }}
            className="active:opacity-50"
          >
            <Text style={{ fontSize: 14, color: colors.muted, transform: isExpanded ? [{ rotate: '180deg' }] : [] }}>{'\u25BC'}</Text>
          </Pressable>
        </View>
      </Pressable>

      {/* Expanded Info Panel */}
      {isExpanded && (
        <View style={{
          marginHorizontal: 4,
          marginBottom: 10,
          padding: 14,
          borderRadius: 14,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: colors.muted }}>GRADE</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary, marginTop: 2 }}>{displayGrade || '—'}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: colors.muted }}>RATING</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 }}>
                {avgRating > 0 ? avgRating.toFixed(1) : '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: colors.muted }}>SENDS</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 }}>{ascents.length}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: colors.muted }}>LIKES</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 }}>{likeCount}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: colors.muted }}>VIEWS</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 2 }}>{route.view_count || 0}</Text>
            </View>
          </View>

          {/* Recent climbers */}
          {recentClimbers.length > 0 && (
            <View style={{ marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 10, color: colors.muted, marginBottom: 6 }}>RECENT CLIMBERS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {recentClimbers.map((a, i) => (
                  <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: `${colors.muted}1a` }}>
                    <Text style={{ fontSize: 11, color: colors.text }}>{a.user_name || 'Anonymous'}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onLog?.(route); }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: `${colors.secondary}14`, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.secondary }}>Log</Text>
            </Pressable>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onShare?.(route); }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: `${colors.primary}14`, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>Share</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function getTimeAgo(dateStr: string, now: number): string {
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const {
    routes,
    isLoading,
    isOfflineMode,
    fetchRoutes,
    toggleLike,
    addAscent,
    updateRoute,
    deleteRoute,
    addComment,
    updateComment,
    deleteComment,
    refreshRouteComments,
  } = useRoutesStore();
  const { fetchWalls, getWallById, walls, selectedWall, setSelectedWall } = useWallsStore();
  const { user, profile } = useUserStore();
  const [sortBy, setSortBy] = useState<'newest' | 'highest-rated' | 'most-liked' | 'most-climbed'>('newest');
  const [minGrade, setMinGrade] = useState<number | null>(null);
  const [maxGrade, setMaxGrade] = useState<number | null>(null);
  const [setterFilter, setSetterFilter] = useState<string>('all');
  const [activeFilterMenu, setActiveFilterMenu] = useState<null | 'wall' | 'sort' | 'minGrade' | 'maxGrade' | 'setter'>(null);
  const [routeToViewId, setRouteToViewId] = useState<string | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logRating, setLogRating] = useState<number | null>(null);
  const [logFlashed, setLogFlashed] = useState(false);
  const [logNote, setLogNote] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentIsBeta, setCommentIsBeta] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingIsBeta, setEditingIsBeta] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetchRoutes();
    fetchWalls();
  }, [fetchRoutes, fetchWalls]);

  const onRefresh = async () => {
    setRefreshing(true);
    setNow(Date.now());
    await fetchRoutes();
    await fetchWalls();
    setRefreshing(false);
  };

  const activeWallId = selectedWall?.id || 'all-walls';
  const availableSetters = useMemo(() => {
    const names = Array.from(new Set(routes.map((r) => (r.user_name || '').trim()).filter(Boolean)));
    return names.sort((a, b) => a.localeCompare(b));
  }, [routes]);
  const gradeOptions = useMemo(() => [null, ...Array.from({ length: 13 }, (_, i) => i)], []);

  const parseGradeNumber = (grade?: string | null) => {
    if (!grade) return null;
    const match = grade.toUpperCase().match(/^V(\d+)/);
    if (!match) return null;
    return Number.parseInt(match[1], 10);
  };

  const scopedRoutes = useMemo(() => {
    if (activeWallId === 'all-walls') return routes;
    return routes.filter((r) => r.wall_id === activeWallId);
  }, [routes, activeWallId]);

  const filteredRoutes = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return scopedRoutes.filter((r) => {
      if (searchQuery.trim()) {
        const matchesSearch = r.name.toLowerCase().includes(q)
          || r.grade_v?.toLowerCase().includes(q)
          || r.user_name?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      const gradeNum = parseGradeNumber(r.grade_v);
      if (minGrade !== null && (gradeNum === null || gradeNum < minGrade)) return false;
      if (maxGrade !== null && (gradeNum === null || gradeNum > maxGrade)) return false;
      if (setterFilter !== 'all' && r.user_name !== setterFilter) return false;
      return true;
    });
  }, [scopedRoutes, searchQuery, minGrade, maxGrade, setterFilter]);

  const sortedRoutes = useMemo(() => {
    const next = [...filteredRoutes];
    const averageRating = (route: Route) => {
      const ratings = (route.ascents || [])
        .map((a) => a.rating)
        .filter((r): r is number => typeof r === 'number');
      if (ratings.length === 0) return 0;
      return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    };
    next.sort((a, b) => {
      if (sortBy === 'highest-rated') return averageRating(b) - averageRating(a);
      if (sortBy === 'most-liked') return (b.like_count || 0) - (a.like_count || 0);
      if (sortBy === 'most-climbed') return (b.ascents?.length || 0) - (a.ascents?.length || 0);
      if (sortBy === 'most-viewed') return (b.view_count || 0) - (a.view_count || 0);
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'grade-asc') {
        const ga = a.grade_v ? parseInt(a.grade_v.replace(/\D/g, '')) || 0 : 0;
        const gb = b.grade_v ? parseInt(b.grade_v.replace(/\D/g, '')) || 0 : 0;
        return ga - gb;
      }
      if (sortBy === 'grade-desc') {
        const ga = a.grade_v ? parseInt(a.grade_v.replace(/\D/g, '')) || 0 : 0;
        const gb = b.grade_v ? parseInt(b.grade_v.replace(/\D/g, '')) || 0 : 0;
        return gb - ga;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return next;
  }, [filteredRoutes, sortBy]);

  const routeToView = useMemo(
    () => (routeToViewId ? routes.find((r) => r.id === routeToViewId) || null : null),
    [routes, routeToViewId]
  );

  const formatTimeAgo = (dateStr: string) => {
    const diff = now - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
  };

  const handleShare = async (route: Route) => {
    let token = route.share_token;
    if (!token) {
      token = nanoid(10);
      await updateRoute(route.id, { share_token: token });
      try {
        await supabase.from('routes').update({ share_token: token }).eq('id', route.id);
      } catch {
        // ignore
      }
    }
    const base = process.env.EXPO_PUBLIC_APP_URL || process.env.EXPO_PUBLIC_WEB_URL;
    const url = base ? `${base.replace(/\/$/, '')}/share/${token}` : token;
    try {
      await Share.share({ message: url, url });
    } catch {
      // ignore
    }
  };

  const handleLogSend = async () => {
    if (!routeToViewId) return;
    await addAscent(routeToViewId, {
      id: nanoid(),
      route_id: routeToViewId,
      user_id: user?.id || 'local-user',
      user_name: profile?.full_name || user?.displayName || 'Climber',
      grade_v: routeToView?.grade_v,
      rating: logRating || undefined,
      notes: logNote || undefined,
      flashed: logFlashed,
      created_at: new Date().toISOString(),
    });
    setShowLogModal(false);
    setLogRating(null);
    setLogFlashed(false);
    setLogNote('');
  };

  const handleAddComment = async () => {
    if (!routeToView || !commentText.trim()) return;
    await addComment(routeToView.id, {
      id: nanoid(),
      route_id: routeToView.id,
      user_id: user?.id || 'local-user',
      user_name: profile?.full_name || user?.displayName || 'Climber',
      content: commentText.trim(),
      is_beta: commentIsBeta,
      created_at: new Date().toISOString(),
    });
    setCommentText('');
    setCommentIsBeta(false);
  };

  const startEditComment = (commentId: string, content: string, isBeta: boolean) => {
    setEditingCommentId(commentId);
    setEditingContent(content);
    setEditingIsBeta(isBeta);
  };

  const handleSaveEdit = async () => {
    if (!routeToView || !editingCommentId || !editingContent.trim()) return;
    await updateComment(routeToView.id, editingCommentId, editingContent.trim(), editingIsBeta);
    setEditingCommentId(null);
    setEditingContent('');
    setEditingIsBeta(false);
  };

  const canEditRoute = routeToView
    ? routeToView.user_id === (user?.id || 'local-user') || routeToView.user_id === 'local-user'
    : false;

  const renderStars = (value: number) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text key={n} style={{ color: n <= value ? colors.accent : colors.border, fontSize: 16 }}>★</Text>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>Routes</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {filteredRoutes.length} {filteredRoutes.length === 1 ? 'route' : 'routes'}
          </Text>
        </View>

        {isOfflineMode && (
          <View style={{
            marginTop: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 12,
            backgroundColor: `${colors.secondary}1a`,
            borderWidth: 1,
            borderColor: `${colors.secondary}33`,
          }}>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              Local-only mode. Cloud sync is unavailable.
            </Text>
          </View>
        )}

        <View style={{
          marginTop: 12,
          backgroundColor: colors.card,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
          <Text style={{ color: colors.muted, marginRight: 8, fontSize: 16 }}>{'\u2315'}</Text>
          <TextInput
            style={{ flex: 1, fontSize: 14, color: colors.text }}
            placeholder="Search routes, setters..."
            placeholderTextColor={`${colors.muted}80`}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
          <Text style={{ color: colors.muted, marginRight: 8, fontSize: 16 }}>{'\u2315'}</Text>
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Pressable
            onPress={() => setActiveFilterMenu((prev) => (prev === 'sort' ? null : 'sort'))}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }} numberOfLines={1}>
              Sort: {
                sortBy === 'newest'
                  ? 'Newest'
                  : sortBy === 'oldest'
                    ? 'Oldest'
                    : sortBy === 'name'
                      ? 'Name'
                      : sortBy === 'grade-asc'
                        ? 'Easiest'
                        : sortBy === 'grade-desc'
                          ? 'Hardest'
                          : sortBy === 'highest-rated'
                            ? 'Highest Rated'
                            : sortBy === 'most-liked'
                              ? 'Most Liked'
                              : sortBy === 'most-climbed'
                                ? 'Most Climbed'
                                : 'Most Viewed'
              }
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveFilterMenu((prev) => (prev === 'wall' ? null : 'wall'))}
            style={{
              flex: 1,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }} numberOfLines={1}>
              Wall: {selectedWall?.name || 'All Walls'}
            </Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          <Pressable
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
            onPress={() => setActiveFilterMenu((prev) => (prev === 'minGrade' ? null : 'minGrade'))}
          >
            <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>
              Min: {minGrade === null ? 'Any' : `V${minGrade}`}
            </Text>
          </Pressable>
          <Pressable
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
            onPress={() => setActiveFilterMenu((prev) => (prev === 'maxGrade' ? null : 'maxGrade'))}
          >
            <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>
              Max: {maxGrade === null ? 'Any' : `V${maxGrade}`}
            </Text>
          </Pressable>
          <Pressable
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
            onPress={() => setActiveFilterMenu((prev) => (prev === 'setter' ? null : 'setter'))}
          >
            <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }} numberOfLines={1}>
              Setter: {setterFilter === 'all' ? 'All' : setterFilter}
            </Text>
          </Pressable>
          <Pressable
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: `${colors.primary}10`, borderWidth: 1, borderColor: `${colors.primary}33` }}
            onPress={() => {
              setMinGrade(null);
              setMaxGrade(null);
              setSetterFilter('all');
              setActiveFilterMenu(null);
            }}
          >
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Clear</Text>
          </Pressable>
        </ScrollView>

        {activeFilterMenu ? (
          <View style={{ marginTop: 10, backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>
                {activeFilterMenu === 'wall'
                  ? 'Wall'
                  : activeFilterMenu === 'sort'
                    ? 'Sort'
                    : activeFilterMenu === 'minGrade'
                      ? 'Min Grade'
                      : activeFilterMenu === 'maxGrade'
                        ? 'Max Grade'
                        : 'Setter'}
              </Text>
              <Pressable onPress={() => setActiveFilterMenu(null)}>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Close</Text>
              </Pressable>
            </View>

            {activeFilterMenu === 'sort' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { id: 'newest', label: 'Newest' },
                  { id: 'oldest', label: 'Oldest' },
                  { id: 'name', label: 'Name' },
                  { id: 'grade-asc', label: 'Easiest' },
                  { id: 'grade-desc', label: 'Hardest' },
                  { id: 'highest-rated', label: 'Highest Rated' },
                  { id: 'most-liked', label: 'Most Liked' },
                  { id: 'most-climbed', label: 'Most Climbed' },
                  { id: 'most-viewed', label: 'Most Viewed' },
                ].map((option) => (
                  <Pressable
                    key={option.id}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: sortBy === option.id ? `${colors.primary}14` : colors.background,
                    }}
                    onPress={() => {
                      setSortBy(option.id as typeof sortBy);
                      setActiveFilterMenu(null);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {activeFilterMenu === 'minGrade' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {gradeOptions.map((grade) => (
                  <Pressable
                    key={`min-${grade === null ? 'any' : grade}`}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: minGrade === grade ? `${colors.primary}14` : colors.background,
                    }}
                    onPress={() => {
                      setMinGrade(grade);
                      setActiveFilterMenu(null);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>
                      {grade === null ? 'Any' : `V${grade}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {activeFilterMenu === 'maxGrade' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {gradeOptions.map((grade) => (
                  <Pressable
                    key={`max-${grade === null ? 'any' : grade}`}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: maxGrade === grade ? `${colors.primary}14` : colors.background,
                    }}
                    onPress={() => {
                      setMaxGrade(grade);
                      setActiveFilterMenu(null);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>
                      {grade === null ? 'Any' : `V${grade}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {activeFilterMenu === 'setter' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 10,
                    backgroundColor: setterFilter === 'all' ? `${colors.primary}14` : colors.background,
                  }}
                  onPress={() => {
                    setSetterFilter('all');
                    setActiveFilterMenu(null);
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>All Setters</Text>
                </Pressable>
                {availableSetters.map((setter) => (
                  <Pressable
                    key={setter}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: setterFilter === setter ? `${colors.primary}14` : colors.background,
                    }}
                    onPress={() => {
                      setSetterFilter(setter);
                      setActiveFilterMenu(null);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>{setter}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {activeFilterMenu === 'wall' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 10,
                    backgroundColor: activeWallId === 'all-walls' ? `${colors.primary}14` : colors.background,
                  }}
                  onPress={() => {
                    setSelectedWall({
                      id: 'all-walls',
                      user_id: 'system',
                      name: 'All Walls',
                      image_url: '',
                      image_width: 0,
                      image_height: 0,
                      is_public: true,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    });
                    setActiveFilterMenu(null);
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>All Walls</Text>
                </Pressable>
                {walls.map((wall) => (
                  <Pressable
                    key={wall.id}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: activeWallId === wall.id ? `${colors.primary}14` : colors.background,
                    }}
                    onPress={() => {
                      setSelectedWall(wall);
                      setActiveFilterMenu(null);
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>{wall.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Route List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 12 }}>Loading routes...</Text>
        </View>
      ) : sortedRoutes.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          {searchQuery ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 4 }}>No routes found</Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>Try adjusting your search</Text>
            </>
          ) : (
            <>
              <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: `${colors.secondary}1f`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 32 }}>🧗</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 4 }}>Create your first route</Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24 }}>
                Tap holds on your wall to build climbing routes
              </Text>
              <Pressable
                style={{ backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 }}
                onPress={() => router.push('/(tabs)/editor')}
              >
                <Text style={{ color: colors.card, fontWeight: '600' }}>Create Route</Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 32, paddingTop: 24, borderTopWidth: 1, borderTopColor: `${colors.border}66` }}>
                {Object.entries(HOLD_COLORS).map(([type, color]) => (
                  <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ backgroundColor: color, width: 10, height: 10, borderRadius: 5 }} />
                    <Text style={{ fontSize: 12, color: colors.muted, textTransform: 'capitalize' }}>{type}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={sortedRoutes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RouteRow
              route={item}
              wallName={getWallById(item.wall_id)?.name}
              wallImage={item.wall_image_url || getWallById(item.wall_id)?.image_url}
              now={now}
              onPress={() => setRouteToViewId(item.id)}
              onLike={() => toggleLike(item.id)}
              onLog={() => { setRouteToViewId(item.id); setShowLogModal(true); }}
              onShare={() => handleShare(item)}
              onExpand={() => setExpandedRouteId(expandedRouteId === item.id ? null : item.id)}
              isExpanded={expandedRouteId === item.id}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140, paddingTop: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}

      {/* FAB */}
      {filteredRoutes.length > 0 && (
        <Pressable
          style={{
            position: 'absolute', bottom: 24, right: 20,
            width: 56, height: 56, borderRadius: 28,
            overflow: 'hidden',
            shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
            backgroundColor: colors.primary,
          }}
          onPress={() => router.push('/(tabs)/editor')}
          className="active:opacity-80"
        >
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.card, fontSize: 28, fontWeight: '300', marginTop: -2 }}>+</Text>
          </View>
        </Pressable>
      )}

      <Modal visible={!!routeToView} animationType="slide" onRequestClose={() => setRouteToViewId(null)}>
        {routeToView && (
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            <View
              style={{
                paddingHorizontal: 20,
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 8,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>Route</Text>
              <Pressable onPress={() => setRouteToViewId(null)}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
              <View style={{ borderRadius: 16, backgroundColor: colors.card, overflow: 'hidden', marginBottom: 16 }}>
                {(() => {
                  const wall = getWallById(routeToView.wall_id);
                  const imageUrl = routeToView.wall_image_url || wall?.image_url;
                  return imageUrl ? (
                    <Image
                      source={{ uri: imageUrl }}
                      style={{ width: '100%', height: 200 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{ height: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border }}>
                      <Text style={{ color: colors.muted }}>No wall image</Text>
                    </View>
                  );
                })()}
              </View>

              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{routeToView.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                {routeToView.grade_v ? (
                  <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '600' }}>{routeToView.grade_v}</Text>
                ) : null}
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {getWallById(routeToView.wall_id)?.name || 'Unknown wall'}
                </Text>
              </View>

              {routeToView.user_name && (
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6 }}>
                  Set by {routeToView.user_name}
                </Text>
              )}

              <View style={{ marginTop: 16, borderRadius: 16, padding: 12, backgroundColor: colors.card }}>
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>Stats</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{routeToView.holds.length}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>Holds</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{routeToView.like_count || 0}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>Likes</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{routeToView.ascents?.length || 0}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>Sends</Text>
                  </View>
                </View>
                <View style={{ marginTop: 10 }}>
                  {(() => {
                    const ascents = routeToView.ascents || [];
                    const ratings = ascents.filter((a) => a.rating).map((a) => a.rating as number);
                    const avg = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {renderStars(Math.round(avg))}
                        <Text style={{ fontSize: 12, color: colors.muted }}>{avg > 0 ? avg.toFixed(1) : 'No ratings'}</Text>
                      </View>
                    );
                  })()}
                </View>
              </View>

              <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
                <Pressable
                  style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.card }}
                  onPress={() => toggleLike(routeToView.id)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                    {routeToView.is_liked ? 'Liked' : 'Like'}
                  </Text>
                </Pressable>
                <Pressable
                  style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.card }}
                  onPress={() => setShowLogModal(true)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>Log Send</Text>
                </Pressable>
                <Pressable
                  style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.card }}
                  onPress={() => handleShare(routeToView)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>Share</Text>
                </Pressable>
              </View>

              {canEditRoute && (
                <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.card }}
                    onPress={() => {
                      setRouteToViewId(null);
                      router.push(`/(tabs)/editor?edit=${routeToView.id}`);
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.card }}
                    onPress={() => {
                      Alert.alert('Delete Route', `Delete "${routeToView.name}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            await deleteRoute(routeToView.id);
                            setRouteToViewId(null);
                          },
                        },
                      ]);
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted }}>Delete</Text>
                  </Pressable>
                </View>
              )}

              <View style={{ marginTop: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>Beta</Text>
                  <Pressable onPress={() => refreshRouteComments(routeToView.id)}>
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Refresh</Text>
                  </Pressable>
                </View>
                {(routeToView.comments || []).filter((c) => c.is_beta).length === 0 ? (
                  <Text style={{ fontSize: 12, color: colors.muted }}>No beta yet.</Text>
                ) : (
                  (routeToView.comments || []).filter((c) => c.is_beta).map((comment) => {
                    const isOwner = comment.user_id === (user?.id || 'local-user');
                    return (
                    <View key={comment.id} style={{ borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: colors.card }}>
                        <Text style={{ fontSize: 13, color: colors.text }}>{comment.content}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
                          {comment.user_name || 'Anonymous'} • {formatTimeAgo(comment.created_at)}
                        </Text>
                        {isOwner && (
                          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                            <Pressable onPress={() => startEditComment(comment.id, comment.content, true)}>
                              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Edit</Text>
                            </Pressable>
                            <Pressable onPress={() => deleteComment(routeToView.id, comment.id)}>
                              <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>Delete</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>

              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 8 }}>Comments</Text>
                {(routeToView.comments || []).filter((c) => !c.is_beta).length === 0 ? (
                  <Text style={{ fontSize: 12, color: colors.muted }}>No comments yet.</Text>
                ) : (
                  (routeToView.comments || []).filter((c) => !c.is_beta).map((comment) => {
                    const isOwner = comment.user_id === (user?.id || 'local-user');
                    return (
                      <View key={comment.id} style={{ borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: colors.card }}>
                        <Text style={{ fontSize: 13, color: colors.text }}>{comment.content}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
                          {comment.user_name || 'Anonymous'} • {formatTimeAgo(comment.created_at)}
                        </Text>
                        {isOwner && (
                          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                            <Pressable onPress={() => startEditComment(comment.id, comment.content, false)}>
                              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Edit</Text>
                            </Pressable>
                            <Pressable onPress={() => deleteComment(routeToView.id, comment.id)}>
                              <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '600' }}>Delete</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>

              <View style={{ marginTop: 16, borderRadius: 16, padding: 12, backgroundColor: colors.card }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 8 }}>Add a comment</Text>
                <TextInput
                  placeholder="Share beta or feedback"
                  placeholderTextColor={colors.muted}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  style={{
                    minHeight: 80,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    color: colors.text,
                  }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <Pressable
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                    backgroundColor: commentIsBeta ? `${colors.primary}1a` : colors.card,
                  }}
                  onPress={() => setCommentIsBeta((v) => !v)}
                >
                  <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }}>
                    {commentIsBeta ? 'Beta' : 'Mark as Beta'}
                  </Text>
                </Pressable>
                <Pressable
                  style={{
                    marginLeft: 'auto',
                    backgroundColor: colors.primary,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 10,
                  }}
                  onPress={handleAddComment}
                >
                  <Text style={{ color: colors.card, fontWeight: '600' }}>Post</Text>
                </Pressable>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      <Modal visible={showLogModal} animationType="slide" onRequestClose={() => setShowLogModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
          <View
            style={{
              paddingHorizontal: 20,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 8,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>Log Send</Text>
            <Pressable onPress={() => setShowLogModal(false)}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>Rating</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16, alignItems: 'center' }}>
              {[1, 2, 3, 4, 5].map((r) => (
                <Pressable key={r} onPress={() => setLogRating(r)}>
                  <Text style={{ color: (logRating || 0) >= r ? colors.accent : colors.border, fontSize: 22 }}>★</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setLogRating(null)}>
                <Text style={{ color: colors.muted, fontSize: 12, marginLeft: 6 }}>Clear</Text>
              </Pressable>
            </View>

            <Pressable
              style={{
                backgroundColor: logFlashed ? `${colors.primary}1a` : colors.card,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: 'center',
                marginBottom: 16,
              }}
              onPress={() => setLogFlashed((v) => !v)}
            >
              <Text style={{ color: colors.text, fontWeight: '600' }}>{logFlashed ? 'Flashed' : 'Mark as Flash'}</Text>
            </Pressable>

            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>Notes</Text>
            <TextInput
              placeholder="Optional notes"
              placeholderTextColor={colors.muted}
              value={logNote}
              onChangeText={setLogNote}
              multiline
              style={{
                minHeight: 80,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                color: colors.text,
              }}
            />

            <Pressable
              style={{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              onPress={handleLogSend}
            >
              <Text style={{ color: colors.card, fontWeight: '600' }}>Save</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!editingCommentId} animationType="slide" onRequestClose={() => setEditingCommentId(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
          <View
            style={{
              paddingHorizontal: 20,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 8,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>Edit Comment</Text>
            <Pressable onPress={() => setEditingCommentId(null)}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <TextInput
              placeholder="Update your comment"
              placeholderTextColor={colors.muted}
              value={editingContent}
              onChangeText={setEditingContent}
              multiline
              style={{
                minHeight: 100,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                color: colors.text,
              }}
            />
            <Pressable
              style={{
                marginTop: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: editingIsBeta ? `${colors.primary}1a` : colors.card,
                alignSelf: 'flex-start',
              }}
              onPress={() => setEditingIsBeta((v) => !v)}
            >
              <Text style={{ fontSize: 12, color: colors.text, fontWeight: '600' }}>
                {editingIsBeta ? 'Beta' : 'Mark as Beta'}
              </Text>
            </Pressable>
            <Pressable
              style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
              onPress={handleSaveEdit}
            >
              <Text style={{ color: colors.card, fontWeight: '600' }}>Save</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
