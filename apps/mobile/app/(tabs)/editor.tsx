import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  HOLD_COLORS,
  V_GRADES,
  createHold,
  createUuid,
  createShareToken,
  cycleHoldType,
  findHoldNearPoint,
  removeHold,
  toggleSequencing,
  type Hold,
  type HoldSize,
  type HoldType,
  type Route,
} from '@climbset/shared';
import { useRoutesStore } from '../../lib/stores/routes-store';
import { useWallsStore } from '../../lib/stores/walls-store';
import { useUserStore } from '../../lib/stores/user-store';
import { useTheme } from '../../lib/theme';
import EditorWallCanvas from '../../components/wall/EditorWallCanvas';

const HOLD_TYPES: HoldType[] = ['start', 'hand', 'foot', 'finish'];
const DRAFT_KEY_PREFIX = 'climbset-draft';

export default function EditorScreen() {
  const router = useRouter();
  const { colors, reduceMotion } = useTheme();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editRouteId = typeof edit === 'string' ? edit : undefined;
  const { routes, isLoading, hasHydrated, fetchRoutes, addRoute, updateRoute } = useRoutesStore();
  const { selectedWall, fetchWalls, setSelectedWall, getWallById, walls } = useWallsStore();
  const { user, userId, isModerator } = useUserStore();
  const draftKey = `${DRAFT_KEY_PREFIX}:${userId || user?.id || 'local-user'}`;
  const [holds, setHolds] = useState<Hold[]>([]);
  const [history, setHistory] = useState<Hold[][]>([]);
  const [future, setFuture] = useState<Hold[][]>([]);
  const [selectedType, setSelectedType] = useState<HoldType>('hand');
  const [selectedSize, setSelectedSize] = useState<HoldSize>('medium');
  const [showSequence, setShowSequence] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [routeGrade, setRouteGrade] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [wallReady, setWallReady] = useState(Boolean(selectedWall?.image_url));
  const loadedRouteRef = useRef<string | undefined>(undefined);
  const draftGenerationRef = useRef(0);
  const [editFetchSettled, setEditFetchSettled] = useState(!editRouteId);

  useEffect(() => {
    setEditFetchSettled(!editRouteId);
    let active = true;
    fetchRoutes().finally(() => { if (active) setEditFetchSettled(true); });
    fetchWalls().then(() => {
      if (!active || editRouteId || useWallsStore.getState().selectedWall) return;
      const defaultWall = useWallsStore.getState().walls.find((wall) => wall.id === 'default-wall');
      if (defaultWall) setSelectedWall(defaultWall);
    });
    return () => { active = false; };
  }, [editRouteId, fetchRoutes, fetchWalls, setSelectedWall]);

  useEffect(() => {
    const generation = draftGenerationRef.current + 1;
    draftGenerationRef.current = generation;
    setDraftHydrated(false);
    setHolds([]);
    setHistory([]);
    setFuture([]);
    setRouteName('');
    setRouteGrade('');
    setShowSequence(false);
    loadedRouteRef.current = undefined;
    if (editRouteId) return;
    let cancelled = false;
    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (cancelled || draftGenerationRef.current !== generation || !raw) return;
        try {
          const draft = JSON.parse(raw);
          if (Array.isArray(draft)) {
            setHolds(draft);
            setHistory([]);
            setFuture([]);
            setShowSequence(draft.some((hold: Hold) => hold.sequence != null));
          }
        } catch {
          AsyncStorage.removeItem(draftKey).catch(() => undefined);
        }
      })
      .finally(() => {
        if (!cancelled && draftGenerationRef.current === generation) setDraftHydrated(true);
      });
    return () => { cancelled = true; };
  }, [draftKey, editRouteId]);

  useEffect(() => {
    if (!draftHydrated || editRouteId) return;
    AsyncStorage.setItem(draftKey, JSON.stringify(holds)).catch(() => undefined);
  }, [draftKey, draftHydrated, editRouteId, holds]);

  useEffect(() => {
    if (!editRouteId || loadedRouteRef.current === editRouteId || !hasHydrated || isLoading || !editFetchSettled) return;
    const route = routes.find((candidate) => candidate.id === editRouteId);
    if (!route) {
      loadedRouteRef.current = editRouteId;
      Alert.alert('Route not found', 'This route is no longer available.');
      router.replace('/(tabs)');
      return;
    }
    const canEdit = isModerator || route.user_id === (user?.id || userId || 'local-user') || route.user_id === 'local-user';
    if (!canEdit) {
      loadedRouteRef.current = editRouteId;
      Alert.alert('Permission denied', 'You do not have permission to edit this route.');
      router.replace('/(tabs)');
      return;
    }
    loadedRouteRef.current = editRouteId;
    const generation = draftGenerationRef.current;
    const timer = setTimeout(() => {
      if (draftGenerationRef.current !== generation) return;
      const nextHolds = route.holds || [];
      setHolds(nextHolds);
      setHistory([]);
      setFuture([]);
      setRouteName(route.name || '');
      setRouteGrade(route.grade_v || '');
      setDraftHydrated(true);
      if (route.wall_id) {
        const wall = getWallById(route.wall_id);
        if (wall) setSelectedWall(wall);
      }
      AsyncStorage.removeItem(draftKey).catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [draftKey, editFetchSettled, editRouteId, getWallById, hasHydrated, isLoading, isModerator, router, routes, setSelectedWall, user?.id, userId, walls]);
  const commit = useCallback((next: Hold[]) => {
    setHistory((previous) => [...previous, holds]);
    setFuture([]);
    setHolds(next);
  }, [holds]);

  const handleTap = useCallback((point: { x: number; y: number }) => {
    if (!draftHydrated) return;
    const near = findHoldNearPoint(holds, point.x, point.y);
    if (near) {
      commit(cycleHoldType(holds, near.id));
      return;
    }
    commit([...holds, createHold(point.x, point.y, selectedType, selectedSize, showSequence ? Math.max(0, ...holds.map((hold) => hold.sequence || 0)) + 1 : null)]);
  }, [commit, draftHydrated, holds, selectedSize, selectedType, showSequence]);

  const handleLongPress = useCallback((point: { x: number; y: number }) => {
    if (!draftHydrated) return;
    const next = removeHold(holds, point.x, point.y);
    if (next !== holds) commit(next);
  }, [commit, draftHydrated, holds]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items, holds]);
    setHolds(previous);
  }, [history, holds]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items, holds]);
    setHolds(next);
  }, [future, holds]);

  const clear = useCallback(() => {
    if (holds.length === 0) return;
    Alert.alert('Clear all holds?', 'This action can be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => commit([]) },
    ]);
  }, [commit, holds.length]);

  const sequenceToggle = useCallback(() => {
    const nextEnabled = !showSequence;
    setShowSequence(nextEnabled);
    commit(toggleSequencing(holds, nextEnabled));
  }, [commit, holds, showSequence]);

  const save = async () => {
    if (saveBusy) return;
    setSaveBusy(true);
    try {
      const name = routeName.trim();
      if (!name) {
        setSaveError('Please enter a route name');
        return;
      }
      if (!editRouteId && (!selectedWall || selectedWall.id === 'all-walls')) {
        setSaveError('Select a specific wall before saving');
        return;
      }
      if (!wallReady) {
        setSaveError('Wait for the wall image to finish loading before saving');
        return;
      }
      setSaveError('');
      const liveState = useRoutesStore.getState();
      const liveUser = useUserStore.getState();
      const saveOwnerId = liveUser.user?.id || liveUser.userId || 'local-user';
      if (editRouteId) {
        const currentRoute = liveState.routes.find((route) => route.id === editRouteId);
        const canEdit = currentRoute && (liveUser.isModerator || currentRoute.user_id === liveUser.user?.id || currentRoute.user_id === 'local-user');
        if (!currentRoute || !canEdit) {
          setSaveError('This route is no longer available or you do not have permission to edit it.');
          return;
        }
        if ((useUserStore.getState().userId || 'local-user') !== saveOwnerId) {
          setSaveError('Session changed while saving; please retry.');
          return;
        }
        const updated = await updateRoute(editRouteId, {
          name,
          grade_v: routeGrade || undefined,
          holds,
        });
        if ((useUserStore.getState().userId || 'local-user') !== saveOwnerId) {
          setSaveError('Session changed while saving; please retry.');
          return;
        }
        if (!updated) {
          setSaveError('Unable to update this route. Refresh and try again.');
          return;
        }
        try { await AsyncStorage.removeItem(draftKey); } catch { /* saved route remains valid */ }
        setSaveOpen(false);
        router.replace('/(tabs)');
        return;
      }
      const wall = selectedWall;
      if (!wall) {
        setSaveError('Select a specific wall before saving');
        return;
      }
      if ((useUserStore.getState().userId || 'local-user') !== saveOwnerId) {
        setSaveError('Session changed while saving; please retry.');
        return;
      }
      const now = new Date().toISOString();
      const route: Route = {
        id: createUuid(),
        user_id: liveUser.user?.id || liveUser.userId || 'local-user',
        user_name: liveUser.user?.displayName || liveUser.displayName || 'Anonymous',
        wall_id: wall.id,
        wall_image_url: wall.image_url || undefined,
        wall_image_width: wall.image_width,
        wall_image_height: wall.image_height,
        name,
        grade_v: routeGrade || undefined,
        holds,
        is_public: false,
        view_count: 0,
        share_token: createShareToken(10),
        created_at: now,
        updated_at: now,
        like_count: 0,
      };
      const added = await addRoute(route, saveOwnerId);
      if ((useUserStore.getState().userId || 'local-user') !== saveOwnerId) {
        setSaveError('Session changed while saving; please retry.');
        return;
      }
      if (!added) {
        setSaveError('Unable to save route while offline. Try again when connected.');
        return;
      }
      Alert.alert('Route saved', `${name} is ready to climb.`);
      try { await AsyncStorage.removeItem(draftKey); } catch { /* saved route remains valid */ }
      setSaveOpen(false);
      setRouteName('');
      setRouteGrade('');
      setHolds([]);
      setHistory([]);
      setFuture([]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save route');
    } finally {
      setSaveBusy(false);
    }
  };

  const editingRoute = editRouteId ? routes.find((route) => route.id === editRouteId) : undefined;
  const wallImage = editRouteId ? editingRoute?.wall_image_url || editingRoute?.wall?.image_url || selectedWall?.image_url : selectedWall?.image_url;
  const wallWidth = editRouteId ? editingRoute?.wall_image_width || editingRoute?.wall?.image_width : selectedWall?.image_width;
  const wallHeight = editRouteId ? editingRoute?.wall_image_height || editingRoute?.wall?.image_height : selectedWall?.image_height;
  useEffect(() => {
    setWallReady(false);
  }, [wallImage]);
  const handleImageStateChange = useCallback((state: 'loading' | 'ready' | 'error') => {
    setWallReady(state === 'ready');
  }, []);
  const holdCounts = useMemo(() => HOLD_TYPES.map((type) => ({ type, count: holds.filter((hold) => hold.type === type).length })), [holds]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={undo} disabled={!history.length} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.card, opacity: history.length ? 1 : 0.45 }}><Text style={{ color: colors.text }}>Undo</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Redo" onPress={redo} disabled={!future.length} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.card, opacity: future.length ? 1 : 0.45 }}><Text style={{ color: colors.text }}>Redo</Text></Pressable>
        </View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{holds.length} {holds.length === 1 ? 'hold' : 'holds'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={editRouteId ? 'Update route' : 'Save route'} onPress={() => { setSaveError(''); setSaveOpen(true); }} disabled={!holds.length} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary, opacity: holds.length ? 1 : 0.45 }}><Text style={{ color: colors.card, fontWeight: '700' }}>{editRouteId ? 'Update' : 'Save'}</Text></Pressable>
      </View>

      <View style={{ flex: 1, marginHorizontal: 10, marginBottom: 8, borderRadius: 16, overflow: 'hidden' }}>
        <EditorWallCanvas imageUrl={wallImage} imageWidth={wallWidth} imageHeight={wallHeight} holds={holds} showSequence={showSequence} onImageStateChange={handleImageStateChange} onTap={handleTap} onLongPress={handleLongPress} />
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 10, paddingTop: 8, backgroundColor: colors.card }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {HOLD_TYPES.map((type) => (
            <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: selectedType === type }} accessibilityLabel={`Hold type ${type}`} onPress={() => setSelectedType(type)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: selectedType === type ? `${colors.primary}22` : colors.background }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: HOLD_COLORS[type] }} /><Text style={{ color: selectedType === type ? colors.primary : colors.muted, textTransform: 'capitalize' }}>{type}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['small', 'medium', 'large'] as HoldSize[]).map((size) => (
              <Pressable key={size} accessibilityRole="button" accessibilityState={{ selected: selectedSize === size }} accessibilityLabel={`Hold size ${size}`} onPress={() => setSelectedSize(size)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: selectedSize === size ? `${colors.primary}22` : colors.background }}><Text style={{ color: selectedSize === size ? colors.primary : colors.muted, textTransform: 'capitalize' }}>{size}</Text></Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: showSequence }} accessibilityLabel="Toggle sequence numbers" onPress={sequenceToggle} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: showSequence ? `${colors.primary}22` : colors.background }}><Text style={{ color: showSequence ? colors.primary : colors.muted }}>#</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Clear all holds" onPress={clear} disabled={!holds.length} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.background, opacity: holds.length ? 1 : 0.4 }}><Text style={{ color: colors.destructive }}>Clear</Text></Pressable>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>{holdCounts.filter(({ count }) => count > 0).map(({ type, count }) => <Text key={type} style={{ color: colors.muted, fontSize: 11 }}>{count} {type}</Text>)}</View>
      </View>

      <Modal visible={saveOpen} animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={() => setSaveOpen(false)}>
        <SafeAreaView accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel save" onPress={() => setSaveOpen(false)}><Text style={{ color: colors.muted }}>Cancel</Text></Pressable>
            <Text accessibilityRole="header" style={{ color: colors.text, fontWeight: '700' }}>{editRouteId ? 'Update route' : 'Save route'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Confirm save" onPress={save} disabled={saveBusy} accessibilityState={{ disabled: saveBusy, busy: saveBusy }}><Text style={{ color: colors.primary, fontWeight: '700' }}>{saveBusy ? 'Saving…' : editRouteId ? 'Update' : 'Save'}</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: colors.text, fontWeight: '600' }}>Route name</Text>
            <TextInput value={routeName} onChangeText={setRouteName} placeholder="e.g., Crimpy Corner" placeholderTextColor={colors.muted} accessibilityLabel="Route name" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, color: colors.text, backgroundColor: colors.card }} />
            {saveError ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{saveError}</Text> : null}
            <Text style={{ color: colors.text, fontWeight: '600' }}>Setter grade</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {['', ...V_GRADES].map((grade) => <Pressable key={grade || 'ungraded'} accessibilityRole="button" accessibilityState={{ selected: routeGrade === grade }} onPress={() => setRouteGrade(grade)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: routeGrade === grade ? colors.primary : colors.card }}><Text style={{ color: routeGrade === grade ? colors.card : colors.muted }}>{grade || 'Ungraded'}</Text></Pressable>)}
            </ScrollView>
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.card }}><Text style={{ color: colors.muted }}>This route will use {selectedWall?.name || 'the selected wall'} and {holds.length} holds.</Text></View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
