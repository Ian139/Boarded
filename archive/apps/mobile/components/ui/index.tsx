import React, { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, radii, spacing, typography } from '../../lib/theme';

export function AppScreen({ children, scroll = false, keyboard = false, contentStyle, testID, accessibilityLabel, ...props }: { children: ReactNode; scroll?: boolean; keyboard?: boolean; contentStyle?: ViewStyle; testID?: string; accessibilityLabel?: string } & ScrollViewProps) {
  const { colors } = useTheme();
  const body = scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.screenContent, contentStyle]} {...props}>{children}</ScrollView> : <View style={[styles.screenContent, contentStyle]}>{children}</View>;
  return <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>{keyboard ? <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View testID={testID} accessible={Boolean(accessibilityLabel) && !testID} accessibilityLabel={accessibilityLabel} style={styles.flex}>{body}</View></KeyboardAvoidingView> : <View testID={testID} accessible={Boolean(accessibilityLabel) && !testID} accessibilityLabel={accessibilityLabel} style={styles.flex}>{body}</View>}</SafeAreaView>;
}

export function TopBar({ title, onBack, action }: { title: string; onBack?: () => void; action?: ReactNode }) {
  const { colors } = useTheme();
  return <View style={styles.topBar}>{onBack ? <IconButton label="Go back" onPress={onBack} icon="‹" /> : <View style={styles.topBarSpacer} />}<Text accessibilityRole="header" style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>{action ? <View style={styles.topBarSpacer}>{action}</View> : <View style={styles.topBarSpacer} />}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
export function Button({ label, variant = 'primary', loading = false, disabled, style, ...props }: { label: string; variant?: ButtonVariant; loading?: boolean } & Omit<PressableProps, 'children'>) {
  const { colors } = useTheme();
  const blocked = disabled || loading;
  const backgroundColor = variant === 'primary' ? colors.primary : variant === 'secondary' ? colors.secondary : variant === 'destructive' ? colors.destructive : variant === 'outline' ? colors.surface : 'transparent';
  const foreground = variant === 'primary' ? colors.primaryForeground : variant === 'secondary' ? colors.secondaryForeground : variant === 'destructive' ? colors.destructiveForeground : colors.text;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked, busy: loading }} disabled={blocked} style={({ pressed }) => [styles.button, { backgroundColor, borderColor: variant === 'outline' ? colors.border : backgroundColor, opacity: blocked ? 0.55 : pressed ? 0.78 : 1 }, style as ViewStyle]} {...props}>{loading ? <ActivityIndicator color={foreground} /> : null}<Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text></Pressable>;
}

export function IconButton({ label, icon, testID, ...props }: { label: string; icon: ReactNode; testID?: string } & Omit<PressableProps, 'children' | 'testID'>) {
  const { colors } = useTheme();
  return <Pressable accessible testID={testID} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? colors.inputFill : 'transparent' }]} {...props}>{typeof icon === 'string' ? <Text style={[styles.iconText, { color: colors.text }]}>{icon}</Text> : icon}</Pressable>;
}

type FieldProps = TextInputProps & { label: string; error?: string; helper?: string; required?: boolean; secureToggle?: boolean };
export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, error, helper, required, secureTextEntry, secureToggle, editable = true, style, ...props }, ref) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const helpId = `${String(props.nativeID ?? label).replace(/\s/g, '-')}-help`;
  return <View style={styles.field}><Text style={[styles.label, { color: colors.text }]}>{label}{required ? ' *' : ''}</Text><View style={[styles.inputWrap, { backgroundColor: colors.inputFill, borderColor: error ? colors.destructive : colors.border }]}><TextInput ref={ref} editable={editable} accessibilityLabel={label} accessibilityHint={helper} accessibilityState={{ disabled: !editable }} aria-describedby={helpId} placeholderTextColor={colors.placeholder} secureTextEntry={secureToggle ? hidden : secureTextEntry} style={[styles.input, { color: colors.text }, style]} {...props}/>{secureToggle ? <IconButton label={hidden ? 'Show password' : 'Hide password'} icon={hidden ? 'Show' : 'Hide'} onPress={() => setHidden((v) => !v)} /> : null}</View>{error || helper ? <Text nativeID={helpId} accessibilityLiveRegion={error ? 'polite' : 'none'} style={[styles.help, { color: error ? colors.destructive : colors.textMuted }]}>{error || helper}</Text> : null}</View>;
});

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) { const { colors } = useTheme(); return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>; }
export function FilterChip({ label, selected = false, ...props }: { label: string; selected?: boolean } & Omit<PressableProps, 'children'>) { const { colors } = useTheme(); return <Pressable accessibilityRole="button" accessibilityState={{ selected }} style={({ pressed }) => [styles.chip, { backgroundColor: selected ? colors.secondary : colors.surface, borderColor: selected ? colors.secondary : colors.border, opacity: pressed ? .75 : 1 }]} {...props}><Text style={{ color: selected ? colors.secondaryForeground : colors.text, fontWeight: '600' }}>{label}</Text></Pressable>; }

