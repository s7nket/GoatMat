import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  FormHeader,
  Input,
  ListRow,
  LoadingState,
  RowDivider,
  Screen,
  ScrollScreen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useSaveBusinessProfile } from '@/lib/mutations';
import { useBusinessProfile } from '@/lib/queries';
import { colors, spacing } from '@/theme/tokens';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { member, session, signOut } = useAuth();
  const { data: business, isPending } = useBusinessProfile();
  const save = useSaveBusinessProfile();

  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [footer, setFooter] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!business) return;
    setName(business.business_name ?? '');
    setOwner(business.owner_name ?? '');
    setPhone(business.phone ?? '');
    setAddress(business.address ?? '');
    setFooter(business.bill_footer ?? '');
  }, [business]);

  async function handleSave() {
    if (!name.trim()) {
      setNameError('The business needs a name — it heads every bill.');
      return;
    }
    setNameError(null);

    try {
      await save.mutateAsync({
        business_name: name.trim(),
        owner_name: owner.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        bill_footer: footer.trim() || null,
      });
      Alert.alert('Saved', 'New bills will carry these details.');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out?', 'You will need your email and password to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Screen>
      <FormHeader title="Settings" subtitle="Bill header and account" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        {isPending ? (
          <LoadingState label="Loading settings" />
        ) : (
          <>
            <ScrollScreen clearsTabBar={false} contentContainerStyle={styles.content}>
              <SectionHeader title="Printed on every bill" />

              <Card style={styles.group}>
                <Input
                  label="Business name"
                  placeholder="Your business name"
                  value={name}
                  onChangeText={setName}
                  error={nameError ?? undefined}
                  autoCapitalize="words"
                />
                <Input
                  label="Owner name"
                  placeholder="Optional"
                  value={owner}
                  onChangeText={setOwner}
                  autoCapitalize="words"
                />
                <Input
                  label="Phone"
                  icon="phone"
                  placeholder="Optional"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
                <Input
                  label="Address"
                  placeholder="Optional"
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  textAlignVertical="top"
                />
                <Input
                  label="Bill footer"
                  placeholder="Thank you for your business."
                  hint="Shown at the bottom of the PDF."
                  value={footer}
                  onChangeText={setFooter}
                />
              </Card>

              <SectionHeader title="Account" />

              <Card padded={false}>
                <ListRow
                  icon="user"
                  title={member?.full_name ?? 'Member'}
                  subtitle={session?.user.email ?? undefined}
                  chevron={false}
                />
                <RowDivider />
                <ListRow
                  icon="shield"
                  title="Role"
                  subtitle={member?.role === 'owner' ? 'Owner' : 'Staff'}
                  chevron={false}
                />
              </Card>

              <View style={styles.signOut}>
                <Text variant="caption" tone="muted">
                  Access is managed in Supabase. Removing someone there cuts them off everywhere,
                  without touching their phone.
                </Text>
                <Button
                  label="Sign out"
                  variant="secondary"
                  icon="log-out"
                  onPress={handleSignOut}
                />
              </View>
            </ScrollScreen>

            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <Button
                label="Save details"
                size="lg"
                fullWidth
                icon="check"
                loading={save.isPending}
                onPress={handleSave}
              />
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.lg },
  group: { gap: spacing.lg },
  signOut: { gap: spacing.md, paddingHorizontal: spacing.xs },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
