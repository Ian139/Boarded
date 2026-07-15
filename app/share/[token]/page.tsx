'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Route } from '@/lib/types';
import { V_GRADES } from '@/lib/types';
import { RouteViewer } from '@/components/wall/RouteViewer';
import { DEFAULT_WALL } from '@/lib/stores/walls-store';

const gradeToNumber = (grade?: string): number => {
  if (!grade) return -1;
  const index = V_GRADES.indexOf(grade);
  return index >= 0 ? index : -1;
};

const numberToGrade = (num: number): string | undefined => {
  const rounded = Math.round(num);
  if (rounded >= 0 && rounded < V_GRADES.length) {
    return V_GRADES[rounded];
  }
  return undefined;
};

const calculateDisplayGrade = (setterGrade?: string, ascents?: { grade_v?: string }[]): string | undefined => {
  const setterNum = gradeToNumber(setterGrade);
  const userGrades = (ascents || [])
    .map(a => gradeToNumber(a.grade_v))
    .filter(g => g >= 0);

  if (setterNum < 0 && userGrades.length === 0) return undefined;
  if (setterNum >= 0 && userGrades.length === 0) return setterGrade;
  if (setterNum < 0 && userGrades.length > 0) {
    const avgUser = userGrades.reduce((sum, g) => sum + g, 0) / userGrades.length;
    return numberToGrade(avgUser);
  }

  const avgUser = userGrades.reduce((sum, g) => sum + g, 0) / userGrades.length;
  const combined = (setterNum * 0.5) + (avgUser * 0.5);
  return numberToGrade(combined);
};

export default function SharePage() {
  const params = useParams();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [route, setRoute] = useState<Route | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setError('Invalid share link');
        setIsLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        let result = await supabase
          .from('routes')
          .select('*, ascents (*), comments (*)')
          .eq('share_token', token)
          .eq('is_public', true)
          .limit(1)
          .single();

        if (result.error) {
          result = await supabase
            .from('routes')
            .select('*, ascents (*)')
            .eq('share_token', token)
            .eq('is_public', true)
            .limit(1)
            .single();
        }

        if (result.error || !result.data) {
          setError('Route not found');
        } else {
          setRoute(result.data as Route);
          const { data: nextCount, error: viewError } = await supabase.rpc('increment_route_view', { target_route_id: result.data.id });
          if (viewError || typeof nextCount !== 'number') {
            console.warn('Unable to increment route view count');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load route');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [token]);

  return (
    <div className="app-shell min-h-dvh">
      <header className="page-header px-4 md:px-8 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="size-10 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold">Shared Route</h1>
        </div>
      </header>

      <main className="h-[calc(100dvh-80px)]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">Loading route...</div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">{error}</div>
        ) : route ? (
          <RouteViewer
            wallImageUrl={route.wall_image_url || DEFAULT_WALL.image_url}
            wallImageWidth={route.wall_image_width || DEFAULT_WALL.image_width}
            wallImageHeight={route.wall_image_height || DEFAULT_WALL.image_height}
            holds={route.holds}
            routeName={route.name}
            grade={calculateDisplayGrade(route.grade_v, route.ascents)}
            setterName={route.user_name}
            routeId={route.id}
            comments={route.comments || []}
          />
        ) : null}
      </main>
    </div>
  );
}
