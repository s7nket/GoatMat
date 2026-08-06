import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
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
  SelectField,
  StatCard,
  Text,
} from '@/components/ui';
import { money, moneyShort, parseISODate, pieces, prettyDate, toISODate } from '@/lib/format';
import { useReport } from '@/lib/queries';
import { colors, radius, spacing } from '@/theme/tokens';

type Preset = { label: string; range: () => { from: string; to: string } };

/**
 * Presets cover the questions actually asked out loud. Anything else -- a
 * single week two years ago, one supplier's season -- is what the two date
 * fields are for.
 */
const PRESETS: Preset[] = [
  {
    label: 'This month',
    range: () => {
      const now = new Date();
      return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISODate(now) };
    },
  },
  {
    label: 'Last month',
    range: () => {
      const now = new Date();
      return {
        from: toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    },
  },
  {
    label: 'This year',
    range: () => {
      const now = new Date();
      return { from: toISODate(new Date(now.getFullYear(), 0, 1)), to: toISODate(now) };
    },
  },
  {
    label: 'All time',
    // The business did not exist before this; a fixed floor beats guessing.
    range: () => ({ from: '2020-01-01', to: toISODate(new Date()) }),
  },
];

export default function ReportsScreen() {
  const initial = PRESETS[0].range();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const { data, isPending, isError, error, refetch, isRefetching } = useReport(from, to);

  return (
    <Screen>
      <FormHeader title="Reports" subtitle={`${prettyDate(from)} – ${prettyDate(to)}`} />

      <ScrollScreen
        clearsTabBar={false}
        contentContainerStyle={styles.content}
        onRefresh={refetch}
        refreshing={isRefetching}>
        <View style={styles.presets}>
          {PRESETS.map((preset) => {
            const range = preset.range();
            const active = range.from === from && range.to === to;
            return (
              <Text
                key={preset.label}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setFrom(range.from);
                  setTo(range.to);
                }}
                variant="label"
                tone={active ? 'inverse' : 'secondary'}
                style={[styles.preset, active && styles.presetActive]}>
                {preset.label}
              </Text>
            );
          })}
        </View>

        <View style={styles.dates}>
          <SelectField
            label="From"
            icon="calendar"
            value={prettyDate(from)}
            onPress={() => setPicking('from')}
            containerStyle={styles.flex}
          />
          <SelectField
            label="To"
            icon="calendar"
            value={prettyDate(to)}
            onPress={() => setPicking('to')}
            containerStyle={styles.flex}
          />
        </View>

        {isPending ? (
          <LoadingState label="Adding it up" />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Could not build the report.'}
            onRetry={refetch}
          />
        ) : data.salesCount === 0 && data.purchaseCount === 0 ? (
          <EmptyState
            icon="bar-chart-2"
            title="Nothing in this period"
            message="No bills fall between these two dates. Try a wider range."
          />
        ) : (
          <>
            <View style={styles.statGrid}>
              <StatCard
                label="Sold"
                value={moneyShort(data.salesTotal)}
                caption={`${data.salesCount} ${data.salesCount === 1 ? 'bill' : 'bills'}`}
                icon="trending-up"
                tone="success"
              />
              <StatCard
                label="Bought"
                value={moneyShort(data.purchaseTotal)}
                caption={`${data.purchaseCount} ${data.purchaseCount === 1 ? 'bill' : 'bills'}`}
                icon="shopping-bag"
                tone="info"
              />
            </View>

            <Card style={styles.summary}>
              <SummaryRow label="Sold minus bought" value={money(data.margin)} strong />
              <SummaryRow label="Cash actually collected" value={money(data.collected)} />
              <SummaryRow label="Cash actually paid out" value={money(data.paidOut)} />
              <Text variant="caption" tone="muted">
                Sold minus bought is cash flow, not profit — mats bought in this period may sell in
                the next, and expenses are not recorded yet.
              </Text>
            </Card>

            {data.products.length > 0 ? (
              <>
                <SectionHeader title="Product movement" />
                <Card padded={false}>
                  {data.products.map((product, index) => (
                    <View key={product.id}>
                      {index > 0 ? <RowDivider /> : null}
                      <ListRow
                        icon="package"
                        title={product.name}
                        subtitle={`Sold ${pieces(product.soldQty)} · Bought ${pieces(product.boughtQty)}`}
                        value={money(product.soldValue)}
                        valueTone={product.soldValue > 0 ? 'success' : 'muted'}
                        valueCaption="sold"
                        chevron={false}
                      />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            {data.topCustomers.length > 0 ? (
              <>
                <SectionHeader title="Top customers" />
                <Card padded={false}>
                  {data.topCustomers.map((customer, index) => (
                    <View key={customer.id}>
                      {index > 0 ? <RowDivider /> : null}
                      <ListRow
                        icon="user"
                        title={customer.name}
                        subtitle={`${customer.bills} ${customer.bills === 1 ? 'bill' : 'bills'}`}
                        value={money(customer.value)}
                        chevron={false}
                      />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
          </>
        )}
      </ScrollScreen>

      {picking ? (
        <DateTimePicker
          value={parseISODate(picking === 'from' ? from : to)}
          mode="date"
          maximumDate={new Date()}
          onValueChange={(_event, selected) => {
            const field = picking;
            setPicking(null);
            if (!selected) return;
            const value = toISODate(selected);
            // Keep the range the right way round however the user picks it.
            if (field === 'from') {
              setFrom(value);
              if (value > to) setTo(value);
            } else {
              setTo(value);
              if (value < from) setFrom(value);
            }
          }}
          onDismiss={() => setPicking(null)}
        />
      ) : null}
    </Screen>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text variant={strong ? 'bodyMedium' : 'body'} tone="secondary">
        {label}
      </Text>
      <Text variant="amount">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.lg },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preset: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  presetActive: { backgroundColor: colors.primary },
  dates: { flexDirection: 'row', gap: spacing.md },
  statGrid: { flexDirection: 'row', gap: spacing.md },
  summary: { gap: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
