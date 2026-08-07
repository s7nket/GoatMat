import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Badge,
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
import { money, prettyDate } from '@/lib/format';
import { useOffline } from '@/lib/offline';
import type { OutboxJob } from '@/lib/outbox';
import { useBusinessProfile } from '@/lib/queries';
import { colors, spacing } from '@/theme/tokens';

/** Enough to recognise the entry without opening anything. */
function describeJob(job: OutboxJob): string {
  switch (job.type) {
    case 'sale':
      return `Sale to ${job.payload.partyName} · ${money(job.payload.totalAmount)}`;
    case 'purchase':
      return `Purchase from ${job.payload.partyName} · ${money(job.payload.totalAmount)}`;
    case 'product':
      return `Product · ${job.payload.name}`;
    case 'party':
      return `${job.payload.kind === 'customer' ? 'Customer' : 'Supplier'} · ${job.payload.name}`;
  }
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, session, signOut } = useAuth();
  const { data: business, isPending } = useBusinessProfile();
  const { online, pending, failed, syncing, sync, retry, discard } = useOffline();
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

  function confirmDiscard(job: OutboxJob) {
    Alert.alert(
      'Discard this entry?',
      `${describeJob(job)} will be deleted from this phone and never reaches the server. This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => discard(job.id) },
      ],
    );
  }

  function handleSignOut() {
    Alert.alert('Sign out?', 'You will need your email and password to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Screen>
      <FormHeader title="Settings" subtitle="Business details and account" />

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

              <SectionHeader title="Sync" />

              <Card padded={false}>
                <ListRow
                  icon={online ? 'check-circle' : 'wifi-off'}
                  title={online ? 'Connected' : 'Offline'}
                  subtitle={
                    pending.length === 0
                      ? 'Everything has been sent'
                      : `${pending.length} change${pending.length === 1 ? '' : 's'} waiting`
                  }
                  chevron={false}
                />
              </Card>

              {pending.length > 0 && online ? (
                <Button
                  label="Send now"
                  variant="secondary"
                  icon="upload-cloud"
                  loading={syncing}
                  onPress={sync}
                />
              ) : null}

              {failed.length > 0 ? (
                <>
                  <SectionHeader
                    title="Could not be sent"
                    action={<Badge label={`${failed.length}`} tone="danger" />}
                  />
                  <Text variant="caption" tone="secondary" style={styles.failedNote}>
                    The server refused these, so they will not send on their own. Nothing has been
                    thrown away — retry once the cause is fixed, or discard if the entry was wrong.
                  </Text>
                  <Card padded={false}>
                    {failed.map((job, index) => (
                      <View key={job.id}>
                        {index > 0 ? <RowDivider /> : null}
                        <View style={styles.failedRow}>
                          <View style={styles.failedText}>
                            <Text variant="bodyMedium">{describeJob(job)}</Text>
                            <Text variant="caption" tone="danger">
                              {job.lastError ?? 'Rejected by the server.'}
                            </Text>
                            <Text variant="caption" tone="muted">
                              {prettyDate(job.createdAt)} · {job.attempts} attempt
                              {job.attempts === 1 ? '' : 's'}
                            </Text>
                          </View>
                          <View style={styles.failedActions}>
                            <Button
                              label="Retry"
                              size="sm"
                              variant="secondary"
                              onPress={() => retry(job.id)}
                            />
                            <Button
                              label="Discard"
                              size="sm"
                              variant="danger"
                              onPress={() => confirmDiscard(job)}
                            />
                          </View>
                        </View>
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}

              <SectionHeader title="Account" />

              <Card padded={false}>
                <ListRow
                  icon="user"
                  title={profile?.owner_name ?? 'Owner'}
                  subtitle={session?.user.email ?? undefined}
                  chevron={false}
                />
              </Card>

              <View style={styles.signOut}>
                <Text variant="caption" tone="muted">
                  Your books are yours alone — no other account can see or change them.
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
  failedNote: { paddingHorizontal: spacing.xs, marginTop: -spacing.sm },
  failedRow: { padding: spacing.lg, gap: spacing.md },
  failedText: { gap: 2 },
  failedActions: { flexDirection: 'row', gap: spacing.sm },
  signOut: { gap: spacing.md, paddingHorizontal: spacing.xs },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
