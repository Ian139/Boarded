import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemeColors = {
  background: string; surface: string; surfaceElevated: string; card: string; inputFill: string;
  text: string; textMuted: string; muted: string; placeholder: string;
  primary: string; primaryForeground: string; secondary: string; secondaryForeground: string; accent: string;
  border: string; focusRing: string; destructive: string; destructiveForeground: string;
  errorBackground: string; errorForeground: string; warningBackground: string; warningForeground: string; warningBorder: string;
  successBackground: string; successForeground: string; disabledBackground: string; disabledForeground: string; scrim: string;
};
export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
export const radii = { chip: 8, control: 12, card: 16, sheet: 16, full: 999 } as const;
export const typography = { caption:{fontSize:11,lineHeight:14}, metadata:{fontSize:12,lineHeight:16}, body:{fontSize:14,lineHeight:20}, control:{fontSize:16,lineHeight:20}, title:{fontSize:20,lineHeight:26}, display:{fontSize:24,lineHeight:30} } as const;

export const lightColors: ThemeColors = { background:'#f8f5ee',surface:'#fdfcf8',surfaceElevated:'#fffefa',card:'#fdfcf8',inputFill:'#f2ede4',text:'#2d1e14',textMuted:'#635146',muted:'#635146',placeholder:'#78675c',primary:'#8e5224',primaryForeground:'#fffaf1',secondary:'#258651',secondaryForeground:'#f4fff7',accent:'#319751',border:'#d9d0c1',focusRing:'#744016',destructive:'#b91f27',destructiveForeground:'#fff8f7',errorBackground:'#fbe8e6',errorForeground:'#8c1720',warningBackground:'#f7ecd2',warningForeground:'#66470d',warningBorder:'#c89d43',successBackground:'#e2f2e7',successForeground:'#175f36',disabledBackground:'#e8e2d8',disabledForeground:'#756b61',scrim:'rgba(26,18,12,0.52)' };
export const darkColors: ThemeColors = { background:'#0b0905',surface:'#14110d',surfaceElevated:'#1d1914',card:'#14110d',inputFill:'#211d17',text:'#f5f1ea',textMuted:'#b1aa9d',muted:'#b1aa9d',placeholder:'#918a7e',primary:'#79b66d',primaryForeground:'#0c190d',secondary:'#b77b49',secondaryForeground:'#190f07',accent:'#929b4d',border:'#3c3730',focusRing:'#a8d69f',destructive:'#ee5c5b',destructiveForeground:'#240707',errorBackground:'#3a1717',errorForeground:'#ffaaa5',warningBackground:'#342a15',warningForeground:'#f2cf7d',warningBorder:'#997531',successBackground:'#153221',successForeground:'#9dddb2',disabledBackground:'#29251f',disabledForeground:'#8c8579',scrim:'rgba(0,0,0,0.68)' };

/** Compatibility snapshot for legacy screens. New UI must use useTheme() so it rerenders. */
export const colors: ThemeColors = { ...lightColors };
type ThemeContextValue = { mode: ThemeMode; resolvedMode: 'light'|'dark'; setMode: (mode: ThemeMode) => void; colors: ThemeColors; reduceMotion: boolean };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'climbset-theme';
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme(); const [mode,setModeState]=useState<ThemeMode>('system'); const [reduceMotion,setReduceMotion]=useState(false); const modeGeneration = useRef(0);
  useEffect(()=>{ let mounted=true; const generation=modeGeneration.current; AsyncStorage.getItem(STORAGE_KEY).then(v=>{if(mounted&&modeGeneration.current===generation&&(v==='light'||v==='dark'||v==='system'))setModeState(v);}).catch(()=>undefined); AccessibilityInfo.isReduceMotionEnabled().then(v=>mounted&&setReduceMotion(v)); const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion); return()=>{mounted=false;subscription.remove()};},[]);
  const resolvedMode: 'light'|'dark'=mode==='system'?(systemScheme==='dark'?'dark':'light'):mode;
  const palette=resolvedMode==='dark'?darkColors:lightColors;
  useEffect(()=>{Object.assign(colors,palette)},[palette]);
  const setMode=(next:ThemeMode)=>{modeGeneration.current+=1;setModeState(next);void AsyncStorage.setItem(STORAGE_KEY,next).catch(()=>undefined)};
  const value=useMemo(()=>({mode,resolvedMode,setMode,colors:palette,reduceMotion}),[mode,resolvedMode,palette,reduceMotion]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme(){const context=useContext(ThemeContext); if(!context)return {mode:'system' as ThemeMode,resolvedMode:'light' as const,setMode:()=>undefined,colors:lightColors,reduceMotion:false}; return context;}
