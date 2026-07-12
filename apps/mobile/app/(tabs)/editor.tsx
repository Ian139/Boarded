import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  LayoutChangeEvent,
  GestureResponderEvent,
  Image,
} from 'react-native';
import {
  HOLD_COLORS,
  V_GRADES,
  type Hold,
  type HoldType,
  type HoldSize,
  type Route,
} from '@climbset/shared';
import { SafeAreaView } from 'react-native-safe-area-context';
import { nanoid } from 'nanoid/non-secure';
import { useRoutesStore } from '../../lib/stores/routes-store';
import { useWallsStore } from '../../lib/stores/walls-store';
import { colors } from '../../lib/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';

const HOLD_TYPES: HoldType[] = ['start', 'hand', 'foot', 'finish'];
const HOLD_SIZE_PX: Record<HoldSize, number> = { small: 16, medium: 24, large: 36 };
const HOLD_BORDER: Record<HoldSize, number> = { small: 2, medium: 3, large: 4 };

export default function EditorScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editRouteId = typeof edit === 'string' ? edit : null;
  const [holds, setHolds] = useState<Hold[]>([]);
  const [selectedType, setSelectedType] = useState<HoldType>('hand');
  const [selectedSize, setSelectedSize] = useState<HoldSize>('medium');
  const [showSequence, setShowSequence] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [routeGrade, setRouteGrade] = useState('');
  const [undoStack, setUndoStack] = useState<Hold[][]>([]);
  const { selectedWall, fetchWalls, setSelectedWall, getWallById } = useWallsStore();
  const { routes, addRoute, updateRoute } = useRoutesStore();
  const loadedRouteIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetchWalls();
  }, [fetchWalls]);

  useEffect(() => {
    if (!editRouteId) {
      loadedRouteIdRef.current = null;
      return;
    }

    if (loadedRouteIdRef.current === editRouteId) return;

    const route = routes.find((r) => r.id === editRouteId);
    if (!route) return;

    loadedRouteIdRef.current = editRouteId;
    const timer = setTimeout(() => {
      setRouteName(route.name || '');
      setRouteGrade(route.grade_v || '');
      setHolds(route.holds || []);
      setUndoStack([]);
      setShowSequence((route.holds || []).some((h) => h.sequence != null));

      if (route.wall_id) {
        const wall = getWallById(route.wall_id);
        if (wall) setSelectedWall(wall);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [editRouteId, routes, getWallById, setSelectedWall]);

  const canvasLayout = useRef({ width: 0, height: 0 });

  const handleCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    canvasLayout.current = { width, height };
  }, []);

  const handleCanvasPress = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      const { width, height } = canvasLayout.current;
      if (width === 0 || height === 0) return;

      const x = (locationX / width) * 100;
      const y = (locationY / height) * 100;

      const newHold: Hold = {
        id: `h-${Date.now()}`,
        x,
        y,
        type: selectedType,
        color: HOLD_COLORS[selectedType],
        sequence: showSequence ? holds.length + 1 : null,
        size: selectedSize,
      };

      setUndoStack((prev) => [...prev, holds]);
      setHolds((prev) => [...prev, newHold]);
    },
    [selectedType, selectedSize, showSequence, holds]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setHolds(prev);
  }, [undoStack]);

  const removeHold = useCallback((holdId: string) => {
    setHolds((prev) => {
      setUndoStack((s) => [...s, prev]);
      return prev.filter((h) => h.id !== holdId);
    });
  }, []);

  const clearHolds = () => {
    if (holds.length === 0) return;
    Alert.alert('Clear All', 'Remove all holds?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setUndoStack((s) => [...s, holds]);
          setHolds([]);
        },
      },
    ]);
  };

  const isEditMode = !!editRouteId;

  const handleSave = async () => {
    if (!selectedWall) {
      Alert.alert('Select a wall', 'Please select a wall before saving a route.');
      return;
    }
    const wallId = selectedWall.id;
    const wallImageUrl = selectedWall.image_url || undefined;

    if (isEditMode && editRouteId) {
      await updateRoute(editRouteId, {
        name: routeName.trim(),
        grade_v: routeGrade || undefined,
        holds,
        wall_id: wallId,
        wall_image_url: wallImageUrl,
      });
      Alert.alert('Updated!', `"${routeName}" updated with ${holds.length} holds.`);
      setSaveModalVisible(false);
      router.push('/(tabs)');
      return;
    }

    const route: Route = {
      id: nanoid(),
      user_id: 'local-user',
      user_name: 'You',
      wall_id: wallId,
      wall_image_url: wallImageUrl,
      name: routeName.trim(),
      grade_v: routeGrade || undefined,
      holds,
      is_public: true,
      view_count: 0,
      share_token: nanoid(10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      like_count: 0,
    };

    await addRoute(route);
    Alert.alert('Saved!', `"${routeName}" saved with ${holds.length} holds.`);
    setSaveModalVisible(false);
    setRouteName('');
    setRouteGrade('');
    setHolds([]);
    setUndoStack([]);
  };

  const holdCounts = holds.reduce(
    (acc, h) => {
      acc[h.type] = (acc[h.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: colors.card,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: undoStack.length > 0 ? `${colors.card}f2` : `${colors.card}99`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={handleUndo}
            disabled={undoStack.length === 0}
          >
            <Text style={{
              color: undoStack.length > 0 ? colors.text : `${colors.muted}80`,
              fontSize: 12,
              fontWeight: '600',
            }}>
              Undo
            </Text>
          </Pressable>

          {holds.length > 0 && (
            <View
              style={{
                backgroundColor: `${colors.card}f2`,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '500' }}>
                {holds.length} {holds.length === 1 ? 'hold' : 'holds'}
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={{
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: holds.length > 0 ? colors.primary : colors.border,
            shadowColor: holds.length > 0 ? colors.primary : 'transparent',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
          }}
          onPress={() => holds.length > 0 && setSaveModalVisible(true)}
          disabled={holds.length === 0}
        >
          <Text style={{ fontWeight: '600', color: holds.length > 0 ? colors.card : `${colors.muted}80` }}>
            {isEditMode ? 'Update' : 'Save'}
          </Text>
        </Pressable>
      </View>

      {!selectedWall && (
        <View style={{
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
        }}>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            No walls found in the database. Add one in Settings to start setting routes.
          </Text>
          <Pressable onPress={() => router.push('/settings')} style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>Open Settings</Text>
          </Pressable>
        </View>
      )}

      {/* Canvas */}
      <View
        style={{
          flex: 1,
          marginHorizontal: 12,
          marginBottom: 8,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: colors.card,
        }}
        onLayout={handleCanvasLayout}
        onStartShouldSetResponder={() => true}
        onResponderRelease={handleCanvasPress}
      >
        {selectedWall?.image_url ? (
          <Image
            source={{ uri: selectedWall.image_url }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : null}
        {/* Placeholder */}
        {holds.length === 0 && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: `${colors.border}e6`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 28 }}>👆</Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 14, fontWeight: '500' }}>Tap to place holds</Text>
            <Text style={{ color: `${colors.muted}80`, fontSize: 12, marginTop: 4 }}>Long-press a hold to remove it</Text>
          </View>
        )}

        {/* Hold count overlay */}
        {holds.length > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              right: 12,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
              zIndex: 10,
            }}
          >
            {Object.entries(holdCounts).map(([type, count]) => (
              <View
                key={type}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: colors.card,
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <View style={{ backgroundColor: HOLD_COLORS[type as HoldType], width: 8, height: 8, borderRadius: 4 }} />
                <Text style={{ color: colors.text, fontSize: 10, fontWeight: '500' }}>
                  {count} {type}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Rendered holds */}
        {holds.map((hold) => {
          const size = HOLD_SIZE_PX[hold.size];
          const bw = HOLD_BORDER[hold.size];
          return (
            <Pressable
              key={hold.id}
              onLongPress={() => removeHold(hold.id)}
              delayLongPress={400}
              style={{
                position: 'absolute',
                left: `${hold.x}%`,
                top: `${hold.y}%`,
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: bw,
                borderColor: hold.color,
                backgroundColor: hold.color + '33',
                transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }],
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: hold.color,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.35,
                shadowRadius: 6,
              }}
            >
              {showSequence && hold.sequence != null && (
                <Text
                  style={{
                    color: colors.card,
                    fontSize: size * 0.35,
                    fontWeight: '700',
                    textShadowColor: 'rgba(0,0,0,0.6)',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 3,
                  }}
                >
                  {hold.sequence}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Bottom Controls */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingBottom: 12,
          backgroundColor: colors.card,
        }}
      >
        {/* Hold Type Pills */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, marginTop: 8 }}>
          {HOLD_TYPES.map((type) => {
            const isSelected = selectedType === type;
            const color = HOLD_COLORS[type];
            return (
              <Pressable
                key={type}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: isSelected ? `${colors.primary}14` : colors.background,
                }}
                onPress={() => setSelectedType(type)}
              >
                <View style={{ backgroundColor: color, width: 10, height: 10, borderRadius: 5 }} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '500',
                    textTransform: 'capitalize',
                    color: isSelected ? colors.primary : colors.muted,
                  }}
                >
                  {type}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Size + Actions Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Size selector */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {(['small', 'medium', 'large'] as HoldSize[]).map((size) => {
              const isSelected = selectedSize === size;
              const dotSize = size === 'small' ? 8 : size === 'medium' ? 14 : 20;
              const bw = HOLD_BORDER[size];
              return (
                <Pressable
                  key={size}
                  style={{
                    width: 40,
                    height: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    backgroundColor: isSelected ? `${colors.primary}14` : colors.background,
                  }}
                  onPress={() => setSelectedSize(size)}
                >
                  <View
                    style={{
                      width: dotSize,
                      height: dotSize,
                      borderRadius: dotSize / 2,
                      borderWidth: bw,
                      borderColor: colors.primary,
                      backgroundColor: isSelected ? `${colors.primary}33` : 'transparent',
                    }}
                  />
                </Pressable>
              );
            })}
            <Text style={{ color: colors.muted, fontSize: 10, marginLeft: 4, textTransform: 'capitalize' }}>{selectedSize}</Text>
          </View>

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pressable
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor: showSequence ? `${colors.primary}14` : colors.background,
              }}
              onPress={() => setShowSequence((v) => !v)}
            >
              <Text style={{ fontWeight: '700', color: showSequence ? colors.primary : colors.muted }}>#</Text>
            </Pressable>
            <Pressable
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor: colors.background,
              }}
              onPress={clearHolds}
              disabled={holds.length === 0}
            >
              <Text style={{ color: holds.length > 0 ? colors.destructive : `${colors.muted}40`, fontSize: 12, fontWeight: '600' }}>Clear</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Save Modal */}
      <Modal
        visible={saveModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Pressable onPress={() => setSaveModalVisible(false)}>
                <Text style={{ fontSize: 16, color: colors.muted }}>Cancel</Text>
              </Pressable>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{isEditMode ? 'Update Route' : 'Save Route'}</Text>
              <Pressable onPress={handleSave} disabled={!routeName.trim()}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: routeName.trim() ? colors.primary : colors.border }}>
                  {isEditMode ? 'Update' : 'Save'}
                </Text>
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20 }}>
              {/* Route Name */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 }}>Route Name</Text>
              <TextInput
                style={{
                  backgroundColor: colors.border,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontSize: 16,
                  color: colors.text,
                  marginBottom: 20,
                }}
                placeholder="e.g., Crimpy Corner"
                placeholderTextColor={colors.muted}
                value={routeName}
                onChangeText={setRouteName}
                autoFocus
              />

              {/* Grade */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 4 }}>Grade (Your Suggestion)</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
                This is your suggested grade as the setter
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: !routeGrade ? colors.text : colors.border,
                    }}
                    onPress={() => setRouteGrade('')}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: !routeGrade ? colors.card : colors.muted,
                        fontWeight: !routeGrade ? '500' : '400',
                      }}
                    >
                      Ungraded
                    </Text>
                  </Pressable>
                  {V_GRADES.map((g) => (
                    <Pressable
                      key={g}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: routeGrade === g ? colors.text : colors.border,
                      }}
                      onPress={() => setRouteGrade(g)}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: routeGrade === g ? colors.card : colors.muted,
                          fontWeight: routeGrade === g ? '500' : '400',
                        }}
                      >
                        {g}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              {/* Hold Summary */}
              <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
                  Hold Summary — {holds.length} total
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                  {HOLD_TYPES.map((type) => {
                    const count = holds.filter((h) => h.type === type).length;
                    return (
                      <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ backgroundColor: HOLD_COLORS[type], width: 14, height: 14, borderRadius: 7 }} />
                        <Text style={{ fontSize: 14, color: colors.muted }}>
                          <Text style={{ fontWeight: '600' }}>{count}</Text> {type}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
