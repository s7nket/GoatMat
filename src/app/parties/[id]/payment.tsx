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
import { referenceLabelFor } from '@/features/bill-entry';
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
  // `refund` reverses the direction: money going back to a customer who paid
  // ahead and changed their mind, or coming back from a supplier who was
  // overpaid. Recorded as its own entry rather than by voiding the original --
  // two things happened, and the ledger should say both.
  const { id, refund } = useLocalSearchParams<{ id: string; refund?: string }>();
  const isRefund = refund === '1';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: party, isPending } = useParty(id);
  const { data: balances } = usePartyBalances();
  const createPayment = useCreatePayment();

  const [amount, setAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [mode, setMode] = useState<Mode>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const submitting = useRef(false);

  const balance = Number(balances.find((row) => row.id === id)?.balance ?? 0);
  const isCustomer = party?.kind !== 'supplier';

  // Normally: what they still owe. On a refund: what is being held that could
  // be given back. Never negative -- taking the absolute value would show a
  // customer already in credit as though they owed that advance back.
  const owed = Math.max(0, isCustomer ? balance : -balance);
  const held = Math.max(0, isCustomer ? -balance : balance);
  const outstanding = isRefund ? held : owed;

  const entered = Number(amount.trim()) || 0;
  const remaining = outstanding - entered;
  const referenceLabel = referenceLabelFor(mode);

  // A customer paying is money in and a refund to them is money out; for a
  // supplier both are reversed. Derived rather than asked -- a payment
  // recorded in the wrong direction doubles the error in the balance.
  const direction: 'in' | 'out' = isCustomer ? (isRefund ? 'out' : 'in') : isRefund ? 'in' : 'out';

  function handleSave() {
    if (submitting.current) return;

    if (entered <= 0) {
      setAmountError('Enter how much was paid.');
      return;
    }
    setAmountError(null);

    // Only ask when it is genuinely ambiguous: they owed something, and more
    // than that came in. Taking money from someone who owes nothing is an
    // advance and nothing else -- the line under the field already said so,
    // and confirming an unambiguous action just trains people to tap through.
    if (outstanding > 0 && entered > outstanding) {
      const excess = entered - outstanding;

      Alert.alert(
        isRefund ? 'More than is held' : 'More than is owed',
        isRefund
          ? outstanding > 0
            ? `${money(outstanding)} is held for ${party?.name ?? 'them'}. Returning ${money(entered)} leaves ${money(excess)} owed to you.`
            : `Nothing is held, so all ${money(entered)} will be owed back to you.`
          : outstanding > 0
            ? `${party?.name ?? 'They'} owes ${money(outstanding)}. Taking ${money(entered)} leaves ${money(excess)} as an advance.`
            : `Nothing is outstanding, so all ${money(entered)} will be held as an advance.`,
        [
          { text: 'Change amount', style: 'cancel' },
          { text: isRefund ? 'Refund anyway' : 'Record as advance', onPress: save },
        ],
      );
      return;
    }

    void save();
  }

  async function save() {
    submitting.current = true;
    try {
      await createPayment.mutateAsync({
        partyId: id,
        partyName: party?.name ?? 'Unknown',
        payDate: toISODate(payDate),
        amount: entered,
        direction,
        mode,
        note: note.trim() || null,
        reference: referenceLabel ? reference.trim() || null : null,
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
        title={
          isRefund
            ? isCustomer
              ? 'Refund advance'
              : 'Refund received'
            : isCustomer
              ? 'Payment received'
              : 'Payment made'
        }
        subtitle={party?.name}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <ScrollScreen clearsTabBar={false} contentContainerStyle={styles.content}>
          <Card style={styles.outstanding}>
            <Text variant="label" tone="secondary">
              {isRefund
                ? isCustomer
                  ? 'Advance held for them'
                  : 'Held with them'
                : isCustomer
                  ? 'Currently owed to you'
                  : 'Currently owed by you'}
            </Text>
            <Text variant="amountLarge" tone={outstanding > 0 ? 'default' : 'muted'}>
              {outstanding > 0 ? money(outstanding) : 'Nothing'}
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
                label={isRefund ? `Refund all ${money(outstanding)}` : `Pay full ${money(outstanding)}`}
                variant="secondary"
                size="sm"
                onPress={() => setAmount(String(outstanding))}
              />
            ) : null}

            {/* Says what the entry will mean, as it is typed. This is what
                replaces making the user choose between a payment and an
                advance up front -- the app works it out from the balance. */}
            {entered > 0 ? (
              <Text variant="caption" tone={remaining < 0 ? 'warning' : 'secondary'}>
                {isRefund
                  ? remaining > 0
                    ? `${money(remaining)} will stay held.`
                    : remaining === 0
                      ? 'This returns the whole advance.'
                      : `${money(-remaining)} more than held — they will owe you that much.`
                  : outstanding === 0
                    ? `${money(entered)} held as an advance against future bills.`
                    : remaining > 0
                      ? `${money(remaining)} will remain outstanding.`
                      : remaining === 0
                        ? 'Settles the balance in full.'
                        : `Settles ${money(outstanding)} · ${money(-remaining)} held as an advance.`}
              </Text>
            ) : null}

            <SelectField
              label="Date"
              icon="calendar"
              value={prettyDate(payDate)}
              onPress={() => setShowDate(true)}
            />
          </Card>

          <SectionHeader title={isRefund ? 'Returned by' : 'Paid by'} />
          <Segmented value={mode} onChange={setMode} options={MODES} />

          <Card style={styles.group}>
            {/* Cash leaves no trace, so there is nothing to reference. */}
            {referenceLabel ? (
              <Input
                label={referenceLabel}
                placeholder="Optional"
                hint="What you would quote if this payment is ever questioned."
                autoCapitalize="characters"
                autoCorrect={false}
                value={reference}
                onChangeText={setReference}
              />
            ) : null}

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
            label={isRefund ? 'Save refund' : 'Save payment'}
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
