'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { RouteViewer } from '@/components/wall/RouteViewer';
import { calculateDisplayGrade } from '@climbset/shared/utils/grades';
import type { Route } from '@climbset/shared/types';

interface RouteViewerDialogProps {
  route: Route | null;
  onOpenChange: (open: boolean) => void;
  wallImageUrl: string;
}

export function RouteViewerDialog({
  route,
  onOpenChange,
  wallImageUrl,
}: RouteViewerDialogProps) {
  return (
    <Dialog open={Boolean(route)} onOpenChange={onOpenChange}>
      <DialogContent
        className="!w-fit !max-w-[96vw] max-h-[94vh] gap-0 overflow-y-auto overflow-x-hidden rounded-3xl border border-foreground/[0.12] bg-card/80 p-0 shadow-none backdrop-blur-xl !animate-none !transition-none"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{route?.name || 'Route Viewer'}</DialogTitle>
        {route && (
          <>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close route viewer"
              className="absolute right-3 top-3 z-20 flex size-10 items-center justify-center rounded-full border border-foreground/[0.12] bg-card/80 text-foreground/70 backdrop-blur-md transition-colors hover:bg-foreground/[0.1] hover:text-foreground motion-reduce:transition-none"
            >
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <RouteViewer
              wallImageUrl={route.wall_image_url || wallImageUrl}
              wallImageWidth={route.wall_image_width}
              wallImageHeight={route.wall_image_height}
              holds={route.holds}
              routeName={route.name}
              grade={calculateDisplayGrade(route.grade_v, route.ascents)}
              setterName={route.user_name}
              routeId={route.id}
              comments={route.comments || []}
              route={route}
              fitToContent
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
