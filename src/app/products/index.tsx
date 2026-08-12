import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormHeader,
  ListRow,
  LoadingState,
  RowDivider,
  ScrollScreen,
  Screen,
} from '@/components/ui';
import { money } from '@/lib/format';
import { useProducts } from '@/lib/queries';
import { spacing } from '@/theme/tokens';

export default function ProductsScreen() {
  const router = useRouter();
  const { data, isPending, isError, error, refetch, isRefetching } = useProducts();

  return (
    <Screen>
      <FormHeader
        title="Products"
        subtitle="Your catalogue"
        right={
          <Button
            label="Add"
            size="sm"
            icon="plus"
            onPress={() => router.push({ pathname: '/products/[id]', params: { id: 'new' } })}
          />
        }
      />

      <ScrollScreen
        clearsTabBar={false}
        contentContainerStyle={styles.content}
        onRefresh={refetch}
        refreshing={isRefetching}>
        {isPending ? (
          <LoadingState label="Loading products" />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Could not load products.'}
            onRetry={refetch}
          />
        ) : data.length === 0 ? (
          <EmptyState
            icon="package"
            title="No products yet"
            message="Add each mat type once — size, GSM and your usual rate — and it will be ready to pick on every bill."
            actionLabel="Add product"
            onAction={() => router.push({ pathname: '/products/[id]', params: { id: 'new' } })}
          />
        ) : (
          <Card padded={false}>
            {data.map((product, index) => (
              <View key={product.id}>
                {index > 0 ? <RowDivider /> : null}
                <ListRow
                  icon="package"
                  title={product.name}
                  subtitle={
                    [product.size, product.gsm ? `${product.gsm} GSM` : null]
                      .filter(Boolean)
                      .join(' · ') || 'No details set'
                  }
                  value={product.default_rate ? money(product.default_rate) : '—'}
                  valueTone={product.default_rate ? 'default' : 'muted'}
                  valueCaption={product.default_rate ? 'per piece' : undefined}
                  onPress={() =>
                    router.push({ pathname: '/products/[id]', params: { id: product.id } })
                  }
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollScreen>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },
});
