import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  ErrorState,
  FormHeader,
  Input,
  LoadingState,
  Screen,
  ScrollScreen,
  Segmented,
  Text,
} from '@/components/ui';
import type { PartyKind } from '@/lib/database.types';
import { useArchiveParty, useSaveParty } from '@/lib/mutations';
import { useParty } from '@/lib/queries';
import { colors, spacing } from '@/theme/tokens';

export function PartyForm({ id, kindParam }: { id: string; kindParam?: PartyKind }) {
  const isNew = id === 'new';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: party, isPending, isError, error, refetch } = useParty(id);
  const save = useSaveParty();
  const archive = useArchiveParty();

  const [kind, setKind] = useState<PartyKind>(kindParam ?? 'customer');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  // Hydrate the form once the row arrives. The fields are edited locally
  // afterwards, so they cannot simply be derived from the query.
  useEffect(() => {
    if (!party) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKind(party.kind);
    setName(party.name);
    setPhone(party.phone ?? '');
    setAddress(party.address ?? '');
    setNotes(party.notes ?? '');
  }, [party]);

  async function handleSave() {
    if (!name.trim()) {
      setNameError('Enter a name.');
      return;
    }
    setNameError(null);

    try {
      await save.mutateAsync({
        id: isNew ? undefined : id,
        kind,
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  function handleArchive() {
    Alert.alert(
      'Archive party?',
      `${party?.name ?? 'This party'} will stop appearing on new bills. Past bills and balances keep them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archive.mutateAsync(id);
              router.back();
            } catch (e) {
              Alert.alert('Could not archive', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );
  }

  const busy = save.isPending || archive.isPending;
  const noun = kind === 'customer' ? 'customer' : 'supplier';

  return (
    <Screen>
      <FormHeader
        title={isNew ? `New ${noun}` : `Edit ${noun}`}
        subtitle={isNew ? undefined : party?.name}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        {!isNew && isPending ? (
          <LoadingState label="Loading party" />
        ) : !isNew && isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Could not load this party.'}
            onRetry={refetch}
          />
        ) : (
          <>
            <ScrollScreen clearsTabBar={false} contentContainerStyle={styles.content}>
              {isNew ? (
                <Segmented
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: 'customer', label: 'Customer' },
                    { value: 'supplier', label: 'Supplier' },
                  ]}
                />
              ) : null}

              <Card style={styles.group}>
                <Input
                  label="Name"
                  placeholder={kind === 'customer' ? 'Ramesh Traders' : 'Mat supplier name'}
                  value={name}
                  onChangeText={setName}
                  error={nameError ?? undefined}
                  autoCapitalize="words"
                  editable={!busy}
                />
                <Input
                  label="Phone"
                  placeholder="9876543210"
                  icon="phone"
                  keyboardType="phone-pad"
                  hint="Used to send the bill on WhatsApp later."
                  value={phone}
                  onChangeText={setPhone}
                  editable={!busy}
                />
                <Input
                  label="Address"
                  placeholder="Village, taluka"
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  textAlignVertical="top"
                  editable={!busy}
                />
              </Card>

              <Card style={styles.group}>
                <Input
                  label="Notes"
                  placeholder="Payment terms, who introduced them, anything"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  textAlignVertical="top"
                  editable={!busy}
                />
              </Card>

              {!isNew ? (
                <View style={styles.danger}>
                  <Text variant="caption" tone="muted">
                    Archiving hides them from new bills. Their balance and history stay intact.
                  </Text>
                  <Button
                    label="Archive party"
                    variant="danger"
                    icon="archive"
                    onPress={handleArchive}
                    disabled={busy}
                  />
                </View>
              ) : null}
            </ScrollScreen>

            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <Button
                label={isNew ? `Add ${noun}` : 'Save changes'}
                size="lg"
                fullWidth
                icon="check"
                loading={save.isPending}
                disabled={busy}
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
  danger: { gap: spacing.md, paddingHorizontal: spacing.xs },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
