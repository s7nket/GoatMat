import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
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
  Text,
} from '@/components/ui';
import { money, pieces } from '@/lib/format';
import { useColourStock, useStock } from '@/lib/queries';
import { colors, spacing } from '@/theme/tokens';

export default function StockScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isPending, isError, error, refetch, isRefetching } = useStock();
  const { data: colourStock = [] } = useColourStock();

  // Only the colours worth naming. A product bought before colours were
  // recorded has one nameless row that says nothing the product row does not.
  const coloursByProduct = useMemo(() => {
    const map = new Map<string, { colour: string; qty_left: number }[]>();
    for (const row of colourStock) {
      if (!row.colour) continue;
      const list = map.get(row.product_id) ?? [];
      list.push({ colour: row.colour, qty_left: row.qty_left });
      map.set(row.product_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.qty_left - a.qty_left);
    return map;
  }, [colourStock]);

  return (
    <ScrollScreen
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}
      onRefresh={refetch}
      refreshing={isRefetching}>
      <PageHeader title="Stock" subtitle="Live, from your bills" />

      <SectionHeader
        title="On hand"
        action={
          <Button
            label="Products"
            size="sm"
            variant="ghost"
            iconRight="chevron-right"
            onPress={() => router.push('/products')}
          />
        }
      />

      {isPending ? (
        <LoadingState label="Counting stock" />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load stock.'}
          onRetry={refetch}
        />
      ) : data.length === 0 ? (
        <EmptyState
          icon="package"
          title="No products yet"
          message="Add each mat type once, then your stock keeps itself up to date as you buy and sell."
          actionLabel="Add product"
          onAction={() => router.push({ pathname: '/products/[id]', params: { id: 'new' } })}
        />
      ) : (
        <Card padded={false}>
          {data.map((item, index) => {
            // Below zero means more has been sold than was ever bought, which
            // is never true of physical stock -- it means purchases are
            // missing, or were entered against a different product.
            const impossible = item.qty_left < 0;
            const byColour = coloursByProduct.get(item.id) ?? [];
            return (
              <View key={item.id}>
                {index > 0 ? <RowDivider /> : null}
                <ListRow
                  icon={impossible ? 'alert-triangle' : 'package'}
                  title={item.name}
                  subtitle={
                    impossible
                      ? 'More sold than bought — a purchase is missing'
                      : item.archived
                        ? 'Archived, but still holding stock'
                        : [
                            item.size,
                            item.gsm ? `${item.gsm} GSM` : null,
                            item.default_rate ? `${money(item.default_rate)}/pc` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                  }
                  value={impossible ? `−${pieces(Math.abs(item.qty_left))}` : pieces(item.qty_left)}
                  valueTone={
                    impossible || item.qty_left === 0
                      ? 'danger'
                      : item.qty_left <= item.low_stock_at
                        ? 'default'
                        : 'success'
                  }
                  valueCaption={impossible ? 'check this' : 'in stock'}
                  onPress={() =>
                    router.push({ pathname: '/products/[id]', params: { id: item.id } })
                  }
                />
                {byColour.length > 0 ? (
                  <View style={styles.colours}>
                    {byColour.map((row) => (
                      <View key={row.colour} style={styles.colourRow}>
                        <Text variant="caption" tone="muted" style={styles.colourName}>
                          {row.colour}
                        </Text>
                        <Text variant="caption" tone={row.qty_left <= 0 ? 'danger' : 'muted'}>
                          {row.qty_left < 0
                            ? `−${pieces(Math.abs(row.qty_left))}`
                            : pieces(row.qty_left)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  colours: {
    gap: spacing.xs,
    paddingLeft: spacing.xl + spacing.lg,
    paddingRight: spacing.lg,
    paddingBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  colourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
    paddingVertical: 2,
  },
  colourName: { flex: 1 },
});
