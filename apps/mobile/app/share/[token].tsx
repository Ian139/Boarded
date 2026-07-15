import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { calculateDisplayGrade, type Comment, type Route } from '@climbset/shared';
import { useTheme } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../lib/stores/user-store';
import { useRoutesStore } from '../../lib/stores/routes-store';
import { useWallsStore } from '../../lib/stores/walls-store';
import { Button, InlineNotice } from '../../components/ui';
import { RouteViewer } from '../../components/wall/RouteViewer';
import { CommentsSection } from '../../components/route/CommentsSection';

const shareUrl = (token: string) => {
  const base = process.env.EXPO_PUBLIC_APP_URL || process.env.EXPO_PUBLIC_WEB_URL;
  return base ? `${base.replace(/\/$/, '')}/share/${token}` : `climbset://share/${token}`;
};
const localId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const hex = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
};

export default function SharedRouteScreen() {
  const { colors } = useTheme();
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  const shareToken = (Array.isArray(token) ? token[0] : token || '').trim();
  const { user, profile, isModerator } = useUserStore();
  const { walls } = useWallsStore();
  const { addComment, deleteComment, updateComment } = useRoutesStore();
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const currentUserId = user?.id || 'local-user';
  const fallbackWall = route ? walls.find((wall) => wall.id === route.wall_id) || walls[0] : undefined;
  const imageUrl = route?.wall_image_url || fallbackWall?.image_url || '';
  const imageWidth = route?.wall_image_width || fallbackWall?.image_width;
  const imageHeight = route?.wall_image_height || fallbackWall?.image_height;
  const displayGrade = useMemo(() => route ? calculateDisplayGrade(route.grade_v, route.ascents || []) : undefined, [route]);

  const viewIncrementedToken = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!shareToken) { setError('Invalid share link'); setLoading(false); return; }
      setLoading(true); setError(null);
      try {
        let result = await supabase.from('routes').select('*, ascents (*), comments (*)').eq('share_token', shareToken).eq('is_public', true).limit(1).single();
        if (result.error) result = await supabase.from('routes').select('*, ascents (*)').eq('share_token', shareToken).eq('is_public', true).limit(1).single();
        if (result.error || !result.data) { if (!cancelled) { setError('Route not found'); setLoading(false); } return; }
        const { data: likes, error: likesError } = await supabase.from('route_likes').select('user_id').eq('route_id', result.data.id);
        if (likesError) throw likesError;
        const likedBy = (likes || []).map((like) => like.user_id);
        const next = { ...result.data, holds: result.data.holds || [], ascents: result.data.ascents || [], comments: result.data.comments || [], liked_by: likedBy, like_count: likedBy.length, is_liked: likedBy.includes(currentUserId) } as Route;
        if (!cancelled) { setRoute(next); setLoading(false); }
        if (viewIncrementedToken.current !== shareToken) {
          const { data: nextCount, error: viewError } = await supabase.rpc('increment_route_view', { target_route_id: next.id });
          if (!viewError && typeof nextCount === 'number') {
            viewIncrementedToken.current = shareToken;
            if (!cancelled) setRoute((value) => value ? { ...value, view_count: nextCount } : value);
          }
        }
      } catch (cause) { if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Failed to load route'); setLoading(false); } }
    };
    load();
    return () => { cancelled = true; };
  }, [currentUserId, shareToken, retry]);

  const submitComment = async (content: string, isBeta: boolean) => {
    if (!route) return false;
    if (!user) {
      Alert.alert('Sign in required', 'Log in to comment on routes.');
      return false;
    }
    const comment: Comment = { id: localId(), route_id: route.id, user_id: user.id, user_name: profile?.full_name || user.displayName || 'Climber', content, is_beta: isBeta, created_at: new Date().toISOString() };
    const inStore = useRoutesStore.getState().routes.some((item) => item.id === route.id);
    if (inStore) {
      if (!(await addComment(route.id, comment))) return false;
    } else {
      const { error: insertError } = await supabase.from('comments').insert({ id: comment.id, route_id: route.id, user_id: user.id, user_name: comment.user_name, content: comment.content, is_beta: comment.is_beta });
      if (insertError) throw insertError;
    }
    setRoute((value) => value ? { ...value, comments: [...(value.comments || []), comment] } : value);
    return true;
  };
  const removeComment = async (commentId: string) => {
    if (!route) return false;
    const inStore = useRoutesStore.getState().routes.some((item) => item.id === route.id);
    if (inStore) {
      if (!(await deleteComment(route.id, commentId))) return false;
    } else {
      const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId);
      if (deleteError) throw deleteError;
    }
    setRoute((value) => value ? { ...value, comments: (value.comments || []).filter((comment) => comment.id !== commentId) } : value);
    return true;
  };
  const editComment = async (commentId: string, content: string, isBeta: boolean) => {
    if (!route) return false;
    const inStore = useRoutesStore.getState().routes.some((item) => item.id === route.id);
    if (inStore) {
      if (!(await updateComment(route.id, commentId, content, isBeta))) return false;
    } else {
      const { error: updateError } = await supabase.from('comments').update({ content, is_beta: isBeta }).eq('id', commentId);
      if (updateError) throw updateError;
    }
    setRoute((value) => value ? { ...value, comments: (value.comments || []).map((comment) => comment.id === commentId ? { ...comment, content, is_beta: isBeta } : comment) } : value);
    return true;
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  return <View testID="shared-route-screen" style={{ flex: 1, backgroundColor: colors.background }}><View style={{ minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border }}><Pressable testID="shared-route-back" accessibilityRole="button" accessibilityLabel="Back to routes" onPress={goBack} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 16 }}>‹ Back</Text></Pressable><Text accessibilityRole="header" style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Shared Route</Text><View style={{ width: 60 }} /></View>
    {loading ? <View testID="shared-route-loading" accessible accessibilityRole="progressbar" accessibilityLabel="Loading route" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /><Text style={{ color: colors.muted, marginTop: 12 }}>Loading route...</Text></View> : error ? <View testID="shared-route-error" style={{ flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' }}><InlineNotice tone="error" message={error} /><Button testID="shared-route-retry" label="Retry" variant="outline" onPress={() => setRetry((value) => value + 1)} /><Button testID="shared-route-home" label="Browse routes" variant="ghost" onPress={() => router.replace('/(tabs)')} /></View> : route ? <ScrollView testID="shared-route-content" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}><RouteViewer route={route} imageUrl={imageUrl} imageWidth={imageWidth} imageHeight={imageHeight} testID="shared-route-viewer" /><Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 16 }}>{route.name}</Text><Text style={{ color: colors.muted, marginTop: 4 }}>{displayGrade || 'Ungraded'} · {route.user_name || 'Anonymous'}</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}><Button testID="shared-route-share" label="Share" onPress={() => Share.share({ message: shareUrl(shareToken), url: shareUrl(shareToken) })} /><Button testID="shared-route-home-action" label="Browse routes" variant="outline" onPress={() => router.replace('/(tabs)')} /></View><View testID="shared-route-stats" style={{ marginTop: 18, padding: 14, borderRadius: 14, backgroundColor: colors.card, flexDirection: 'row', justifyContent: 'space-around' }}>{[['Holds', route.holds.length], ['Sends', route.ascents?.length || 0], ['Likes', route.like_count || 0], ['Views', route.view_count || 0]].map(([label, value]) => <View key={String(label)} accessible accessibilityLabel={`${label} ${value}`} style={{ alignItems: 'center' }}><Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text><Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 4 }}>{value}</Text></View>)}</View><CommentsSection comments={route.comments} currentUserId={currentUserId} isModerator={isModerator} onSubmit={submitComment} onDelete={removeComment} onUpdate={editComment} testID="shared-route-comments" /></ScrollView> : null}
  </View>;
}
