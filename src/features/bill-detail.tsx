import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
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
import { shareBillPdf } from '@/features/bill-pdf';
import { useOffline } from '@/lib/offline';
import { money, pieces, prettyDate } from '@/lib/format';
import { useVoidBill } from '@/lib/mutations';
import { useBill, useBusinessProfile } from '@/lib/queries';
import { colors, radius, spacing } from '@/theme/tokens';

const MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank',
  credit: 'Udhaar',
};

export function BillDetail({ kind, id }: { kind: 'sale' | 'purchase'; id: string }) {
  const isSale = kind === 'sale';
  const router = useRouter();
  const { data: bill, isPending, isError, error, refetch } = useBill(kind, id);
  const { data: business } = useBusinessProfile();
  const { online } = useOffline();
  const voidBill = useVoidBill(kind);
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (!bill) return;
    if (!online) {
      // The PDF prints a bill number, and a queued bill has not been given one
      // yet. Sending it now would put a bill with no number in a customer's
      // hands, and a different number in the books later.
      Alert.alert(
        'Not available offline',
        'The bill needs to reach the server before it can be sent, so it carries the right bill number.',
      );
      return;
    }
    setSharing(true);
    try {
      await shareBillPdf({ kind, bill, business: business ?? null });
    } catch (e) {
      Alert.alert('Could not create the PDF', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSharing(false);
    }
  }

  function handleVoid() {
    if (!online) {
      Alert.alert(
        'Not available offline',
        'Voiding changes a bill the server already holds, so it needs a connection.',
      );
      return;
    }

    Alert.alert(
      'Void this bill?',
      'The bill stays on record but stops counting towards stock, balances and reports. ' +
        'Enter a fresh bill with the correct details.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void bill',
          style: 'destructive',
          onPress: async () => {
            try {
              await voidBill.mutateAsync({ id, reason: null });
              router.back();
            } catch (e) {
              Alert.alert('Could not void', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );
  }

  if (isPending) {
    return (
      <Screen>
        <FormHeader title={isSale ? 'Sale' : 'Purchase'} />
        <LoadingState label="Loading bill" />
      </Screen>
    );
  }

  if (isError || !bill) {
    return (
      <Screen>
        <FormHeader title={isSale ? 'Sale' : 'Purchase'} />
        <ErrorState
          message={
            isError
              ? error instanceof Error
                ? error.message
                : 'Could not load this bill.'
              : 'This bill no longer exists.'
          }
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const balance = Number(bill.total_amount) - Number(bill.paid_amount);
  const totalPieces = bill.items.reduce((sum, item) => sum + item.qty, 0);
  const voided = !!bill.voided_at;

  return (
    <Screen>
      <FormHeader
        title={`${isSale ? 'Sale' : 'Purchase'} #${bill.bill_no}`}
        subtitle={prettyDate(bill.bill_date)}
        right={
          <Button
            label={isSale ? 'Send' : 'Share'}
            size="sm"
            icon="share-2"
            loading={sharing}
            onPress={handleShare}
          />
        }
      />

      <ScrollScreen clearsTabBar={false} contentContainerStyle={styles.content}>
        {voided ? (
          <View style={styles.voidBanner}>
            <Text variant="label" tone="danger">
              Voided {prettyDate(bill.voided_at)}
            </Text>
            <Text variant="caption" tone="secondary">
              This bill does not count towards stock, balances or reports.
            </Text>
          </View>
        ) : null}

        <Card padded={false}>
          <ListRow
            icon="user"
            title={bill.party?.name ?? 'Unknown party'}
            subtitle={bill.party?.phone ?? (isSale ? 'Customer' : 'Supplier')}
            chevron={false}
          />
          {bill.supplier_ref ? (
            <>
              <RowDivider />
              <ListRow
                icon="hash"
                title="Supplier's bill number"
                subtitle={bill.supplier_ref}
                chevron={false}
              />
            </>
          ) : null}
        </Card>

        <SectionHeader title={`Items · ${pieces(totalPieces)}`} />

        <Card padded={false}>
          {bill.items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <RowDivider /> : null}
              <ListRow
                icon="package"
                title={item.product?.name ?? 'Removed product'}
                subtitle={`${item.qty} × ${money(item.rate)}`}
                value={money(item.amount)}
                chevron={false}
              />
            </View>
          ))}
        </Card>

        <Card style={styles.totals}>
          <TotalRow label="Total" value={money(bill.total_amount)} strong />
          <TotalRow label="Paid" value={money(bill.paid_amount)} />
          <TotalRow
            label={isSale ? 'To receive' : 'To pay'}
            value={money(balance)}
            tone={balance > 0 ? (isSale ? 'success' : 'danger') : 'muted'}
          />
          {bill.payment_mode ? (
            <View style={styles.modeRow}>
              <Badge label={MODE_LABELS[bill.payment_mode] ?? bill.payment_mode} tone="neutral" />
            </View>
          ) : null}
        </Card>

        {bill.reference ? (
          <Card padded={false}>
            <ListRow
              icon="hash"
              title={bill.payment_mode === 'upi' ? 'UTR / transaction ID' : 'Transaction reference'}
              subtitle="Quote this if the payment is ever questioned"
              value={bill.reference}
              chevron={false}
            />
          </Card>
        ) : null}

        {bill.notes ? (
          <Card style={styles.notes}>
            <Text variant="overline" tone="muted">
              Notes
            </Text>
            <Text variant="body">{bill.notes}</Text>
          </Card>
        ) : null}

        {!voided ? (
          <View style={styles.danger}>
            <Text variant="caption" tone="muted">
              Bills are never edited. To correct one, void it and enter a fresh bill — the record of
              what was originally entered stays intact.
            </Text>
            <Button
              label="Void bill"
              variant="danger"
              icon="slash"
              loading={voidBill.isPending}
              onPress={handleVoid}
            />
          </View>
        ) : null}
      </ScrollScreen>
    </Screen>
  );
}

function TotalRow({
  label,
  value,
  strong,
  tone = 'default',
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'default' | 'success' | 'danger' | 'muted';
}) {
  return (
    <View style={styles.totalRow}>
      <Text variant={strong ? 'bodyMedium' : 'body'} tone="secondary">
        {label}
      </Text>
      <Text variant="amount" tone={tone}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },
  voidBanner: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  totals: { gap: spacing.sm },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeRow: { paddingTop: spacing.sm },
  notes: { gap: spacing.xs },
  danger: { gap: spacing.md, paddingHorizontal: spacing.xs },
});
