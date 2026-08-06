import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  PageHeader,
  RowDivider,
  ScrollScreen,
  Text,
} from '@/components/ui';
import { money } from '@/lib/format';
import { usePartyBalances } from '@/lib/queries';
import { colors, radius, spacing } from '@/theme/tokens';

type Filter = 'customer' | 'supplier';

export default function PartiesScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('customer');
  const { data, isPending, isError, error, refetch, isRefetching } = usePartyBalances(filter);

  return (
    <ScrollScreen
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}
      onRefresh={refetch}
      refreshing={isRefetching}>
      <PageHeader title="Parties" subtitle="Who owes what" />

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'customer', label: 'Customers' },
          { value: 'supplier', label: 'Suppliers' },
        ]}
      />

      {isPending ? (
        <LoadingState label="Loading balances" />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not load parties.'}
          onRetry={refetch}
        />
      ) : data.length === 0 ? (
        <EmptyState
          icon="users"
          title={filter === 'customer' ? 'No customers yet' : 'No suppliers yet'}
          message="Parties get added while entering a bill, or from here once the entry screens land."
        />
      ) : (
        <Card padded={false}>
          {data.map((party, index) => {
            const owed = Number(party.balance ?? 0);
            return (
              <View key={party.id}>
                {index > 0 ? <RowDivider /> : null}
                <ListRow
                  leading={<Avatar name={party.name} />}
                  title={party.name}
                  subtitle={party.phone ?? 'No phone saved'}
                  value={owed === 0 ? 'Settled' : money(Math.abs(owed))}
                  valueTone={owed === 0 ? 'muted' : owed > 0 ? 'success' : 'danger'}
                  valueCaption={owed === 0 ? undefined : owed > 0 ? 'to receive' : 'to pay'}
                  chevron={false}
                />
              </View>
            );
          })}
        </Card>
      )}
    </ScrollScreen>
  );
}

/** Two-up pill switch. Kept local until a second screen needs it. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Text
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            variant="label"
            tone={active ? 'default' : 'secondary'}
            center
            style={[styles.segment, active && styles.segmentActive]}>
            {option.label}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  segmentActive: {
    backgroundColor: colors.surface,
    color: colors.text,
  },
});
