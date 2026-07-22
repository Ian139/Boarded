'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useUserStore } from '@/lib/stores/user-store';
import { type Comment } from '@climbset/shared/types';
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
  const shouldReduceMotion = useReducedMotion();

  const currentUserId = userId;
  const sortedComments = [...comments].sort((a, b) => {
    if (a.is_beta && !b.is_beta) return -1;
    if (!a.is_beta && b.is_beta) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const betaCount = comments.filter((comment) => comment.is_beta).length;

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

  return (
    <div className="border-t border-foreground/[0.12]">
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-foreground transition-colors hover:bg-muted/50 motion-reduce:transition-none"
      >
        <span className="flex items-center gap-2">
          <svg
            className={cn(
              'size-4 text-muted-foreground transition-transform motion-reduce:transition-none',
              isExpanded && 'rotate-180'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
          <span className="text-sm font-semibold">Beta &amp; Comments</span>
          {comments.length > 0 && (
            <span className="text-xs text-muted-foreground">({comments.length})</span>
          )}
        </span>
        {betaCount > 0 && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {betaCount} beta
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pb-4">
              {sortedComments.length > 0 ? (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {sortedComments.map((comment) => (
                    <div
                      key={comment.id}
                      className={cn(
                        'rounded-xl p-3',
                        comment.is_beta
                          ? 'bg-amber-500/10 ring-1 ring-amber-500/30'
                          : 'bg-muted/50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            {comment.is_beta && (
                              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                Beta
                              </span>
                            )}
                            <span className="truncate text-sm font-medium text-foreground">
                              {comment.user_name || 'Anonymous'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(comment.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm text-foreground/80">
                            {comment.content}
                          </p>
                        </div>
                        {(isModerator || comment.user_id === currentUserId) && (
                          <button
                            type="button"
                            onClick={() => handleDelete(comment.id)}
                            aria-label={`Delete comment from ${comment.user_name || 'Anonymous'}`}
                            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive motion-reduce:transition-none"
                          >
                            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-3 text-center">
                  <p className="text-sm text-muted-foreground">No comments yet. Share some beta!</p>
                </div>
              )}

              <div className="space-y-2">
                <textarea
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  placeholder="Share beta or leave a comment..."
                  rows={3}
                  maxLength={1000}
                  className="w-full resize-none rounded-xl border border-border/50 bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50 motion-reduce:transition-none"
                />
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIsBeta((beta) => !beta)}
                    aria-pressed={isBeta}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none',
                      isBeta
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                    {isBeta ? 'Beta' : 'Mark as Beta'}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{newComment.length}/1000</span>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!newComment.trim() || isSubmitting}
                      className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
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
