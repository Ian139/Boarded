import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppScreen, Button, Field, InlineNotice, TopBar } from '../../components/ui';
import { spacing, typography, useTheme } from '../../lib/theme';
import { useUserStore } from '../../lib/stores/user-store';
import appIcon from '../../assets/icon.png';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const signup = useUserStore((state) => state.signup);
  const authenticated = useUserStore((state) => state.isAuthenticated);
  const authLoading = useUserStore((state) => state.isLoading);

  useEffect(() => {
    if (!authLoading && authenticated) router.replace('/(tabs)');
  }, [authLoading, authenticated]);

  const fail = (message: string, ref: React.RefObject<TextInput | null>) => {
    setError(message);
    ref.current?.focus();
    AccessibilityInfo.announceForAccessibility(message);
  };

  const submit = async () => {
    if (busy || confirmationSent) return;
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName) return fail('Enter your display name.', nameRef);
    if (!EMAIL.test(cleanEmail)) return fail('Enter a valid email address.', emailRef);
    if (password.length < 6) return fail('Password must be at least 6 characters.', passwordRef);
    if (password !== confirm) return fail('Passwords do not match.', confirmRef);
    setError('');
    setBusy(true);
    const result = await signup(cleanEmail, password, cleanName);
    setBusy(false);
    if (result.success && result.requiresConfirmation) {
      setConfirmationSent(true);
      AccessibilityInfo.announceForAccessibility('Account created. Check your email to confirm before signing in.');
    } else if (result.success) {
      AccessibilityInfo.announceForAccessibility('Account created.');
    } else {
      fail(result.error || 'We could not create your account. Try again.', emailRef);
    }
  };

  return (
    <AppScreen scroll keyboard contentStyle={{ paddingHorizontal: spacing[5], paddingBottom: spacing[8] }}>
      <TopBar title="Sign up" onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />
      <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: spacing[5], paddingTop: spacing[4] }}>
        <View style={{ alignItems: 'center', gap: spacing[2] }}>
          <Image source={appIcon} style={{ width: 64, height: 64, borderRadius: 16 }} accessibilityLabel="ClimbSet app icon" alt="ClimbSet app icon" />
          <Text accessibilityRole="header" style={{ fontSize: typography.display.fontSize, lineHeight: typography.display.lineHeight, fontWeight: '700', color: colors.text }}>Create your account</Text>
          <Text style={{ color: colors.textMuted }}>Set routes and share beta</Text>
        </View>
        {confirmationSent ? <InlineNotice tone="success" message="Account created. Check your email to confirm before signing in, then log in." /> : error ? <InlineNotice tone="error" message={error} /> : null}
        <Field ref={nameRef} label="Display name" required value={name} onChangeText={setName} editable={!busy && !confirmationSent} textContentType="name" autoComplete="name" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} placeholder="Your name" />
        <Field ref={emailRef} label="Email" required value={email} onChangeText={setEmail} editable={!busy && !confirmationSent} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} placeholder="you@example.com" />
        <Field ref={passwordRef} label="Password" required helper="At least 6 characters" value={password} onChangeText={setPassword} editable={!busy && !confirmationSent} secureTextEntry secureToggle textContentType="newPassword" autoComplete="new-password" returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} placeholder="Create a password" />
        <Field ref={confirmRef} label="Confirm password" required value={confirm} onChangeText={setConfirm} editable={!busy && !confirmationSent} secureTextEntry secureToggle textContentType="newPassword" autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} placeholder="Repeat your password" />
        <Button label={confirmationSent ? 'Confirmation email sent' : 'Create Account'} loading={busy} onPress={submit} disabled={busy || confirmationSent} />
        <Button label="Already have an account? Log in" variant="ghost" onPress={() => router.push({ pathname: '/(auth)/login', params: { email: email.trim() } })} disabled={busy} />
      </View>
    </AppScreen>
  );
}
