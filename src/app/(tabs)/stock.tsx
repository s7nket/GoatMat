import { useRouter } from 'expo-router';
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
import { money, pieces } from '@/lib/format';
import { useStock } from '@/lib/queries';
import { spacing } from '@/theme/tokens';

export default function StockScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isPending, isError, error, refetch, isRefetching } = useStock();

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
                            item.colour,
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
              </View>
            );
          })}
        </Card>
      )}
    </ScrollScreen>
  );
}
