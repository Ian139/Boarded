import type { Comment } from '@climbset/shared';

export function isCommentValid(content: string) {
  const value = content.trim();
  return value.length > 0 && value.length <= 1000;
}

export function canManageComment(comment: Pick<Comment, 'user_id'>, currentUserId: string, isModerator: boolean) {
  return isModerator || (currentUserId !== 'local-user' && comment.user_id === currentUserId);
}
