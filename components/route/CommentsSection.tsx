'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useUserStore } from '@/lib/stores/user-store';
import { Comment } from '@climbset/shared/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CommentsSectionProps {
  routeId: string;
  comments: Comment[];
}

export function CommentsSection({ routeId, comments }: CommentsSectionProps) {
  const { addComment, deleteComment } = useRoutesStore();
  const { userId, displayName, isModerator } = useUserStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isBeta, setIsBeta] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentUserId = userId;

  // Sort comments: beta first, then by date
  const sortedComments = [...comments].sort((a, b) => {
    if (a.is_beta && !b.is_beta) return -1;
    if (!a.is_beta && b.is_beta) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const betaCount = comments.filter(c => c.is_beta).length;

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    if (newComment.length > 1000) {
      toast.error('Comment must be less than 1000 characters');
      return;
    }

    if (!userId) {
      toast.error('Log in to comment on routes.');
      return;
    }
    setIsSubmitting(true);

    const comment: Comment = {
      id: crypto.randomUUID(),
      route_id: routeId,
      user_id: currentUserId,
      user_name: displayName || 'Anonymous',
      content: newComment.trim(),
      is_beta: isBeta,
      created_at: new Date().toISOString(),
    };

    const saved = await addComment(routeId, comment);
    setIsSubmitting(false);
    if (!saved) {
      toast.error('Unable to save comment. Please try again.');
      return;
    }

    setNewComment('');
    setIsBeta(false);
    toast.success(isBeta ? 'Beta added!' : 'Comment added!');
  };

  const handleDelete = async (commentId: string) => {
    const deleted = await deleteComment(routeId, commentId);
    if (deleted) {
      toast.success('Comment deleted');
    } else {
      toast.error('Unable to delete comment. Please try again.');
    }
  };

  const canDeleteComment = (comment: Comment) => {
    return isModerator || comment.user_id === currentUserId;
  };

  return (
    <div>
      {/* Toggle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
          <span className="font-medium text-sm text-foreground">Beta & Comments</span>
          {comments.length > 0 && (
            <span className="text-xs text-muted-foreground">({comments.length})</span>
          )}
        </div>
        {betaCount > 0 && (
          <span className="text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
            {betaCount} beta
          </span>
        )}
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 space-y-3">
              {/* Comments List */}
              {sortedComments.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {sortedComments.map((comment) => (
                    <div
                      key={comment.id}
                      className={cn(
                        "rounded-xl p-3",
                        comment.is_beta
                          ? "bg-amber-500/10 ring-1 ring-amber-500/30"
                          : "bg-muted/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {comment.is_beta && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                                Beta
                              </span>
                            )}
                            <span className="font-medium text-sm text-foreground truncate">
                              {comment.user_name || 'Anonymous'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(comment.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words">
                            {comment.content}
                          </p>
                        </div>
                        {canDeleteComment(comment) && (
                          <button
                            onClick={() => handleDelete(comment.id)}
                            className="shrink-0 size-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-sm text-muted-foreground">No comments yet. Share some beta!</p>
                </div>
              )}

              {/* Add Comment Form */}
              <div className="space-y-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share beta or leave a comment..."
                  rows={3}
                  maxLength={1000}
                  className="w-full resize-none text-sm bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsBeta(!isBeta)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                      isBeta
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                    {isBeta ? 'Beta' : 'Mark as Beta'}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {newComment.length}/1000
                    </span>
                    <button
                      onClick={handleSubmit}
                      disabled={!newComment.trim() || isSubmitting}
                      className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
                    >
                      {isSubmitting ? 'Posting...' : 'Post'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
