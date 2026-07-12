import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { nanoid } from 'nanoid/non-secure';
import {
  HOLD_COLORS,
  HOLD_BORDER_WIDTH,
  calculateDisplayGrade,
  type Hold,
  type Route,
  type Comment,
} from '@climbset/shared';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { useUserStore } from '../../lib/stores/user-store';
import { useRoutesStore } from '../../lib/stores/routes-store';

function formatTimeAgo(dateStr: string, now: number): string {
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function RouteCommentSection({
  title,
  comments,
  emptyMessage,
  now,
  currentUserId,
  onDelete,
  marginTop,
}: {
  title: string;
  comments: Comment[];
  emptyMessage: string;
  now: number;
  currentUserId: string;
  onDelete: (commentId: string) => void | Promise<void>;
  marginTop: number;
}) {
  return (
    <View style={{ marginTop }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 8 }}>{title}</Text>
      {comments.length === 0 ? (
        <Text style={{ fontSize: 12, color: colors.muted }}>{emptyMessage}</Text>
      ) : (
        comments.map((comment) => {
          const isOwner = comment.user_id === currentUserId;
          return (
            <View key={comment.id} style={{ borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: colors.card }}>
              <Text style={{ fontSize: 13, color: colors.text }}>{comment.content}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
                {comment.user_name || 'Anonymous'} • {formatTimeAgo(comment.created_at, now)}
              </Text>
              {isOwner && (
                <Pressable onPress={() => onDelete(comment.id)} style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>Delete</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

export default function SharedRouteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const shareToken = typeof token === 'string' ? token : '';
  const { user, profile } = useUserStore();
  const { addComment, deleteComment } = useRoutesStore();
  const [route, setRoute] = useState<Route | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageAspect, setImageAspect] = useState(16 / 9);
  const [commentText, setCommentText] = useState('');
  const [commentIsBeta, setCommentIsBeta] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const imageUrl = useMemo(() => {
    if (!route) return '';
    return route.wall_image_url || '';
  }, [route]);

  useEffect(() => {
    if (!imageUrl) return;
    Image.getSize(
      imageUrl,
      (width, height) => {
        if (width > 0 && height > 0) {
          setImageAspect(width / height);
        }
      },
      () => setImageAspect(16 / 9)
    );
  }, [imageUrl]);

  useEffect(() => {
    const loadRoute = async () => {
      if (!shareToken) {
        setError('Invalid share link');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      setNow(Date.now());

      try {
        let result = await supabase
          .from('routes')
          .select('*, ascents (*), comments (*)')
          .eq('share_token', shareToken)
          .limit(1)
          .single();

        if (result.error) {
          result = await supabase
            .from('routes')
            .select('*, ascents (*)')
            .eq('share_token', shareToken)
            .limit(1)
            .single();
        }

        if (result.error || !result.data) {
          setError('Route not found');
          setIsLoading(false);
          return;
        }

        const nextRoute = {
          ...result.data,
          holds: result.data.holds || [],
          ascents: result.data.ascents || [],
          comments: result.data.comments || [],
        } as Route;

        setRoute(nextRoute);
        setIsLoading(false);

        const nextCount = (nextRoute.view_count || 0) + 1;
        await supabase.from('routes').update({ view_count: nextCount }).eq('id', nextRoute.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load route');
        setIsLoading(false);
      }
    };

    loadRoute();
  }, [shareToken]);

  const displayGrade = useMemo(() => {
    if (!route) return undefined;
    return calculateDisplayGrade(route.grade_v, route.ascents || []);
  }, [route]);

  const handleAddComment = async () => {
    if (!route || !commentText.trim()) return;
    setIsPosting(true);
    const comment: Comment = {
      id: nanoid(),
      route_id: route.id,
      user_id: user?.id || 'local-user',
      user_name: profile?.full_name || user?.displayName || 'Climber',
      content: commentText.trim(),
      is_beta: commentIsBeta,
      created_at: new Date().toISOString(),
    };

    await addComment(route.id, comment);
    setRoute((prev) => prev ? { ...prev, comments: [...(prev.comments || []), comment] } : prev);
    setCommentText('');
    setCommentIsBeta(false);
    setIsPosting(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!route) return;
    await deleteComment(route.id, commentId);
    setRoute((prev) => prev ? { ...prev, comments: (prev.comments || []).filter((c) => c.id !== commentId) } : prev);
  };

  const getHoldLabel = (type: Hold['type']) => {
    if (type === 'start') return 'S';
    if (type === 'finish') return 'F';
    return null;
  };
  const comments = route?.comments || [];
  const betaComments = comments.filter((comment) => comment.is_beta);
  const regularComments = comments.filter((comment) => !comment.is_beta);
  const currentUserId = user?.id || 'local-user';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Pressable
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={() => router.back()}
          >
            <Text style={{ color: colors.muted, fontSize: 18 }}>‹</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Shared Route</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>View a shared route from a link</Text>
        </View>

        {isLoading ? (
          <View style={{ paddingTop: 48, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.muted, marginTop: 12 }}>Loading route...</Text>
          </View>
        ) : error ? (
          <View style={{ paddingTop: 48, alignItems: 'center' }}>
            <Text style={{ color: colors.muted }}>{error}</Text>
          </View>
        ) : route ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: colors.card }}>
              <View style={{ width: '100%', aspectRatio: imageAspect, backgroundColor: colors.border }}>
                {imageUrl ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.muted }}>No wall image</Text>
                  </View>
                )}

                <View style={{ position: 'absolute', inset: 0 }} pointerEvents="none">
                  {(route.holds || []).map((hold) => {
                    const size = hold.size === 'small' ? 24 : hold.size === 'large' ? 56 : 36;
                    const label = getHoldLabel(hold.type);
                    return (
                      <View
                        key={hold.id}
                        style={{
                          position: 'absolute',
                          left: `${hold.x}%`,
                          top: `${hold.y}%`,
                          width: size,
                          height: size,
                          borderRadius: size / 2,
                          borderWidth: HOLD_BORDER_WIDTH[hold.size],
                          borderColor: HOLD_COLORS[hold.type],
                          backgroundColor: `${HOLD_COLORS[hold.type]}40`,
                          transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }],
                          alignItems: 'center',
                          justifyContent: 'center',
                          shadowColor: HOLD_COLORS[hold.type],
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.35,
                          shadowRadius: 8,
                        }}
                      >
                        {label ? (
                          <Text
                            style={{
                              color: colors.card,
                              fontWeight: '700',
                              fontSize: size * 0.35,
                              textShadowColor: 'rgba(0,0,0,0.6)',
                              textShadowOffset: { width: 0, height: 1 },
                              textShadowRadius: 3,
                            }}
                          >
                            {label}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={{ paddingTop: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{route.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                {displayGrade ? (
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primary }}>
                    <Text style={{ color: colors.card, fontWeight: '700', fontSize: 12 }}>{displayGrade}</Text>
                  </View>
                ) : null}
                {route.user_name ? (
                  <Text style={{ fontSize: 12, color: colors.muted }}>by {route.user_name}</Text>
                ) : null}
              </View>
            </View>

            <View style={{ marginTop: 20, borderRadius: 16, padding: 12, backgroundColor: colors.card }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 6 }}>Stats</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{route.holds.length}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Holds</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{route.like_count || 0}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Likes</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{route.ascents?.length || 0}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted }}>Sends</Text>
                </View>
              </View>
            </View>

            <RouteCommentSection
              title="Beta"
              comments={betaComments}
              emptyMessage="No beta yet."
              now={now}
              currentUserId={currentUserId}
              onDelete={handleDeleteComment}
              marginTop={20}
            />

            <RouteCommentSection
              title="Comments"
              comments={regularComments}
              emptyMessage="No comments yet."
              now={now}
              currentUserId={currentUserId}
              onDelete={handleDeleteComment}
              marginTop={16}
            />

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
                  backgroundColor: colors.background,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text,
                  borderWidth: 1,
                  borderColor: colors.border,
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
                    opacity: isPosting || !commentText.trim() ? 0.6 : 1,
                  }}
                  onPress={handleAddComment}
                  disabled={isPosting || !commentText.trim()}
                >
                  <Text style={{ color: colors.card, fontWeight: '600' }}>
                    {isPosting ? 'Posting...' : 'Post'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
