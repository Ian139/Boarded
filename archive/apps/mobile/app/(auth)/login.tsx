import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppScreen, Button, Field, InlineNotice, TopBar } from '../../components/ui';
import { spacing, typography, useTheme } from '../../lib/theme';
import { useUserStore } from '../../lib/stores/user-store';
import appIcon from '../../assets/icon.png';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { colors } = useTheme();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const login = useUserStore((state) => state.login);
  const authenticated = useUserStore((state) => state.isAuthenticated);
  const authLoading = useUserStore((state) => state.isLoading);

  useEffect(() => {
    if (!authLoading && authenticated) router.replace('/(tabs)');
  }, [authLoading, authenticated]);

  const submit = async () => {
    if (busy) return;
    const clean = email.trim();
    if (!EMAIL.test(clean)) {
      setError('Enter a valid email address.');
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setError('Enter your password.');
      passwordRef.current?.focus();
      return;
    }
    setError('');
    setBusy(true);
    const result = await login(clean, password);
    setBusy(false);
    if (!result.success) {
      const message = result.error || 'We could not log you in. Try again.';
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
    }
  };

  return (
    <AppScreen scroll keyboard contentStyle={{ paddingHorizontal: spacing[5], paddingBottom: spacing[8] }}>
      <TopBar title="Log in" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
      <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: spacing[5], paddingTop: spacing[5] }}>
        <View style={{ alignItems: 'center', gap: spacing[2] }}>
          <Image source={appIcon} style={{ width: 64, height: 64, borderRadius: 16 }} accessibilityLabel="ClimbSet app icon" alt="ClimbSet app icon" />
          <Text accessibilityRole="header" style={{ fontSize: typography.display.fontSize, lineHeight: typography.display.lineHeight, fontWeight: '700', color: colors.text }}>Welcome back</Text>
          <Text style={{ color: colors.textMuted }}>Log in to your ClimbSet account</Text>
        </View>
        {error ? <InlineNotice tone="error" message={error} /> : null}
        <Field ref={emailRef} label="Email" value={email} onChangeText={setEmail} editable={!busy} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
        <Field ref={passwordRef} label="Password" value={password} onChangeText={setPassword} editable={!busy} placeholder="Your password" secureTextEntry autoComplete="password" returnKeyType="done" onSubmitEditing={submit} />
        <Button label={busy ? 'Logging in…' : 'Log in'} onPress={submit} disabled={busy} />
        <Button label="Create an account" variant="ghost" onPress={() => router.push('/(auth)/signup')} disabled={busy} />
      </View>
    </AppScreen>
  );
}
