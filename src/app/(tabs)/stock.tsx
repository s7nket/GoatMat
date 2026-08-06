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
      <PageHeader title="Stock" subtitle="Bought minus sold, live" />

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
          message="Add each mat type once. Stock is then bought minus sold, computed live — never typed in."
          actionLabel="Add product"
          onAction={() => router.push({ pathname: '/products/[id]', params: { id: 'new' } })}
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
                  item.qty_left <= 0
                    ? 'danger'
                    : item.qty_left <= item.low_stock_at
                      ? 'default'
                      : 'success'
                }
                valueCaption="in stock"
                onPress={() =>
                  router.push({ pathname: '/products/[id]', params: { id: item.id } })
                }
              />
            </View>
          ))}
        </Card>
      )}
    </ScrollScreen>
  );
}
