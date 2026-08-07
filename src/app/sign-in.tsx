import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      // On success the root navigator swaps to the tabs -- nothing to do here.
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign in failed.';
      // Supabase returns this verbatim; it is the one users actually hit.
      setError(
        message.toLowerCase().includes('invalid login')
          ? 'Wrong email or password.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing['4xl'], paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Feather name="layers" size={28} color={colors.textInverse} />
            </View>
            <View style={styles.brandText}>
              <Text variant="display" center>
                GoatMat
              </Text>
              <Text variant="body" tone="secondary" center>
                Purchases, sales and stock, in one place
              </Text>
            </View>
          </View>

          <Card style={styles.form}>
            <Text variant="heading">Sign in</Text>

            <Input
              label="Email"
              icon="mail"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              editable={!busy}
            />

            <View>
              <Input
                label="Password"
                icon="lock"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleSignIn}
                editable={!busy}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={12}
                onPress={() => setShowPassword((v) => !v)}
                style={styles.reveal}>
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.error}>
                <Feather name="alert-circle" size={16} color={colors.danger} />
                <Text variant="caption" tone="danger" style={styles.flex}>
                  {error}
                </Text>
              </View>
            ) : null}

            <Button
              label="Sign in"
              size="lg"
              fullWidth
              iconRight="arrow-right"
              loading={busy}
              onPress={handleSignIn}
              style={styles.submit}
            />
          </Card>

          <View style={styles.footer}>
            <Feather name="lock" size={12} color={colors.textMuted} />
            <Text variant="caption" tone="muted" center>
              Your books are private to your account
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing['3xl'],
  },
  brand: { gap: spacing.xl, alignItems: 'center' },
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
    shadowColor: colors.primaryDark,
  },
  brandText: { gap: spacing.xs },
  // The form sits on its own raised surface so the eye lands on it rather than
  // drifting between the mark and the fields.
  form: { gap: spacing.lg, padding: spacing.xl },
  reveal: {
    position: 'absolute',
    right: spacing.md,
    // Sits over the field, clear of the label above it.
    top: 34,
    padding: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  submit: { marginTop: spacing.xs },
});
