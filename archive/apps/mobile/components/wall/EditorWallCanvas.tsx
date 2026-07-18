import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Hold, HoldSize } from '@climbset/shared';
import { aspectFitRect, percentageToPoint, pointToPercentage, type ImageRect } from './editor-geometry';
import { useTheme } from '../../lib/theme';

const markerSize: Record<HoldSize, number> = { small: 18, medium: 28, large: 42 };
const markerBorder: Record<HoldSize, number> = { small: 2, medium: 3, large: 4 };

type Props = {
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  holds: Hold[];
  showSequence: boolean;
  onTap: (point: { x: number; y: number }) => void;
  onLongPress: (point: { x: number; y: number }) => void;
  onImageStateChange?: (state: 'loading' | 'ready' | 'error') => void;
  children?: ReactNode;
};

export default function EditorWallCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  holds,
  showSequence,
  onTap,
  onLongPress,
  onImageStateChange,
  children,
}: Props) {
  const { colors } = useTheme();
  const [container, setContainer] = useState({ width: 0, height: 0 });
  const [imageError, setImageError] = useState(!imageUrl);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [resolvedDimensions, setResolvedDimensions] = useState<{ width: number; height: number } | null>(
    imageWidth && imageHeight ? { width: imageWidth, height: imageHeight } : null,
  );

  useEffect(() => {
    let active = true;
    const hasImage = Boolean(imageUrl);
    const resetState = setTimeout(() => {
      if (!active) return;
      setImageError(!hasImage);
      setImageAttempt(0);
      onImageStateChange?.(hasImage ? 'loading' : 'error');
      if (!imageWidth || !imageHeight) setResolvedDimensions(null);
    }, 0);
    const setProvidedDimensions = imageWidth && imageHeight
      ? setTimeout(() => { if (active) setResolvedDimensions({ width: imageWidth, height: imageHeight }); }, 0)
      : undefined;
    if (!(imageWidth && imageHeight) && imageUrl) {
      Image.getSize(
        imageUrl,
        (width, height) => { if (active) setResolvedDimensions({ width, height }); },
        () => { if (active) setResolvedDimensions(null); },
      );
    }
    return () => {
      active = false;
      clearTimeout(resetState);
      clearTimeout(setProvidedDimensions);
    };
  }, [imageHeight, imageUrl, imageWidth, onImageStateChange]);

  const rect = useMemo<ImageRect>(() => resolvedDimensions
    ? aspectFitRect(resolvedDimensions.width, resolvedDimensions.height, container.width, container.height)
    : { left: 0, top: 0, width: 0, height: 0 }, [container, resolvedDimensions]);
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainer({ width, height });
  };
  const handleTap = (event: GestureResponderEvent) => {
    if (imageError || !resolvedDimensions) return;
    const point = pointToPercentage(event.nativeEvent.locationX, event.nativeEvent.locationY, rect);
    if (point) onTap(point);
  };
  const handleLongPress = (event: GestureResponderEvent) => {
    if (imageError || !resolvedDimensions) return;
    const point = pointToPercentage(event.nativeEvent.locationX, event.nativeEvent.locationY, rect);
    if (!point) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onLongPress(point);
  };
  const retryImage = () => {
    setImageError(false);
    setResolvedDimensions(null);
    setImageAttempt((attempt) => attempt + 1);
    onImageStateChange?.('loading');
  };

  const imageReady = Boolean(resolvedDimensions && !imageError);
  return (
    <View style={[styles.container, { backgroundColor: colors.card }]} onLayout={handleLayout} testID="editor-wall-canvas">
      <Pressable
        style={StyleSheet.absoluteFill}
        delayLongPress={500}
        disabled={!imageReady}
        onPress={handleTap}
        onLongPress={handleLongPress}
        accessibilityRole="image"
        accessibilityState={{ disabled: !imageReady }}
        accessibilityLabel={imageReady ? 'Wall canvas' : imageError ? 'Wall image unavailable' : 'Loading wall image dimensions'}
        accessibilityHint={imageReady ? 'Tap an empty area to add a hold, tap a hold to cycle its type, or long press a hold to remove it.' : undefined}
      >
        {imageUrl ? <Image
          key={`${imageUrl}-${imageAttempt}`}
          source={{ uri: imageUrl }}
          alt="Climbing wall"
          resizeMode="contain"
          onLoadStart={() => onImageStateChange?.('loading')}
          onLoad={(event) => {
            const source = event.nativeEvent.source;
            if (source?.width && source?.height) {
              setResolvedDimensions({ width: source.width, height: source.height });
              setImageError(false);
              onImageStateChange?.('ready');
            }
          }}
          onError={() => {
            setImageError(true);
            setResolvedDimensions(null);
            onImageStateChange?.('error');
          }}
          style={[styles.image, { left: rect.left, top: rect.top, width: rect.width, height: rect.height }]}
        /> : null}
        {imageReady ? holds.map((hold) => {
          const size = markerSize[hold.size];
          const point = percentageToPoint(hold.x, hold.y, rect);
          return (
            <View
              key={hold.id}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: point.x - size / 2,
                top: point.y - size / 2,
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: markerBorder[hold.size],
                borderColor: hold.color,
                backgroundColor: `${hold.color}55`,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: hold.color,
                shadowOpacity: 0.4,
                shadowRadius: 6,
              }}
            >
              {showSequence && hold.sequence != null ? <Text style={{ color: '#fff', fontWeight: '800', fontSize: Math.max(9, size * 0.32), textShadowColor: '#000', textShadowRadius: 3 }}>{hold.sequence}</Text> : null}
            </View>
          );
        }) : null}
        {imageReady ? children : null}
      </Pressable>
      {imageError ? <View testID="editor-wall-unavailable" accessible accessibilityRole="alert" accessibilityLabel="Wall image unavailable. Choose another wall or retry loading." style={styles.unavailable}>
        <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>Wall image unavailable</Text>
        <Text style={{ color: colors.muted, marginTop: 6, textAlign: 'center' }}>Choose another wall or retry loading.</Text>
        <Pressable testID="editor-wall-retry" accessibilityRole="button" accessibilityLabel="Retry loading wall image" onPress={retryImage} style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary }}>
          <Text style={{ color: colors.card, fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', height: '100%', position: 'relative' },
  image: { position: 'absolute' },
  unavailable: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
