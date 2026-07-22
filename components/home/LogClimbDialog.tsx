'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StarRatingInput } from '@/components/ui/star-rating';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useUserStore } from '@/lib/stores/user-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Route, Ascent } from '@climbset/shared/types';
import { V_GRADES } from '@climbset/shared/types';

interface LogClimbDialogProps {
  route: Route | null;
  onOpenChange: (open: boolean) => void;
}

export function LogClimbDialog({ route, onOpenChange }: LogClimbDialogProps) {
  if (!route) return null;

  return (
    <LogClimbDialogContent
      key={route.id}
      route={route}
      onOpenChange={onOpenChange}
    />
  );
}

function LogClimbDialogContent({
  route,
  onOpenChange,
}: {
  route: Route;
  onOpenChange: (open: boolean) => void;
}) {
  const { addAscent } = useRoutesStore();
  const { userId, displayName } = useUserStore();

  const [logGrade, setLogGrade] = useState(route.grade_v || '');
  const [logRating, setLogRating] = useState(0);
  const [logNotes, setLogNotes] = useState('');
  const [logFlashed, setLogFlashed] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

  const handleLogClimb = async () => {
    if (!userId) {
      toast.error('Log in to log a climb.');
      return;
    }

    setIsLogging(true);
    const ascent: Ascent = {
      id: crypto.randomUUID(),
      route_id: route.id,
      user_id: userId,
      user_name: displayName || 'Anonymous',
      grade_v: logGrade || undefined,
      rating: logRating > 0 ? logRating : undefined,
      notes: logNotes.trim() || undefined,
      flashed: logFlashed,
      created_at: new Date().toISOString(),
    };
    const saved = await addAscent(route.id, ascent);
    setIsLogging(false);

    if (!saved) {
      toast.error('Unable to save climb. Please try again.');
      return;
    }

    onOpenChange(false);
    toast.success('Climb logged!');
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-lg gap-0 overflow-hidden rounded-3xl border border-foreground/[0.12] bg-card/80 p-0 shadow-none backdrop-blur-xl motion-reduce:animate-none motion-reduce:transition-none"
        aria-describedby="log-climb-description"
      >
        <DialogHeader className="border-b border-foreground/[0.12] p-5 pr-14">
          <DialogTitle>Log Climb</DialogTitle>
          <DialogDescription id="log-climb-description">
            Record your ascent of &quot;{route.name}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-foreground/[0.12] px-5">
          <div className="space-y-2 py-4">
            <Label htmlFor="log-grade">
              Your Grade Suggestion
            </Label>
            <div className="relative">
              <select
                id="log-grade"
                value={logGrade}
                onChange={(event) => setLogGrade(event.target.value)}
                className="h-10 w-full appearance-none border-0 bg-transparent py-2 pr-9 text-sm text-foreground outline-none transition-colors focus:text-foreground motion-reduce:transition-none"
              >
                <option value="" className="bg-popover text-popover-foreground">
                  Select grade
                </option>
                {V_GRADES.map((grade) => (
                  <option key={grade} value={grade} className="bg-popover text-popover-foreground">
                    {grade}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </div>
            {route.grade_v && (
              <p className="text-xs text-muted-foreground">Setter&apos;s grade: {route.grade_v}</p>
            )}
          </div>

          <div className="space-y-2 py-4">
            <Label className="text-muted-foreground">Rating</Label>
            <StarRatingInput value={logRating} onChange={setLogRating} />
          </div>

          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <Label htmlFor="log-flash" className="text-foreground">
                Flashed it?
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">Sent on your first try</p>
            </div>
            <button
              id="log-flash"
              type="button"
              aria-pressed={logFlashed}
              onClick={() => setLogFlashed((flashed) => !flashed)}
              className={cn(
                'flex size-10 items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
                logFlashed
                  ? 'bg-yellow-500 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              )}
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </button>
          </div>

          <div className="space-y-2 py-4">
            <Label htmlFor="log-notes">
              Notes (optional)
            </Label>
            <textarea
              id="log-notes"
              value={logNotes}
              onChange={(event) => setLogNotes(event.target.value)}
              placeholder="Any beta or thoughts about the climb..."
              rows={3}
              className="min-h-24 w-full resize-none border-0 bg-transparent px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-0 motion-reduce:transition-none"
            />
          </div>
        </div>

        <DialogFooter className="border-t border-foreground/[0.12] p-5">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLogging}>
            Cancel
          </Button>
          <Button onClick={handleLogClimb} disabled={isLogging} className="bg-secondary hover:bg-secondary/90">
            {isLogging ? 'Logging...' : 'Log Climb'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
