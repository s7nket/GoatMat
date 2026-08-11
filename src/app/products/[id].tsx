import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  ErrorState,
  FormHeader,
  Input,
  LoadingState,
  Screen,
  ScrollScreen,
  Text,
} from '@/components/ui';
import { useArchiveProduct, useSaveProduct } from '@/lib/mutations';
import { pieces } from '@/lib/format';
import { useProduct, useStock } from '@/lib/queries';
import { colors, spacing } from '@/theme/tokens';

/** Empty string means "not set" -- distinct from 0, which is a real rate. */
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: product, isPending, isError, error, refetch } = useProduct(id);
  const { data: stock = [] } = useStock();
  const save = useSaveProduct();
  const archive = useArchiveProduct();

  const inStock = stock.find((row) => row.id === id)?.qty_left ?? 0;

  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [gsm, setGsm] = useState('');
  const [spec, setSpec] = useState('');
  const [colour, setColour] = useState('');
  const [rate, setRate] = useState('');
  const [lowStock, setLowStock] = useState('0');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  // Fill the form once the row arrives. Editing before it lands is impossible
  // because the screen renders a loader until then.
  useEffect(() => {
    if (!product) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(product.name);
    setSize(product.size ?? '');
    setGsm(product.gsm ? String(product.gsm) : '');
    setSpec(product.spec ?? '');
    setColour(product.colour ?? '');
    setRate(product.default_rate ? String(product.default_rate) : '');
    setLowStock(String(product.low_stock_at ?? 0));
    setNotes(product.notes ?? '');
  }, [product]);

  async function handleSave() {
    if (!name.trim()) {
      setNameError('Give the product a name.');
      return;
    }
    setNameError(null);

    try {
      await save.mutateAsync({
        id: isNew ? undefined : id,
        name: name.trim(),
        size: size.trim() || null,
        gsm: toNumberOrNull(gsm),
        spec: spec.trim() || null,
        colour: colour.trim() || null,
        default_rate: toNumberOrNull(rate),
        low_stock_at: toNumberOrNull(lowStock) ?? 0,
        notes: notes.trim() || null,
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  function handleArchive() {
    // Archiving is meant to hide a product from new bills, not to hide stock
    // that physically exists. One account archived a product holding 1,962
    // pieces and those pieces silently left the Stock screen.
    if (inStock !== 0) {
      Alert.alert(
        'Still holding stock',
        inStock > 0
          ? `${product?.name ?? 'This product'} still has ${pieces(inStock)} in stock. Sell them, or record the loss, before archiving — otherwise the count disappears from Stock while the bills stay.`
          : `${product?.name ?? 'This product'} shows ${pieces(Math.abs(inStock))} more sold than bought, which means a purchase is missing. Fix that before archiving.`,
        [{ text: 'OK' }],
      );
      return;
    }

    Alert.alert(
      'Archive product?',
      `${product?.name ?? 'This product'} will stop appearing on new bills. Past bills keep it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archive.mutateAsync(id);
              router.back();
            } catch (e) {
              Alert.alert('Could not archive', e instanceof Error ? e.message : 'Please try again.');
            }
          },
        },
      ],
    );
  }

  const busy = save.isPending || archive.isPending;

  return (
    <Screen>
      <FormHeader
        title={isNew ? 'New product' : 'Edit product'}
        subtitle={isNew ? undefined : product?.name}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        {!isNew && isPending ? (
          <LoadingState label="Loading product" />
        ) : !isNew && isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : 'Could not load this product.'}
            onRetry={refetch}
          />
        ) : (
          <>
            <ScrollScreen clearsTabBar={false} contentContainerStyle={styles.content}>
              <Card style={styles.group}>
                <Input
                  label="Name"
                  placeholder="Goat mat"
                  value={name}
                  onChangeText={setName}
                  error={nameError ?? undefined}
                  autoCapitalize="words"
                  editable={!busy}
                />
                <Input
                  label="Size"
                  placeholder="6 x 8 ft"
                  hint="Optional. Shown wherever the product is listed."
                  value={size}
                  onChangeText={setSize}
                  editable={!busy}
                />
                <Input
                  label="GSM"
                  placeholder="120"
                  keyboardType="number-pad"
                  value={gsm}
                  onChangeText={setGsm}
                  editable={!busy}
                />
                <Input
                  label="Colour"
                  placeholder="Green"
                  hint="Shown wherever this product is listed."
                  value={colour}
                  onChangeText={setColour}
                  autoCapitalize="words"
                  editable={!busy}
                />
                <Input
                  label="Specification"
                  placeholder="2x2 ft · 70 mm · 2.9 kg · 500 kg load"
                  hint="Printed under this item on the bill, so the buyer knows what they were handed."
                  value={spec}
                  onChangeText={setSpec}
                  multiline
                  textAlignVertical="top"
                  editable={!busy}
                />
              </Card>

              <Card style={styles.group}>
                <Input
                  label="Usual selling rate"
                  placeholder="0"
                  money
                  hint="Pre-filled on new sales. You can still change it per bill."
                  value={rate}
                  onChangeText={setRate}
                  editable={!busy}
                />
                <Input
                  label="Warn below"
                  placeholder="0"
                  keyboardType="number-pad"
                  hint="Home flags this product once stock falls to this many pieces."
                  value={lowStock}
                  onChangeText={setLowStock}
                  editable={!busy}
                />
              </Card>

              <Card style={styles.group}>
                <Input
                  label="Notes"
                  placeholder="Anything worth remembering"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  textAlignVertical="top"
                  editable={!busy}
                />
              </Card>

              {!isNew ? (
                <View style={styles.danger}>
                  <Text variant="caption" tone="muted">
                    Archiving hides the product from new bills. Nothing already recorded changes.
                  </Text>
                  <Button
                    label="Archive product"
                    variant="danger"
                    icon="archive"
                    onPress={handleArchive}
                    disabled={busy}
                  />
                </View>
              ) : null}
            </ScrollScreen>

            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <Button
                label={isNew ? 'Add product' : 'Save changes'}
                size="lg"
                fullWidth
                icon="check"
                loading={save.isPending}
                disabled={busy}
                onPress={handleSave}
              />
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.lg },
  group: { gap: spacing.lg },
  danger: { gap: spacing.md, paddingHorizontal: spacing.xs },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
