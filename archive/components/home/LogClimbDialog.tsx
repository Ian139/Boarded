'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { StarRatingInput } from '@/components/ui/star-rating';
import { useRoutesStore } from '@/lib/stores/routes-store';
import { useUserStore } from '@/lib/stores/user-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Route, Ascent } from '@/lib/types';
import { V_GRADES } from '@/lib/types';

interface LogClimbDialogProps {
  route: Route | null;
  onOpenChange: (open: boolean) => void;
}

export function LogClimbDialog({ route, onOpenChange }: LogClimbDialogProps) {
  if (!route) {
    return null;
  }

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
    <Dialog open onOpenChange={() => onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Climb</DialogTitle>
          <DialogDescription>
            Record your ascent of &quot;{route?.name}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Suggested Grade */}
          <div className="space-y-2">
            <Label htmlFor="log-grade">Your Grade Suggestion</Label>
            <Select value={logGrade} onValueChange={setLogGrade}>
              <SelectTrigger id="log-grade">
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent>
                {V_GRADES.map((grade) => (
                  <SelectItem key={grade} value={grade}>
                    {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {route?.grade_v && (
              <p className="text-xs text-muted-foreground">
                Setter&apos;s grade: {route.grade_v}
              </p>
            )}
          </div>

          {/* Rating */}
          <div className="space-y-2">
            <Label>Rating</Label>
            <StarRatingInput value={logRating} onChange={setLogRating} />
          </div>

          {/* Flash Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="log-flash">Flashed it?</Label>
              <p className="text-xs text-muted-foreground">Sent on your first try</p>
            </div>
            <button
              type="button"
              onClick={() => setLogFlashed(!logFlashed)}
              className={cn(
                "size-10 rounded-full flex items-center justify-center transition-colors",
                logFlashed
                  ? "bg-yellow-500 text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </button>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="log-notes">Notes (optional)</Label>
            <Textarea
              id="log-notes"
              value={logNotes}
              onChange={(e) => setLogNotes(e.target.value)}
              placeholder="Any beta or thoughts about the climb..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLogging}
          >
            Cancel
          </Button>
          <Button
            onClick={handleLogClimb}
            disabled={isLogging}
            className="bg-secondary hover:bg-secondary/90"
          >
            {isLogging ? 'Logging...' : 'Log Climb'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
