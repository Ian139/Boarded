import { V_GRADES } from '../types';

export const gradeToNumber = (grade?: string): number => {
  if (!grade) return -1;
  const index = V_GRADES.indexOf(grade);
  return index >= 0 ? index : -1;
};

export const numberToGrade = (num: number): string | undefined => {
  const rounded = Math.round(num);
  if (rounded >= 0 && rounded < V_GRADES.length) {
    return V_GRADES[rounded];
  }
  return undefined;
};

export const calculateDisplayGrade = (setterGrade?: string, ascents?: { grade_v?: string }[]): string | undefined => {
  const setterNum = gradeToNumber(setterGrade);
  const userGrades = (ascents || [])
    .map(a => gradeToNumber(a.grade_v))
    .filter(g => g >= 0);

  if (setterNum < 0 && userGrades.length === 0) return undefined;
  if (setterNum >= 0 && userGrades.length === 0) return setterGrade;

  const avgUser = userGrades.reduce((sum, g) => sum + g, 0) / userGrades.length;

  if (setterNum < 0) return numberToGrade(avgUser);

  return numberToGrade((setterNum * 0.5) + (avgUser * 0.5));
};
