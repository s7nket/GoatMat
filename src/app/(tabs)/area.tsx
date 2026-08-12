import Feather from '@expo/vector-icons/Feather';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Badge,
  Card,
  EmptyState,
  Input,
  PageHeader,
  PickerSheet,
  ScrollScreen,
  SectionHeader,
  SelectField,
  Segmented,
  Text,
  type PickerOption,
} from '@/components/ui';
import { money, pieces } from '@/lib/format';
import { useProducts, useStock } from '@/lib/queries';
import { colors, radius, spacing } from '@/theme/tokens';

function toNumber(value: string): number {
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * How many mats a floor takes.
 *
 * The sum is not hard -- area divided by the area of one mat, rounded up. What
 * it saves is doing it on a phone calculator in a shed while a customer waits,
 * and then getting the rounding wrong in the customer's favour.
 *
 * Mats are counted whole. Half a mat covers nothing, so every part-mat is a
 * whole mat, and the leftover is shown rather than hidden -- a customer told
 * "300 mats" and handed 300 that leave a bare strip will not come back.
 */
export default function AreaScreen() {
  const insets = useSafeAreaInsets();
  const { data: products = [] } = useProducts();
  const { data: stock = [] } = useStock();

  const [mode, setMode] = useState<'sides' | 'area'>('sides');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [area, setArea] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const product = products.find((p) => p.id === productId) ?? null;
  const matArea =
    product?.width_ft && product?.length_ft ? product.width_ft * product.length_ft : null;

  const floorArea =
    mode === 'sides' ? toNumber(length) * toNumber(width) : toNumber(area);

  const needed = matArea && floorArea > 0 ? Math.ceil(floorArea / matArea) : 0;
  const covered = matArea ? needed * matArea : 0;
  const spare = covered - floorArea;

  const inStock = stock.find((row) => row.id === productId)?.qty_left ?? 0;
  const shortBy = needed - inStock;

  const rateEach = toNumber(rate);
  const cost = needed * rateEach;

  const options: PickerOption[] = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        label: p.name,
        sublabel:
          p.width_ft && p.length_ft
            ? `${p.width_ft} × ${p.length_ft} ft`
            : 'Size not filled in yet',
        meta: p.default_rate ? `${money(p.default_rate)}/pc` : undefined,
      })),
    [products],
  );

  function chooseProduct(option: PickerOption) {
    const picked = products.find((p) => p.id === option.id);
    setProductId(option.id);
    // The usual rate unless one has already been typed for this quote.
    if (picked?.default_rate && !rate) setRate(String(picked.default_rate));
    setPickerOpen(false);
  }

  return (
    <ScrollScreen
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}
      keyboardShouldPersistTaps="handled">
      <PageHeader title="Area" subtitle="How many mats a floor needs" />

      {products.length === 0 ? (
        <EmptyState
          icon="grid"
          title="No products yet"
          message="Add a mat with its width and length, and this will work out how many it takes."
        />
      ) : (
        <>
          <SectionHeader title="The place" />

          <Card style={styles.group}>
            <Segmented
              value={mode}
              onChange={(next) => setMode(next as 'sides' | 'area')}
              options={[
                { value: 'sides', label: 'Length × width' },
                { value: 'area', label: 'Total sq ft' },
              ]}
            />

            {mode === 'sides' ? (
              <View style={styles.row}>
                <Input
                  label="Length (ft)"
                  placeholder="0"
                  keyboardType="decimal-pad"
                  value={length}
                  onChangeText={setLength}
                  containerStyle={styles.flex}
                />
                <Input
                  label="Width (ft)"
                  placeholder="0"
                  keyboardType="decimal-pad"
                  value={width}
                  onChangeText={setWidth}
                  containerStyle={styles.flex}
                />
              </View>
            ) : (
              <Input
                label="Area (sq ft)"
                placeholder="0"
                keyboardType="decimal-pad"
                value={area}
                onChangeText={setArea}
              />
            )}

            {floorArea > 0 ? (
              <Text variant="caption" tone="muted">
                {floorArea.toLocaleString('en-IN')} sq ft to cover
              </Text>
            ) : null}
          </Card>

          <SectionHeader title="The mat" />

          <Card style={styles.group}>
            <SelectField
              label="Product"
              icon="package"
              value={product?.name}
              placeholder="Choose a mat"
              caption={
                product && !matArea
                  ? 'This mat has no width and length yet. Add them on the product.'
                  : matArea
                    ? `${matArea.toLocaleString('en-IN')} sq ft each`
                    : undefined
              }
              onPress={() => setPickerOpen(true)}
            />

            <Input
              label="Rate each"
              placeholder="0"
              money
              hint="Only for the estimate below. Nothing is saved."
              value={rate}
              onChangeText={setRate}
            />
          </Card>

          {needed > 0 ? (
            <>
              <SectionHeader title="Needed" />

              <Card style={styles.result}>
                <View style={styles.headline}>
                  <Text variant="display">{needed.toLocaleString('en-IN')}</Text>
                  <Text variant="body" tone="secondary">
                    {needed === 1 ? 'mat' : 'mats'}
                  </Text>
                </View>

                <View style={styles.divider} />

                <ResultRow
                  label="Covers"
                  value={`${covered.toLocaleString('en-IN')} sq ft`}
                />
                {spare > 0 ? (
                  <ResultRow
                    label="Left over"
                    value={`${Number(spare.toFixed(2)).toLocaleString('en-IN')} sq ft`}
                    hint="Mats are counted whole, so the last one runs past the edge."
                  />
                ) : null}
                {rateEach > 0 ? <ResultRow label="At this rate" value={money(cost)} strong /> : null}

                <View style={styles.stockLine}>
                  {shortBy > 0 ? (
                    <>
                      <Badge label={`${pieces(shortBy)} short`} tone="warning" />
                      <Text variant="caption" tone="secondary" style={styles.flex}>
                        {pieces(inStock)} in stock.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Feather name="check-circle" size={16} color={colors.moneyIn} />
                      <Text variant="caption" tone="secondary" style={styles.flex}>
                        {pieces(inStock)} in stock — enough.
                      </Text>
                    </>
                  )}
                </View>
              </Card>
            </>
          ) : (
            <Card style={styles.hint}>
              <Feather name="grid" size={20} color={colors.textMuted} />
              <Text variant="body" tone="secondary" center>
                {product && !matArea
                  ? 'Add this mat’s width and length on the product screen, then the count appears here.'
                  : 'Enter the place and choose a mat.'}
              </Text>
            </Card>
          )}
        </>
      )}

      <PickerSheet
        visible={pickerOpen}
        title="Choose a mat"
        options={options}
        onSelect={chooseProduct}
        onClose={() => setPickerOpen(false)}
      />
    </ScrollScreen>
  );
}

function ResultRow({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.resultRow}>
      <View style={styles.flex}>
        <Text variant={strong ? 'bodyMedium' : 'body'} tone="secondary">
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Text variant={strong ? 'amount' : 'bodyMedium'}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  result: { gap: spacing.md },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  stockLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hint: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
});
