import type { Ascent, Route } from '../types';
import { V_GRADES } from '../types';

export type GradeInput = string | number | null | undefined;

/**
 * Convert a runtime grade value to the canonical V-scale label.
 *
 * Numeric values use the database wire convention (-1 = VB, 0 = V0, ...),
 * while numberToGrade intentionally retains its rank-index convention.
 */
export const canonicalizeGrade = (grade: GradeInput): string | undefined => {
  if (typeof grade === 'number') {
    if (!Number.isInteger(grade) || grade < -1 || grade > 17) return undefined;
    return grade === -1 ? 'VB' : `V${grade}`;
  }

  if (typeof grade !== 'string') return undefined;
  const canonical = grade.trim().toUpperCase();
  return V_GRADES.includes(canonical) ? canonical : undefined;
};

type RuntimeGradeRoute = Omit<Route, 'grade_v' | 'ascents'> & {
  grade_v?: GradeInput;
  ascents?: Array<Omit<Ascent, 'grade_v'> & { grade_v?: GradeInput }>;
};

/**
 * Normalize route and nested ascent grades at a data ingress boundary.
 * The returned route remains typed with string-only Route/Ascent fields.
 */
export const normalizeRouteGrades = (route: RuntimeGradeRoute): Route => ({
  ...route,
  grade_v: canonicalizeGrade(route.grade_v),
  ascents: route.ascents?.map((ascent) => ({
    ...ascent,
    grade_v: canonicalizeGrade(ascent.grade_v),
  })),
});

export const gradeToNumber = (grade?: GradeInput): number => {
  const canonical = canonicalizeGrade(grade);
  if (!canonical) return -1;
  const index = V_GRADES.indexOf(canonical);
  return index >= 0 ? index : -1;
};

export const numberToGrade = (num: number): string | undefined => {
  const rounded = Math.round(num);
  if (rounded >= 0 && rounded < V_GRADES.length) {
    return V_GRADES[rounded];
  }
  return undefined;
};

export const calculateDisplayGrade = (setterGrade?: GradeInput, ascents?: Array<{ grade_v?: GradeInput }>): string | undefined => {
  const canonicalSetter = canonicalizeGrade(setterGrade);
  const setterNum = gradeToNumber(canonicalSetter);
  const userGrades = (ascents || [])
    .map(a => gradeToNumber(a.grade_v))
    .filter(g => g >= 0);

  if (setterNum < 0 && userGrades.length === 0) return undefined;
  if (setterNum >= 0 && userGrades.length === 0) return canonicalSetter;

  const avgUser = userGrades.reduce((sum, g) => sum + g, 0) / userGrades.length;

  if (setterNum < 0) return numberToGrade(avgUser);

  return numberToGrade((setterNum * 0.5) + (avgUser * 0.5));
};
