import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, Modal, Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { V_GRADES, calculateDisplayGrade, createId, createShareToken, type Ascent, type Comment, type Route } from '@climbset/shared';
import { useTheme } from '../../lib/theme';
import { Button, InlineNotice } from '../../components/ui';
import { useRoutesStore } from '../../lib/stores/routes-store';
import { DEFAULT_WALL, useWallsStore } from '../../lib/stores/walls-store';
import { useUserStore } from '../../lib/stores/user-store';
import { RouteCard } from '../../components/home/RouteCard';
import { RouteViewer } from '../../components/wall/RouteViewer';
import { CommentsSection } from '../../components/route/CommentsSection';
import { buildShareUrl, filterAndSortRoutes, SORT_OPTIONS, type SortMode } from '../../components/home/route-query';
const nowId = () => createId();


function ActionButton({ testID, label, onPress, disabled = false }: { testID: string; label: string; onPress: () => void; disabled?: boolean }) {
  return <Button testID={testID} accessibilityLabel={label} label={label} disabled={disabled} onPress={onPress} />;
}

function LogSheet({ route, onClose, onSubmit }: { route: Route; onClose: () => void; onSubmit: (ascent: Ascent) => Promise<boolean> }) {
  const { colors } = useTheme();
  const { user, profile } = useUserStore();
  const [grade, setGrade] = useState(route.grade_v || '');
  const [rating, setRating] = useState<number | undefined>();
  const [flashed, setFlashed] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  return <View testID="log-sheet" style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}><Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>Log climb</Text><Text style={{ color: colors.muted, marginTop: 5 }}>{route.name}</Text>
    <Text style={{ color: colors.muted, marginTop: 22, marginBottom: 8 }}>Your ascent grade</Text><ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 8 }}>{V_GRADES.map((value) => <Pressable key={value} testID={`ascent-grade-${value}`} accessibilityRole="button" accessibilityLabel={`Ascent grade ${value}`} accessibilityState={{ selected: grade === value }} onPress={() => setGrade(value)} style={{ minWidth: 48, minHeight: 44, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: grade === value ? colors.primary : colors.card }}><Text style={{ color: grade === value ? colors.card : colors.text, fontWeight: '600' }}>{value}</Text></Pressable>)}</ScrollView>
    <Text style={{ color: colors.muted, marginTop: 20, marginBottom: 8 }}>Rating</Text><View style={{ flexDirection: 'row', gap: 8 }}>{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} testID={`rating-${value}`} accessibilityRole="button" accessibilityLabel={`${value} star rating`} accessibilityState={{ selected: rating === value }} onPress={() => setRating(rating === value ? undefined : value)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 27, color: rating && rating >= value ? colors.accent : colors.border }}>★</Text></Pressable>)}</View>
    <Pressable testID="flash-toggle" accessibilityRole="switch" accessibilityLabel="Sent on first try" accessibilityState={{ checked: flashed }} onPress={() => setFlashed((value) => !value)} style={{ minHeight: 48, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: flashed ? `${colors.accent}22` : colors.card }}><Text style={{ color: flashed ? colors.accent : colors.text, fontWeight: '600' }}>{flashed ? 'Flashed on first try' : 'Mark as flash'}</Text></Pressable>
    <TextInput testID="ascent-notes" accessibilityLabel="Ascent notes" value={notes} onChangeText={setNotes} multiline placeholder="Optional notes" placeholderTextColor={colors.muted} style={{ minHeight: 90, marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, textAlignVertical: 'top' }} />
    <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}><Pressable testID="log-cancel" accessibilityRole="button" accessibilityLabel="Cancel logging climb" onPress={onClose} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted, fontWeight: '700' }}>Cancel</Text></Pressable><ActionButton testID="log-submit" label={saving ? 'Logging…' : 'Log climb'} disabled={saving} onPress={async () => { setSaving(true); try { const submitted = await onSubmit({ id: nowId(), route_id: route.id, user_id: user?.id || 'local-user', user_name: profile?.full_name || user?.displayName || 'Climber', grade_v: grade || undefined, rating, flashed, notes: notes.trim() || undefined, created_at: new Date().toISOString() }); if (submitted) onClose(); } finally { setSaving(false); } }} /></View>
  </View>;
}

