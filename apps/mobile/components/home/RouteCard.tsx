import { Image, Pressable, Text, View } from 'react-native';
import { HOLD_COLORS, type Route } from '@climbset/shared';
import { calculateDisplayGrade } from '@climbset/shared';
import { useTheme } from '../../lib/theme';

type Props = { route: Route; wallName?: string; wallImage?: string; currentUserId: string; isExpanded: boolean; onOpen: () => void; onLike: () => void; onLog: () => void; onShare: () => void; onExpand: () => void };

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : `${Math.floor(days / 7)}w`;
}

export function RouteCard({ route, wallName, wallImage, currentUserId, isExpanded, onOpen, onLike, onLog, onShare, onExpand }: Props) {
  const { colors } = useTheme();
  const grade = calculateDisplayGrade(route.grade_v, route.ascents || []);
  const ascents = route.ascents || [];
  const liked = Boolean(route.is_liked);
  const climbed = ascents.some((ascent) => ascent.user_id === currentUserId);
  const holdsByType = route.holds.reduce<Record<string, number>>((counts, hold) => ({ ...counts, [hold.type]: (counts[hold.type] || 0) + 1 }), {});
  const ratings = ascents.map((ascent) => ascent.rating).filter((rating): rating is number => typeof rating === 'number');
  const average = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : route.rating || 0;
  return (
    <View testID={`route-card-${route.id}`} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Pressable testID={`route-card-open-${route.id}`} accessibilityRole="button" accessibilityLabel={`Open route ${route.name}, ${grade || 'ungraded'}`} accessibilityHint="Shows route details and comments" onPress={onOpen} style={{ paddingVertical: 14, minHeight: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.border }}>{wallImage ? <Image accessibilityLabel={`${wallName || 'Wall'} thumbnail`} alt={`${wallName || 'Wall'} thumbnail`} source={{ uri: wallImage }} style={{ width: '100%', height: '100%' }} /> : <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 20 }}>Wall</Text>}</View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' }}>{route.name}</Text>{grade && <Text testID={`route-grade-${route.id}`} style={{ color: colors.primary, fontWeight: '700' }}>{grade}</Text>}</View>
            <Text numberOfLines={1} style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>{route.user_name || 'Anonymous'}{wallName ? ` · ${wallName}` : ''}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{Object.entries(holdsByType).map(([type, count]) => <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: HOLD_COLORS[type as keyof typeof HOLD_COLORS] }} /><Text style={{ color: colors.muted, fontSize: 12 }}>{count}</Text></View>)}<Text style={{ color: colors.muted, fontSize: 12 }}>{route.holds.length} holds</Text></View><Text style={{ color: colors.muted, fontSize: 11 }}>{timeAgo(route.created_at)}</Text></View>
          </View>
        </View>
      </Pressable>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border }}>
        <Pressable testID={`route-like-${route.id}`} accessibilityRole="button" accessibilityLabel={liked ? `Unlike ${route.name}` : `Like ${route.name}`} accessibilityState={{ selected: liked }} onPress={onLike} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: liked ? colors.destructive : colors.muted, fontWeight: '600' }}>{liked ? '♥' : '♡'} {route.like_count || 0}</Text></Pressable>
        <Pressable testID={`route-log-${route.id}`} accessibilityRole="button" accessibilityLabel={climbed ? `Log another climb on ${route.name}` : `Log climb on ${route.name}`} onPress={onLog} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: climbed ? colors.secondary : colors.muted, fontWeight: '600' }}>{climbed ? '✓' : '○'} Log</Text></Pressable>
        <Pressable testID={`route-share-${route.id}`} accessibilityRole="button" accessibilityLabel={`Share ${route.name}`} onPress={onShare} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted, fontWeight: '600' }}>↗ Share</Text></Pressable>
        <Pressable testID={`route-expand-${route.id}`} accessibilityRole="button" accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} route statistics`} accessibilityState={{ expanded: isExpanded }} onPress={onExpand} style={{ width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>{isExpanded ? '⌃' : '⌄'}</Text></Pressable>
      </View>
      {isExpanded && <View testID={`route-stats-${route.id}`} style={{ margin: 8, padding: 12, borderRadius: 12, backgroundColor: colors.card, flexDirection: 'row', justifyContent: 'space-around' }}>{[['Grade', grade || '—'], ['Rating', average ? average.toFixed(1) : '—'], ['Sends', String(ascents.length)], ['Likes', String(route.like_count || 0)], ['Views', String(route.view_count || 0)]].map(([label, value]) => <View key={label} accessible accessibilityLabel={`${label} ${value}`} style={{ alignItems: 'center' }}><Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text><Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 3 }}>{value}</Text></View>)}</View>}
      {isExpanded && <View testID={`route-climbers-${route.id}`} accessible accessibilityLabel={`Recent climbers: ${ascents.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3).map((ascent) => ascent.user_name || 'Climber').join(', ') || 'No recent climbers'}`} style={{ marginHorizontal: 8, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: colors.card }}><Text style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Recent climbers</Text>{ascents.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3).map((ascent) => <Text key={ascent.id} style={{ color: colors.text, marginTop: 4 }}>{ascent.user_name || 'Climber'} · {timeAgo(ascent.created_at)}</Text>)}{!ascents.length ? <Text style={{ color: colors.muted, marginTop: 4 }}>No recent climbers yet</Text> : null}</View>}
    </View>
  );
}
