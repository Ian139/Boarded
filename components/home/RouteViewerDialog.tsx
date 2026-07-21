
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { RouteViewer } from '@/components/wall/RouteViewer';
import { calculateDisplayGrade } from '@climbset/shared/utils/grades';
import type { Route } from '@climbset/shared/types';

interface RouteViewerDialogProps {
  route: Route | null;
  onOpenChange: (open: boolean) => void;
  wallImageUrl: string;
}

export function RouteViewerDialog({ route, onOpenChange, wallImageUrl }: RouteViewerDialogProps) {
  return (
    <Dialog open={!!route} onOpenChange={() => onOpenChange(false)}>
      <DialogContent
        className="w-fit h-auto max-w-[95vw] sm:max-w-[95vw] max-h-[95vh] min-w-[50vw] gap-0 p-0 overflow-y-auto overflow-x-hidden border-0 bg-black/60 backdrop-blur-sm rounded-none md:rounded-2xl shadow-2xl ring-1 ring-white/10"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">
          {route?.name || 'Route Viewer'}
        </DialogTitle>
        {route && (
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 size-10 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/70 transition-colors"
          >
            <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {route && (
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
            fitToContent
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