export default function HomeScreen() {
  const { routeId: initialRouteId } = useLocalSearchParams<{ routeId?: string }>();
  const router = useRouter();
  const { colors, reduceMotion } = useTheme();
  const { routes, pendingRoutes, isLoading, isOfflineMode, fetchRoutes, toggleLike, addAscent, updateRoute, syncLocalRoutes, drainPendingRoutes, deleteRoute, addComment, updateComment, deleteComment, incrementViewCount } = useRoutesStore();
  const { fetchWalls, getWallById, walls, selectedWall, setSelectedWall, isOfflineMode: isWallOfflineMode, syncLocalWalls, drainPendingWalls } = useWallsStore();
  const { user, profile, isModerator } = useUserStore();
  const currentUserId = user?.id || 'local-user';
  const offline = isOfflineMode || isWallOfflineMode;
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [grade, setGrade] = useState('all');
  const [setter, setSetter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'log' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterMenu, setFilterMenu] = useState<'sort' | 'grade' | 'setter' | 'wall' | null>(null);
  const route = routeId ? routes.find((item) => item.id === routeId) || null : null;
  const canManageRoute = route ? isModerator || route.user_id === currentUserId || route.user_id === 'local-user' : false;
  const selectedWallId = selectedWall?.id || 'all-walls';
  const viewedRouteId = useRef<string | null>(null);
  useEffect(() => {
    if (typeof initialRouteId !== 'string' || !routes.some((item) => item.id === initialRouteId)) return;
    const timer = setTimeout(() => setRouteId(initialRouteId), 0);
    return () => clearTimeout(timer);
  }, [initialRouteId, routes]);
  const setters = useMemo(() => Array.from(new Set(routes.map((item) => item.user_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)), [routes]);
  const visible = useMemo(() => filterAndSortRoutes(routes, { wallId: selectedWallId, search, grade, setter, sort }), [routes, selectedWallId, search, grade, setter, sort]);
  useEffect(() => { if (!routeId) { viewedRouteId.current = null; return; } if (viewedRouteId.current === routeId) return; viewedRouteId.current = routeId; incrementViewCount?.(routeId); }, [routeId, incrementViewCount]);
  useEffect(() => { fetchRoutes(); fetchWalls(); }, [fetchRoutes, fetchWalls]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetchWalls();
      const wallIdMap = await syncLocalWalls();
      await drainPendingWalls();
      await syncLocalRoutes(wallIdMap);
      await drainPendingRoutes();
      await Promise.all([fetchWalls(), fetchRoutes()]);
    } finally {
      setRefreshing(false);
    }
  };
  const startCreate = () => {
    if (!selectedWall || selectedWall.id === 'all-walls') setSelectedWall(DEFAULT_WALL);
    router.push('/(tabs)/editor');
  };
  const openRoute = (id: string) => setRouteId(id);
  const share = async (item: Route) => {
    let shareRoute = item;
    const isPendingCreate = pendingRoutes.some((pending) => pending.route.id === shareRoute.id && pending.ownerId === currentUserId);
    if (shareRoute.user_id === 'local-user' || isPendingCreate) {
      if (!user) {
        Alert.alert('Sharing unavailable', 'Log in to sync this local route before sharing it.');
        return;
      }
      await drainPendingRoutes();
      await syncLocalRoutes();
      await fetchRoutes();
      const state = useRoutesStore.getState();
      const syncedRoute = state.routes.find((candidate) => candidate.id === shareRoute.id);
      const stillPending = state.pendingRoutes.some((pending) => pending.route.id === shareRoute.id && pending.ownerId === currentUserId);
      if (!syncedRoute || stillPending || syncedRoute.user_id === 'local-user' || syncedRoute.user_id !== currentUserId) {
        Alert.alert('Sharing unavailable', 'Unable to verify this route before sharing it.');
        return;
      }
      shareRoute = syncedRoute;
    }
    const canManageSharing = isModerator || shareRoute.user_id === currentUserId;
    if (!canManageSharing && !shareRoute.is_public) {
      Alert.alert('Sharing unavailable', 'Only the route owner can enable sharing for this route.');
      return;
    }
    if (!shareRoute.share_token && !canManageSharing) {
      Alert.alert('Sharing unavailable', 'Only the route owner can enable sharing for this route.');
      return;
    }

    const token = shareRoute.share_token || createShareToken(10);
    if (canManageSharing && (!shareRoute.is_public || shareRoute.share_token !== token)) {
      const persisted = await updateRoute(shareRoute.id, { share_token: token, is_public: true });
      if (!persisted) {
        Alert.alert('Sharing unavailable', 'Unable to persist a share link right now.');
        return;
      }
    }
    const url = buildShareUrl(token);
    await Share.share({ message: url, url });
  };
  const clearFilters = () => { setSearch(''); setGrade('all'); setSetter('all'); setSelectedWall(null); setFilterMenu(null); };
  const mutateComment = async (content: string, isBeta: boolean) => {
    if (!route) return false;
    if (!user) {
      Alert.alert('Sign in required', 'Log in to comment on routes.');
      return false;
    }
    const comment: Comment = {
      id: nowId(),
      route_id: route.id,
      user_id: user.id,
      user_name: profile?.full_name || user.displayName || 'Climber',
      content,
      is_beta: isBeta,
      created_at: new Date().toISOString(),
    };
    return addComment(route.id, comment);
  };

  const openLogSheet = (id: string) => {
    if (!user) {
      Alert.alert('Sign in required', 'Log in to log a climb.');
      return;
    }
    openRoute(id);
    setSheet('log');
  };
  const toggleLikeRoute = (id: string) => {
    if (!user) {
      Alert.alert('Sign in required', 'Log in to like routes.');
      return;
    }
    if (routes.find((route) => route.id === id)?.user_id === 'local-user') {
      Alert.alert('Like unavailable', 'Sync this route before liking it.');
      return;
    }
    void toggleLike(id, user.id);
  };
  const hasFilters = Boolean(search || grade !== 'all' || setter !== 'all' || selectedWallId !== 'all-walls');
  return <SafeAreaView testID="home-screen" style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>ClimbSet</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{visible.length} routes</Text></View>
      {offline && <View testID="offline-notice"><InlineNotice tone="warning" message="Local-only mode. Cloud sync is unavailable." /><Pressable testID="offline-retry" accessibilityRole="button" accessibilityLabel="Retry cloud sync" onPress={refresh} style={{ minHeight: 40, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 12, justifyContent: 'center' }}><Text style={{ color: colors.warningForeground, fontWeight: '700' }}>Retry</Text></Pressable></View>}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, minHeight: 48, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.muted, marginRight: 8 }}>⌕</Text><TextInput testID="home-search" accessibilityLabel="Search routes, setters, or grades" value={search} onChangeText={setSearch} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} placeholder="Search routes, setters..." placeholderTextColor={colors.muted} style={{ flex: 1, color: colors.text, fontSize: 15 }} />{search && <Pressable testID="home-search-clear" accessibilityRole="button" accessibilityLabel="Clear route search" onPress={() => setSearch('')}><Text style={{ color: colors.muted, fontSize: 18 }}>×</Text></Pressable>}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 8, paddingTop: 10 }}><Pressable testID="wall-filter" accessibilityRole="button" accessibilityLabel={`Wall filter, ${selectedWall?.name || 'All Walls'}`} accessibilityState={{ expanded: filterMenu === 'wall' }} onPress={() => setFilterMenu(filterMenu === 'wall' ? null : 'wall')} style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text }}>Wall: {selectedWall?.name || 'All Walls'}</Text></Pressable><Pressable testID="sort-filter" accessibilityRole="button" accessibilityLabel={`Sort routes, ${SORT_OPTIONS.find((option) => option.id === sort)?.label}`} accessibilityState={{ expanded: filterMenu === 'sort' }} onPress={() => setFilterMenu(filterMenu === 'sort' ? null : 'sort')} style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text }}>Sort: {SORT_OPTIONS.find((option) => option.id === sort)?.label}</Text></Pressable><Pressable testID="grade-filter" accessibilityRole="button" accessibilityLabel={`Grade filter, ${grade}`} accessibilityState={{ expanded: filterMenu === 'grade' }} onPress={() => setFilterMenu(filterMenu === 'grade' ? null : 'grade')} style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text }}>Grade: {grade}</Text></Pressable><Pressable testID="setter-filter" accessibilityRole="button" accessibilityLabel={`Setter filter, ${setter}`} accessibilityState={{ expanded: filterMenu === 'setter' }} onPress={() => setFilterMenu(filterMenu === 'setter' ? null : 'setter')} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}><Text style={{ color: colors.text }}>Setter: {setter === 'all' ? 'All' : setter}</Text></Pressable><Pressable testID="clear-filters" accessibilityRole="button" accessibilityLabel="Clear all route filters" onPress={clearFilters} style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Clear</Text></Pressable></ScrollView>
      {filterMenu && <View testID={`${filterMenu}-filter-menu`} style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>{filterMenu === 'sort' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{SORT_OPTIONS.map((option) => <Pressable key={option.id} testID={`sort-option-${option.id}`} accessibilityRole="button" accessibilityLabel={`Sort by ${option.label}`} accessibilityState={{ selected: sort === option.id }} onPress={() => { setSort(option.id); setFilterMenu(null); }} style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center', backgroundColor: sort === option.id ? colors.primary : colors.background }}><Text style={{ color: sort === option.id ? colors.card : colors.text }}>{option.label}</Text></Pressable>)}</View>}{filterMenu === 'grade' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['all', ...V_GRADES].map((value) => <Pressable key={value} testID={`grade-option-${value}`} accessibilityRole="button" accessibilityLabel={`Filter grade ${value}`} accessibilityState={{ selected: grade === value }} onPress={() => { setGrade(value); setFilterMenu(null); }} style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center', backgroundColor: grade === value ? colors.primary : colors.background }}><Text style={{ color: grade === value ? colors.card : colors.text }}>{value === 'all' ? 'All grades' : value}</Text></Pressable>)}</View>}{filterMenu === 'setter' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['all', ...setters].map((value) => <Pressable key={value} testID={`setter-option-${value}`} accessibilityRole="button" accessibilityLabel={`Filter setter ${value}`} accessibilityState={{ selected: setter === value }} onPress={() => { setSetter(value); setFilterMenu(null); }} style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center', backgroundColor: setter === value ? colors.primary : colors.background }}><Text style={{ color: setter === value ? colors.card : colors.text }}>{value === 'all' ? 'All setters' : value}</Text></Pressable>)}</View>}{filterMenu === 'wall' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[{ id: 'all-walls', name: 'All Walls' }, ...walls].map((wall) => <Pressable key={wall.id} testID={`wall-option-${wall.id}`} accessibilityRole="button" accessibilityLabel={`Select wall ${wall.name}`} accessibilityState={{ selected: selectedWallId === wall.id }} onPress={() => { setSelectedWall(wall.id === 'all-walls' ? null : wall as never); setFilterMenu(null); }} style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 9, justifyContent: 'center', backgroundColor: selectedWallId === wall.id ? colors.primary : colors.background }}><Text style={{ color: selectedWallId === wall.id ? colors.card : colors.text }}>{wall.name}</Text></Pressable>)}</View>}</View>}
    </View>
    {isLoading && !routes.length ? <View testID="home-loading" accessible accessibilityLabel="Loading routes" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /><Text style={{ color: colors.muted, marginTop: 12 }}>Loading routes...</Text></View> : !visible.length ? <View testID="home-empty" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}><Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>{hasFilters ? 'No routes found' : 'Create your first route'}</Text><Text style={{ color: colors.muted, textAlign: 'center', marginTop: 8 }}>{hasFilters ? 'Try adjusting your search or filters.' : 'Tap holds on your wall to build climbing routes.'}</Text>{(hasFilters) ? <ActionButton testID="empty-clear-filters" label="Clear filters" onPress={clearFilters} /> : <View style={{ marginTop: 20 }}><ActionButton testID="empty-create-route" label="Create route" onPress={startCreate} /></View>}</View> : <FlatList testID="route-list" data={visible} keyExtractor={(item) => item.id} renderItem={({ item }) => <RouteCard route={item} currentUserId={currentUserId} wallName={getWallById(item.wall_id)?.name} wallImage={ item.wall_image_url || getWallById(item.wall_id)?.image_url || DEFAULT_WALL.image_url } isExpanded={expanded === item.id} onOpen={() => openRoute(item.id)} onLike={() => toggleLikeRoute(item.id)} onLog={() => openLogSheet(item.id)} onShare={() => share(item)} onExpand={() => setExpanded(expanded === item.id ? null : item.id)} />} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />} />}
    <Pressable testID="create-route-fab" accessibilityRole="button" accessibilityLabel="Create route" onPress={startCreate} style={{ position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}><Text style={{ color: colors.card, fontSize: 28 }}>+</Text></Pressable>
    {route && <Modal visible transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => { setRouteId(null); setSheet(null); }}><View testID="route-detail-sheet" style={{ position: 'absolute', inset: 0, backgroundColor: colors.background, paddingTop: 44 }}><ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}><Pressable testID="route-viewer-close" accessibilityRole="button" accessibilityLabel="Close route viewer" onPress={() => { setRouteId(null); setSheet(null); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Close</Text></Pressable><RouteViewer route={route} imageUrl={route.wall_image_url || getWallById(route.wall_id)?.image_url || DEFAULT_WALL.image_url} imageWidth={route.wall_image_width} imageHeight={route.wall_image_height} /><Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 16 }}>{route.name}</Text><Text style={{ color: colors.muted, marginTop: 4 }}>{calculateDisplayGrade(route.grade_v, route.ascents || []) || 'Ungraded'} · {route.user_name || 'Anonymous'}</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}><ActionButton testID="viewer-like" label={route.is_liked ? 'Unlike' : 'Like'} onPress={() => toggleLikeRoute(route.id)} /><ActionButton testID="viewer-log" label="Log climb" onPress={() => { if (!user) { Alert.alert('Sign in required', 'Log in to log a climb.'); return; } setSheet('log'); }} /><ActionButton testID="viewer-share" label="Share" onPress={() => share(route)} /></View>{canManageRoute && <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}><ActionButton testID="viewer-edit" label="Edit" onPress={() => { setRouteId(null); router.push(`/(tabs)/editor?edit=${route.id}`); }} /><Pressable testID="viewer-delete" accessibilityRole="button" accessibilityLabel={`Delete route ${route.name}`} onPress={() => Alert.alert('Delete route?', `Delete ${route.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteRoute(route.id); setRouteId(null); } }])} style={{ minHeight: 48, flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}><Text style={{ color: colors.destructive, fontWeight: '700' }}>Delete</Text></Pressable></View>}<CommentsSection comments={route.comments} currentUserId={currentUserId} isModerator={isModerator} onSubmit={mutateComment} onDelete={(commentId) => deleteComment(route.id, commentId)} onUpdate={(commentId, content, isBeta) => updateComment(route.id, commentId, content, isBeta)} /></ScrollView></View></Modal>}
    {route && sheet === 'log' && <Modal visible transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setSheet(null)}><View testID="log-modal" style={{ position: 'absolute', inset: 0, backgroundColor: colors.background, paddingTop: 44 }}><LogSheet route={route} onClose={() => setSheet(null)} onSubmit={(ascent) => addAscent(route.id, ascent)} /></View></Modal>}
  </SafeAreaView>;
}
