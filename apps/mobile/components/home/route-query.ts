import { calculateDisplayGrade, gradeToNumber, type Route } from '@climbset/shared';

export type SortMode = 'newest' | 'oldest' | 'name' | 'grade-asc' | 'grade-desc' | 'rating' | 'most-liked' | 'most-climbed' | 'most-viewed';
export const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: 'newest', label: 'Newest' }, { id: 'oldest', label: 'Oldest' }, { id: 'name', label: 'Name' },
  { id: 'grade-asc', label: 'Easiest' }, { id: 'grade-desc', label: 'Hardest' }, { id: 'rating', label: 'Highest rated' },
  { id: 'most-liked', label: 'Most liked' }, { id: 'most-climbed', label: 'Most climbed' }, { id: 'most-viewed', label: 'Most viewed' },
];
export function averageRouteRating(route: Route) {
  const ratings = (route.ascents || []).map((ascent) => ascent.rating).filter((rating): rating is number => typeof rating === 'number');
  return ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : route.rating || 0;
}
export function filterAndSortRoutes(routes: Route[], options: { wallId?: string; search?: string; grade?: string; setter?: string; sort?: SortMode }) {
  const query = (options.search || '').trim().toLowerCase();
  const visible = routes.filter((route) => {
    if (options.wallId && options.wallId !== 'all-walls' && route.wall_id !== options.wallId) return false;
    if (query && ![route.name, route.user_name, route.grade_v].some((value) => value?.toLowerCase().includes(query))) return false;
    if (options.grade && options.grade !== 'all' && route.grade_v !== options.grade) return false;
    if (options.setter && options.setter !== 'all' && route.user_name !== options.setter) return false;
    return true;
  });
  const sort = options.sort || 'newest';
  return visible.sort((a, b) => {
    if (sort === 'oldest') return Date.parse(a.created_at) - Date.parse(b.created_at);
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'grade-asc') return gradeToNumber(calculateDisplayGrade(a.grade_v, a.ascents || [])) - gradeToNumber(calculateDisplayGrade(b.grade_v, b.ascents || []));
    if (sort === 'grade-desc') return gradeToNumber(calculateDisplayGrade(b.grade_v, b.ascents || [])) - gradeToNumber(calculateDisplayGrade(a.grade_v, a.ascents || []));
    if (sort === 'rating') return averageRouteRating(b) - averageRouteRating(a);
    if (sort === 'most-liked') return (b.like_count || b.liked_by?.length || 0) - (a.like_count || a.liked_by?.length || 0);
    if (sort === 'most-climbed') return (b.ascents?.length || 0) - (a.ascents?.length || 0);
    if (sort === 'most-viewed') return (b.view_count || 0) - (a.view_count || 0);
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}
export function buildShareUrl(token: string) {
  const base = process.env.EXPO_PUBLIC_APP_URL || process.env.EXPO_PUBLIC_WEB_URL;
  return base ? `${base.replace(/\/$/, '')}/share/${token}` : `climbset://share/${token}`;
}
