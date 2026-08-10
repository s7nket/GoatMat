import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormHeader,
  ListRow,
  LoadingState,
  RowDivider,
  Screen,
  ScrollScreen,
  SectionHeader,
  Text,
} from '@/components/ui';
import type { PartyKind } from '@/lib/database.types';
import { money, prettyDate, shortDate } from '@/lib/format';
import { usePendingBills, usePendingPayments } from '@/lib/offline';
import {
  type LedgerEntry,
  paymentLabel,
  useParty,
  usePartyBalances,
  usePartyLedger,
} from '@/lib/queries';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * A negative balance means different things by party.
 *
 * For a supplier it is the ordinary case: you have taken stock and not paid
 * for it yet. For a customer it can only have come from them paying more than
 * they owed, which is an advance you are holding -- calling that "you owe
 * them" reads as a debt that does not exist.
 */
export function balanceLabel(kind: PartyKind, balance: number): string {
  if (Math.abs(balance) < 0.005) return 'Balance';
  if (balance > 0) return kind === 'supplier' ? 'Overpaid — held with them' : 'They owe you';
  return kind === 'supplier' ? 'You owe them' : 'Advance held for them';
}

export default function PartyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: party, isPending: partyPending, isError, error, refetch } = useParty(id);
  const { data: balances } = usePartyBalances();
  const ledger = usePartyLedger(id, party?.kind);

  const pendingPayments = usePendingPayments(id);
  const pendingSales = usePendingBills('sale');
  const pendingPurchases = usePendingBills('purchase');

  const balance = Number(balances.find((row) => row.id === id)?.balance ?? 0);
  const isCustomer = party?.kind !== 'supplier';
  // Money of theirs sitting with you: a customer who paid ahead, or a supplier
  // you overpaid. Never negative.
  const held = Math.max(0, isCustomer ? -balance : balance);

  // Unsent entries are shown in the same list as the rest of the history,
  // marked, rather than appearing only once they reach the server -- otherwise
  // a payment taken with no signal looks like it was never recorded.
  const entries = useMemo<LedgerEntry[]>(() => {
    const pending: LedgerEntry[] = [
      ...pendingPayments.map((job) => ({
        id: job.id,
        kind: 'payment' as const,
        date: job.payload.payDate,
        delta: (job.payload.direction === 'in' ? -1 : 1) * job.payload.amount,
        amount: job.payload.amount,
        label: paymentLabel(party?.kind, job.payload.direction),
        note: job.payload.note,
        reference: job.payload.reference,
        pending: true,
      })),
      ...[...pendingSales, ...pendingPurchases]
        .filter((job) => job.payload.partyId === id)
        .map((job) => ({
          id: job.id,
          kind: job.type,
          date: job.payload.billDate,
          delta:
            (job.type === 'sale' ? 1 : -1) * (job.payload.totalAmount - job.payload.paidAmount),
          amount: job.payload.totalAmount,
          label: job.type === 'sale' ? 'Sale' : 'Purchase',
          note: job.payload.notes,
          pending: true,
        })),
    ];

    return [...pending, ...(ledger.data ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  }, [pendingPayments, pendingSales, pendingPurchases, ledger.data, id, party?.kind]);

  if (partyPending) {
    return (
      <Screen>
        <FormHeader title="Party" />
        <LoadingState label="Loading" />
      </Screen>
    );
  }

  if (isError || !party) {
    return (
      <Screen>
        <FormHeader title="Party" />
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load this party.'}
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const settled = Math.abs(balance) < 0.005;

  return (
    <Screen>
      <FormHeader
        title={party.name}
        subtitle={isCustomer ? 'Customer' : 'Supplier'}
        right={
          <Button
            label="Edit"
            size="sm"
            variant="secondary"
            icon="edit-2"
            onPress={() => router.push({ pathname: '/parties/[id]/edit', params: { id } })}
          />
        }
      />

      <ScrollScreen
        clearsTabBar={false}
        contentContainerStyle={styles.content}
        onRefresh={ledger.refetch}
        refreshing={ledger.isRefetching}>
        <Card style={styles.summary}>
          <Avatar name={party.name} size={48} />
          <View style={styles.summaryText}>
            <Text variant="label" tone="secondary">
              {balanceLabel(party.kind, balance)}
            </Text>
            <Text
              variant="amountLarge"
              tone={settled ? 'muted' : balance > 0 ? 'success' : 'danger'}>
              {settled ? 'Settled' : money(Math.abs(balance))}
            </Text>
            {party.phone ? (
              <Text variant="caption" tone="secondary">
                {party.phone}
              </Text>
            ) : null}
          </View>
        </Card>

        <Button
          label={isCustomer ? 'Record payment received' : 'Record payment made'}
          size="lg"
          fullWidth
          icon={isCustomer ? 'arrow-down-left' : 'arrow-up-right'}
          onPress={() => router.push({ pathname: '/parties/[id]/payment', params: { id } })}
        />

        {/* Only when money is actually being held -- there is nothing to
            refund otherwise, and an always-visible button invites recording
            one against a balance that does not exist. */}
        {held > 0 ? (
          <Button
            label={isCustomer ? `Refund ${money(held)} advance` : `Collect ${money(held)} back`}
            variant="secondary"
            icon={isCustomer ? 'corner-up-left' : 'corner-down-left'}
            onPress={() =>
              router.push({ pathname: '/parties/[id]/payment', params: { id, refund: '1' } })
            }
          />
        ) : null}

        <SectionHeader title="History" />

        {ledger.isPending && entries.length === 0 ? (
          <LoadingState label="Loading history" />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="Nothing yet"
            message={`No bills or payments for ${party.name} so far.`}
          />
        ) : (
          <Card padded={false}>
            {entries.map((entry, index) => (
              <View key={entry.id}>
                {index > 0 ? <RowDivider /> : null}
                <ListRow
                  leading={
                    <View
                      style={[
                        styles.icon,
                        {
                          backgroundColor:
                            entry.kind === 'payment' ? colors.moneyInSoft : colors.surfaceSunken,
                        },
                      ]}>
                      <Feather
                        name={entry.kind === 'payment' ? 'credit-card' : 'file-text'}
                        size={16}
                        color={entry.kind === 'payment' ? colors.moneyIn : colors.textSecondary}
                      />
                    </View>
                  }
                  title={entry.billNo ? `${entry.label} #${entry.billNo}` : entry.label}
                  subtitle={
                    entry.pending
                      ? `${shortDate(entry.date)} · Waiting to send`
                      : // The reference earns the subtitle over the note: it is
                        // what gets quoted when a payment is disputed.
                        entry.reference
                        ? `${shortDate(entry.date)} · ${entry.reference}`
                        : entry.note
                          ? `${shortDate(entry.date)} · ${entry.note}`
                          : prettyDate(entry.date)
                  }
                  value={money(entry.amount)}
                  valueTone={entry.pending ? 'muted' : entry.kind === 'payment' ? 'success' : 'default'}
                  valueCaption={
                    entry.delta === 0 ? 'settled' : entry.delta > 0 ? 'to receive' : 'cleared'
                  }
                  chevron={false}
                />
              </View>
            ))}
          </Card>
        )}

        {party.notes ? (
          <>
            <SectionHeader title="Notes" />
            <Card>
              <Text variant="body" tone="secondary">
                {party.notes}
              </Text>
            </Card>
          </>
        ) : null}

        {party.address ? (
          <Badge label={party.address} tone="neutral" style={styles.address} />
        ) : null}
      </ScrollScreen>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  summaryText: { flex: 1, gap: 2 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  address: { alignSelf: 'flex-start' },
});