export function InlineNotice({ message, tone = 'info' }: { message: string; tone?: 'info' | 'error' | 'warning' | 'success' }) { const { colors } = useTheme(); const bg = tone === 'error' ? colors.errorBackground : tone === 'warning' ? colors.warningBackground : tone === 'success' ? colors.successBackground : colors.inputFill; const fg = tone === 'error' ? colors.errorForeground : tone === 'warning' ? colors.warningForeground : tone === 'success' ? colors.successForeground : colors.text; return <View accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: bg }]}><Text style={{ color: fg, lineHeight: typography.body.lineHeight }}>{message}</Text></View>; }

export function AsyncState({ loading, error, empty, onRetry, children }: { loading?: boolean; error?: string | null; empty?: { title: string; message?: string; actionLabel?: string; onAction?: () => void }; onRetry?: () => void; children?: ReactNode }) { const { colors } = useTheme(); if (loading) return <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={styles.async}><ActivityIndicator color={colors.primary}/></View>; if (error) return <View style={styles.async}><InlineNotice tone="error" message={error}/>{onRetry ? <Button label="Retry" variant="outline" onPress={onRetry}/> : null}</View>; if (empty) return <View style={styles.async}><Text style={[styles.title, { color: colors.text }]}>{empty.title}</Text>{empty.message ? <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{empty.message}</Text> : null}{empty.actionLabel && empty.onAction ? <Button label={empty.actionLabel} onPress={empty.onAction}/> : null}</View>; return <>{children}</>; }

export function ConfirmAction({ title, message, label, onConfirm, children }: { title: string; message: string; label?: string; onConfirm: () => void; children: (confirm: () => void) => ReactNode }) { return <>{children(() => Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: label ?? 'Confirm', style: 'destructive', onPress: onConfirm }]))}</>; }

export function BottomSheet({ visible, title, onDismiss, children }: { visible: boolean; title: string; onDismiss: () => void; children: ReactNode }) { const { colors } = useTheme(); const opened = useRef(false); useEffect(() => { if (visible && !opened.current) AccessibilityInfo.announceForAccessibility(title); opened.current = visible; }, [title, visible]); return <Modal visible={visible} transparent animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'} onRequestClose={onDismiss}><Pressable accessibilityRole="button" accessibilityLabel="Dismiss" style={[styles.scrim, { backgroundColor: colors.scrim }]} onPress={onDismiss}/><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetPosition}><View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}><View style={[styles.handle, { backgroundColor: colors.border }]}/><View style={styles.sheetHeader}><Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text><IconButton label="Close" icon="×" onPress={onDismiss}/></View>{children}</View></KeyboardAvoidingView></Modal>; }

const styles = StyleSheet.create({ flex:{flex:1}, screen:{flex:1}, screenContent:{flexGrow:1,width:'100%',maxWidth:760,alignSelf:'center',paddingHorizontal:spacing[4]}, topBar:{minHeight:56,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},topBarSpacer:{width:44,minHeight:44,alignItems:'center',justifyContent:'center'},title:{fontSize:typography.title.fontSize,lineHeight:typography.title.lineHeight,fontWeight:'700'},button:{minHeight:48,borderRadius:radii.control,borderWidth:1,paddingHorizontal:spacing[5],flexDirection:'row',gap:spacing[2],alignItems:'center',justifyContent:'center'},buttonLabel:{fontSize:typography.control.fontSize,lineHeight:typography.control.lineHeight,fontWeight:'600'},iconButton:{width:44,height:44,borderRadius:radii.control,alignItems:'center',justifyContent:'center'},iconText:{fontSize:20,fontWeight:'600'},field:{gap:spacing[2],marginBottom:spacing[4]},label:{fontSize:typography.body.fontSize,lineHeight:typography.body.lineHeight,fontWeight:'600'},inputWrap:{minHeight:48,borderRadius:radii.control,borderWidth:1,flexDirection:'row',alignItems:'center'},input:{flex:1,minHeight:46,paddingHorizontal:spacing[4],fontSize:typography.control.fontSize},help:{fontSize:typography.metadata.fontSize,lineHeight:typography.metadata.lineHeight},card:{borderWidth:1,borderRadius:radii.card,padding:spacing[4]},chip:{minHeight:44,borderWidth:1,borderRadius:radii.chip,paddingHorizontal:spacing[4],alignItems:'center',justifyContent:'center'},notice:{borderRadius:radii.control,padding:spacing[3]},async:{flex:1,minHeight:160,gap:spacing[4],alignItems:'center',justifyContent:'center',padding:spacing[6]},scrim:{...StyleSheet.absoluteFillObject},sheetPosition:{flex:1,justifyContent:'flex-end',pointerEvents:'box-none'},sheet:{borderTopStartRadius:radii.sheet,borderTopEndRadius:radii.sheet,paddingHorizontal:spacing[4],paddingBottom:spacing[8],maxHeight:'92%'},handle:{width:40,height:4,borderRadius:2,alignSelf:'center',marginTop:spacing[2]},sheetHeader:{minHeight:56,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}});
