import { canManageComment, isCommentValid } from './comment-policy';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import type { Comment } from '@climbset/shared';
import { useTheme } from '../../lib/theme';

type CommentsSectionProps = {
  comments?: Comment[];
  currentUserId: string;
  isModerator?: boolean;
  onSubmit: (content: string, isBeta: boolean) => Promise<boolean | void>;
  onDelete: (commentId: string) => Promise<boolean | void>;
  onUpdate?: (commentId: string, content: string, isBeta: boolean) => Promise<boolean | void>;
  testID?: string;
};

const ago = (value: string) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

export function CommentsSection({ comments = [], currentUserId, isModerator = false, onSubmit, onDelete, onUpdate, testID = 'comments-section' }: CommentsSectionProps) {
  const { colors } = useTheme();
  const warningColor = (colors as typeof colors & { warning?: string }).warning ?? colors.accent;
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [isBeta, setIsBeta] = useState(false);
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState<Comment | null>(null);
  const [editText, setEditText] = useState('');
  const [editBeta, setEditBeta] = useState(false);
  const beta = useMemo(() => comments.filter((comment) => comment.is_beta).sort((a, b) => b.created_at.localeCompare(a.created_at)), [comments]);
  const discussion = useMemo(() => comments.filter((comment) => !comment.is_beta).sort((a, b) => b.created_at.localeCompare(a.created_at)), [comments]);

  const submit = async () => {
    const value = text.trim();
    if (!isCommentValid(value) || posting) return;
    setPosting(true);
    try {
      const submitted = await onSubmit(value, isBeta);
      if (submitted !== false) {
        setText('');
        setIsBeta(false);
      }
    } finally {
      setPosting(false);
    }
  };
  const saveEdit = async () => {
    const value = editText.trim();
    if (!editing || !isCommentValid(value) || !onUpdate) return;
    setPosting(true);
    try { const saved = await onUpdate(editing.id, value, editBeta); if (saved !== false) { setEditing(null); setEditText(''); } } finally { setPosting(false); }
  };
  const renderComment = (comment: Comment, betaCard: boolean) => {
    const canManage = canManageComment(comment, currentUserId, isModerator);
    const warningColor = (colors as typeof colors & { warning?: string }).warning ?? colors.accent;
    return (
      <View key={comment.id} testID={`comment-${comment.id}`} style={{ borderRadius: 12, padding: 12, marginTop: 8, backgroundColor: betaCard ? `${warningColor}18` : colors.card, borderWidth: betaCard ? 1 : 0, borderColor: betaCard ? warningColor : 'transparent' }}>
        <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{comment.content}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>{comment.user_name || 'Anonymous'} · {ago(comment.created_at)}</Text>
        {canManage && <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          {onUpdate && <Pressable testID={`comment-edit-${comment.id}`} accessibilityRole="button" accessibilityLabel={`Edit comment by ${comment.user_name || 'anonymous'}`} onPress={() => { setEditing(comment); setEditText(comment.content); setEditBeta(comment.is_beta); }} hitSlop={8}><Text style={{ color: colors.primary, fontWeight: '600' }}>Edit</Text></Pressable>}
          <Pressable testID={`comment-delete-${comment.id}`} accessibilityRole="button" accessibilityLabel={`Delete comment by ${comment.user_name || 'anonymous'}`} onPress={() => onDelete(comment.id)} hitSlop={8}><Text style={{ color: colors.destructive, fontWeight: '600' }}>Delete</Text></Pressable>
        </View>}
      </View>
    );
  };

  return (
    <View testID={testID} style={{ marginTop: 20 }}>
      <Pressable testID="comments-toggle" accessibilityRole="button" accessibilityLabel="Beta and comments" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>Beta & Comments</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{comments.length} · {expanded ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {expanded && <View>
        <Text style={{ color: warningColor, fontSize: 13, fontWeight: '700', marginTop: 8 }}>Beta ({beta.length})</Text>
        {beta.length ? beta.map((comment) => renderComment(comment, true)) : <Text style={{ color: colors.muted, marginTop: 8 }}>No beta yet. Share some beta!</Text>}
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 18 }}>Discussion ({discussion.length})</Text>
        {discussion.length ? discussion.map((comment) => renderComment(comment, false)) : <Text style={{ color: colors.muted, marginTop: 8 }}>No comments yet. Share some beta!</Text>}
        <View style={{ marginTop: 16, borderRadius: 14, padding: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <TextInput testID="comment-input" accessibilityLabel="Comment text" multiline maxLength={1000} value={text} onChangeText={setText} placeholder="Share beta or feedback" placeholderTextColor={colors.muted} style={{ minHeight: 76, color: colors.text, textAlignVertical: 'top' }} />
          <Text testID="comment-character-count" style={{ color: text.length > 1000 ? colors.destructive : colors.muted, fontSize: 12, textAlign: 'right' }}>{text.length}/1000</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Pressable testID="comment-beta-toggle" accessibilityRole="switch" accessibilityLabel="Mark comment as beta" accessibilityState={{ checked: isBeta }} onPress={() => setIsBeta((value) => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: isBeta ? warningColor : colors.muted, fontWeight: '600' }}>{isBeta ? 'Beta' : 'Mark as Beta'}</Text></Pressable>
            <Pressable testID="comment-post" accessibilityRole="button" accessibilityLabel="Post comment" accessibilityState={{ disabled: posting || !text.trim() || text.length > 1000, busy: posting }} disabled={posting || !text.trim() || text.length > 1000} onPress={submit} style={{ minHeight: 44, marginLeft: 'auto', borderRadius: 10, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: posting || !text.trim() || text.length > 1000 ? 0.5 : 1 }}>{posting ? <ActivityIndicator color={colors.card} /> : <Text style={{ color: colors.card, fontWeight: '700' }}>Post</Text>}</Pressable>
          </View>
        </View>
      </View>}
      {editing && <View testID="comment-edit-form" style={{ marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: colors.card }}><TextInput accessibilityLabel="Edit comment" multiline maxLength={1000} value={editText} onChangeText={setEditText} style={{ minHeight: 72, color: colors.text, textAlignVertical: 'top' }} /><Pressable accessibilityRole="button" accessibilityLabel="Save comment" disabled={posting || !editText.trim() || editText.length > 1000} onPress={saveEdit} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 10, marginTop: 8 }}>{posting ? <ActivityIndicator color={colors.card} /> : <Text style={{ color: colors.card, fontWeight: '700' }}>Save</Text>}</Pressable></View>}
    </View>
  );
}
