import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  FormHeader,
  Input,
  LoadingState,
  Screen,
  ScrollScreen,
  SectionHeader,
  Segmented,
  SelectField,
  Text,
} from '@/components/ui';
import { money, prettyDate, toISODate } from '@/lib/format';
import { useCreatePayment } from '@/lib/mutations';
import { useParty, usePartyBalances } from '@/lib/queries';
import { colors, spacing } from '@/theme/tokens';

type Mode = 'cash' | 'upi' | 'bank';

const MODES: { value: Mode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
];

export default function RecordPaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: party, isPending } = useParty(id);
  const { data: balances } = usePartyBalances();
  const createPayment = useCreatePayment();

  const [amount, setAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [mode, setMode] = useState<Mode>('cash');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const submitting = useRef(false);

  const balance = Number(balances.find((row) => row.id === id)?.balance ?? 0);
  const isCustomer = party?.kind !== 'supplier';
  const outstanding = Math.abs(balance);
  const entered = Number(amount.trim()) || 0;
  const remaining = outstanding - entered;

  async function handleSave() {
    if (submitting.current) return;

    if (entered <= 0) {
      setAmountError('Enter how much was paid.');
      return;
    }
    setAmountError(null);

    submitting.current = true;
    try {
      await createPayment.mutateAsync({
        partyId: id,
        partyName: party?.name ?? 'Unknown',
        payDate: toISODate(payDate),
        amount: entered,
        // A customer paying is money in; settling with a supplier is money out.
        direction: isCustomer ? 'in' : 'out',
        mode,
        note: note.trim() || null,
      });
      router.back();
    } catch (e) {
      submitting.current = false;
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  if (isPending) {
    return (
      <Screen>
        <FormHeader title="Record payment" />
        <LoadingState label="Loading" />
      </Screen>
    );
  }

  return (
    <Screen>
      <FormHeader
        title={isCustomer ? 'Payment received' : 'Payment made'}
        subtitle={party?.name}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <ScrollScreen clearsTabBar={false} contentContainerStyle={styles.content}>
          <Card style={styles.outstanding}>
            <Text variant="label" tone="secondary">
              {isCustomer ? 'Currently owed to you' : 'Currently owed by you'}
            </Text>
            <Text variant="amountLarge" tone={outstanding > 0 ? 'default' : 'muted'}>
              {outstanding > 0 ? money(outstanding) : 'Settled'}
            </Text>
          </Card>

          <Card style={styles.group}>
            <Input
              label="Amount"
              money
              placeholder="0"
              value={amount}
              onChangeText={setAmount}
              error={amountError ?? undefined}
              autoFocus
            />

            {outstanding > 0 && entered === 0 ? (
              <Button
                label={`Pay full ${money(outstanding)}`}
                variant="secondary"
                size="sm"
                onPress={() => setAmount(String(outstanding))}
              />
            ) : null}

            {entered > 0 ? (
              <Text variant="caption" tone={remaining < 0 ? 'warning' : 'secondary'}>
                {remaining > 0
                  ? `${money(remaining)} will remain outstanding.`
                  : remaining === 0
                    ? 'This settles the balance in full.'
                    : `${money(-remaining)} more than owed — the balance will go the other way.`}
              </Text>
            ) : null}

            <SelectField
              label="Date"
              icon="calendar"
              value={prettyDate(payDate)}
              onPress={() => setShowDate(true)}
            />
          </Card>

          <SectionHeader title="Paid by" />
          <Segmented value={mode} onChange={setMode} options={MODES} />

          <Card style={styles.group}>
            <Input
              label="Note"
              placeholder="Optional — reference, who handed it over"
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
            />
          </Card>
        </ScrollScreen>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            label="Save payment"
            size="lg"
            fullWidth
            icon="check"
            loading={createPayment.isPending}
            onPress={handleSave}
          />
        </View>
      </KeyboardAvoidingView>

      {showDate ? (
        <DateTimePicker
          value={payDate}
          mode="date"
          // Money received tomorrow has not been received.
          maximumDate={new Date()}
          onValueChange={(_event, selected) => {
            setShowDate(false);
            if (selected) setPayDate(selected);
          }}
          onDismiss={() => setShowDate(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.lg },
  outstanding: { gap: 2 },
  group: { gap: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
