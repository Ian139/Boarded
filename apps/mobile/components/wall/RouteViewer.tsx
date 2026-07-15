import React, { useEffect, useState } from 'react';
import { Image, Text, View, type LayoutChangeEvent } from 'react-native';
import { HOLD_BORDER_WIDTH, HOLD_COLORS, type Hold, type Route } from '@climbset/shared';
import { useTheme } from '../../lib/theme';
import { aspectFitRect, percentageToPoint } from './editor-geometry';

type RouteViewerProps = { route: Route; imageUrl?: string; imageWidth?: number; imageHeight?: number; testID?: string };
const holdLabel = (type: Hold['type']) => type === 'start' ? 'S' : type === 'finish' ? 'Fin' : type === 'hand' ? 'H' : 'Fo';

/** Read-only wall image using the editor's intrinsic-image/letterbox rectangle. */
export function RouteViewer({ route, imageUrl, imageWidth, imageHeight, testID = 'route-viewer' }: RouteViewerProps) {
  const { colors } = useTheme();
  const snapshotWidth = imageWidth || route.wall?.image_width;
  const snapshotHeight = imageHeight || route.wall?.image_height;
  const dimensionKey = `${imageUrl || ''}:${snapshotWidth || 0}x${snapshotHeight || 0}`;
  const [intrinsic, setIntrinsic] = useState({ width: snapshotWidth || 0, height: snapshotHeight || 0 });
  const [resolvedKey, setResolvedKey] = useState(snapshotWidth && snapshotHeight ? dimensionKey : '');
  const [dimensionError, setDimensionError] = useState(false);
  const [container, setContainer] = useState({ width: 0, height: 0 });
  useEffect(() => {
    let cancelled = false;
    const known = { width: snapshotWidth || 0, height: snapshotHeight || 0 };
    // Reset intrinsic state when switching route images; stale markers must never survive identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntrinsic(known);
    setDimensionError(false);
    setResolvedKey(known.width > 0 && known.height > 0 ? dimensionKey : '');
    if (!imageUrl || (known.width > 0 && known.height > 0)) return () => { cancelled = true; };
    Image.getSize(imageUrl, (width, height) => {
      if (!cancelled) {
        setIntrinsic({ width, height });
        setResolvedKey(dimensionKey);
      }
    }, () => { if (!cancelled) setDimensionError(true); });
    return () => { cancelled = true; };
  }, [dimensionKey, imageUrl, snapshotHeight, snapshotWidth]);
  const hasDimensions = resolvedKey === dimensionKey && intrinsic.width > 0 && intrinsic.height > 0;
  const rect = aspectFitRect(intrinsic.width, intrinsic.height, container.width, container.height);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== container.width || height !== container.height) setContainer({ width, height });
  };
  return <View testID={testID} accessibilityLabel={`${route.name} wall route`} style={{ backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' }}>
    {!imageUrl ? <View testID="route-viewer-no-image" style={{ minHeight: 200, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>No wall image</Text></View> : dimensionError ? <View testID="route-viewer-image-error" accessible accessibilityLabel="Wall image unavailable" style={{ minHeight: 200, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>Wall image unavailable</Text></View> : !hasDimensions ? <View testID="route-viewer-image-loading" accessible accessibilityLabel="Loading wall image" style={{ minHeight: 200, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>Loading wall image…</Text></View> : <View onLayout={onLayout} style={{ width: '100%', aspectRatio: intrinsic.width / intrinsic.height, backgroundColor: colors.border }}>
      <Image accessibilityLabel={`${route.name} wall`} alt={`${route.name} wall`} onError={() => setDimensionError(true)} source={{ uri: imageUrl }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        {(route.holds || []).map((hold) => {
          const size = hold.size === 'small' ? 24 : hold.size === 'large' ? 56 : 36;
          const point = percentageToPoint(hold.x, hold.y, rect);
          const color = HOLD_COLORS[hold.type];
          return <View key={hold.id} testID={`hold-marker-${hold.id}`} accessible accessibilityLabel={`${hold.type} hold${hold.sequence ? ` ${hold.sequence}` : ''}`} style={{ position: 'absolute', left: point.x, top: point.y, width: size, height: size, borderRadius: size / 2, borderWidth: HOLD_BORDER_WIDTH[hold.size], borderColor: color, backgroundColor: `${color}40`, transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }], alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.card, fontWeight: '700', fontSize: size * 0.34, textShadowColor: '#000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>{holdLabel(hold.type)}</Text></View>;
        })}
      </View>
    </View>}
  </View>;
}
