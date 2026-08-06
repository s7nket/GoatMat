import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  PageHeader,
  RowDivider,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { money, prettyDate, shortDate } from '@/lib/format';
import { type BillListRow, usePurchases, useSales } from '@/lib/queries';
import { spacing } from '@/theme/tokens';

/** Groups bills under date headings so a busy day reads as one block. */
function groupByDate(bills: BillListRow[]) {
  const groups = new Map<string, BillListRow[]>();
  for (const bill of bills) {
    const existing = groups.get(bill.bill_date);
    if (existing) existing.push(bill);
    else groups.set(bill.bill_date, [bill]);
  }
  return [...groups.entries()];
}

export function BillList({ kind }: { kind: 'sale' | 'purchase' }) {
  const isSale = kind === 'sale';
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const sales = useSales();
  const purchases = usePurchases();
  const query = isSale ? sales : purchases;
  const { data, isPending, isError, error, refetch, isRefetching } = query;

  const groups = useMemo(() => groupByDate(data ?? []), [data]);

  function openNew() {
    router.push(
      isSale
        ? { pathname: '/sales/[id]', params: { id: 'new' } }
        : { pathname: '/purchases/[id]', params: { id: 'new' } },
    );
  }

  return (
    <ScrollScreen
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}
      onRefresh={refetch}
      refreshing={isRefetching}>
      <PageHeader
        title={isSale ? 'Sales' : 'Purchases'}
        subtitle={isSale ? 'Bills raised to customers' : 'Stock bought from suppliers'}
        right={<Button label="New" size="sm" icon="plus" onPress={openNew} />}
      />

      {isPending ? (
        <LoadingState label="Loading bills" />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load bills.'}
          onRetry={refetch}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={isSale ? 'trending-up' : 'shopping-bag'}
          title={isSale ? 'No sales yet' : 'No purchases yet'}
          message={
            isSale
              ? 'Raise a bill: pick the customer, add mats by piece, save.'
              : 'Recording a purchase is how stock goes up — it is never typed in directly.'
          }
          actionLabel={isSale ? 'New sale' : 'New purchase'}
          onAction={openNew}
        />
      ) : (
        groups.map(([date, bills]) => (
          <View key={date} style={{ gap: spacing.lg }}>
            <SectionHeader title={prettyDate(date)} />
            <Card padded={false}>
              {bills.map((bill, index) => {
                const balance = Number(bill.total_amount) - Number(bill.paid_amount);
                return (
                  <View key={bill.id}>
                    {index > 0 ? <RowDivider /> : null}
                    <ListRow
                      icon={isSale ? 'trending-up' : 'shopping-bag'}
                      title={bill.party?.name ?? 'Unknown party'}
                      subtitle={
                        balance > 0
                          ? `#${bill.bill_no} · ${money(balance)} ${isSale ? 'to receive' : 'to pay'}`
                          : `#${bill.bill_no} · settled`
                      }
                      value={money(bill.total_amount)}
                      valueCaption={shortDate(bill.bill_date)}
                      onPress={() =>
                        router.push(
                          isSale
                            ? { pathname: '/sales/[id]', params: { id: bill.id } }
                            : { pathname: '/purchases/[id]', params: { id: bill.id } },
                        )
                      }
                    />
                  </View>
                );
              })}
            </Card>
          </View>
        ))
      )}
    </ScrollScreen>
  );
}
