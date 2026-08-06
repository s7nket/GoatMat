import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
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

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isPending, isError, error, refetch, isRefetching } = useStock();

  return (
    <ScrollScreen
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}
      onRefresh={refetch}
      refreshing={isRefetching}>
      <PageHeader title="Reports" subtitle="Stock now; date-range reports in phase 5" />

      <SectionHeader title="Stock on hand" />

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
          message="Products get added in phase 1. Stock is then bought-minus-sold, computed live."
        />
      ) : (
        <Card padded={false}>
          {data.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <RowDivider /> : null}
              <ListRow
                icon="package"
                title={item.name}
                subtitle={[
                  item.size,
                  item.gsm ? `${item.gsm} GSM` : null,
                  item.default_rate ? `${money(item.default_rate)}/pc` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                value={pieces(item.qty_left)}
                valueTone={
                  item.qty_left <= 0 ? 'danger' : item.qty_left <= item.low_stock_at ? 'default' : 'success'
                }
                valueCaption="in stock"
                chevron={false}
              />
            </View>
          ))}
        </Card>
      )}
    </ScrollScreen>
  );
}
