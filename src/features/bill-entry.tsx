import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Badge,
  Button,
  Card,
  FormHeader,
  Input,
  PickerSheet,
  ScrollScreen,
  Screen,
  SectionHeader,
  SelectField,
  Segmented,
  Text,
  type PickerOption,
} from '@/components/ui';
import type { PaymentMode } from '@/lib/database.types';
import { money, pieces, prettyDate, toISODate } from '@/lib/format';
import { useCreateBill } from '@/lib/mutations';
import { useParties, useProducts, useStock } from '@/lib/queries';
import { colors, radius, spacing } from '@/theme/tokens';

type Line = {
  /** Local row identity. Two lines can hold the same product at different rates. */
  key: string;
  productId: string;
  name: string;
  qty: string;
  rate: string;
};

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'credit', label: 'Udhaar' },
];

function toNumber(value: string): number {
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : 0;
}

export function BillEntry({ kind }: { kind: 'sale' | 'purchase' }) {
  const isSale = kind === 'sale';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const partyKind = isSale ? 'customer' : 'supplier';
  const { data: parties = [] } = useParties(partyKind);
  const { data: products = [] } = useProducts();
  const { data: stock = [] } = useStock();
  const createBill = useCreateBill(kind);

  const [partyId, setPartyId] = useState<string | null>(null);
  const [billDate, setBillDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [supplierRef, setSupplierRef] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [partyOpen, setPartyOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [errors, setErrors] = useState<{ party?: string; items?: string }>({});
  const submitting = useRef(false);

  const stockById = useMemo(
    () => new Map(stock.map((row) => [row.id, row.qty_left])),
    [stock],
  );

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + toNumber(line.qty) * toNumber(line.rate), 0),
    [lines],
  );

  // Cash, UPI and bank mean the bill is settled now. Udhaar means nothing was
  // paid unless the user types a part payment, so only that mode stays free.
  const paid = paymentMode === 'credit' ? toNumber(paidAmount) : total;
  const balance = total - paid;

  const partyName = parties.find((p) => p.id === partyId)?.name ?? null;

  const partyOptions: PickerOption[] = parties.map((party) => ({
    id: party.id,
    label: party.name,
    sublabel: party.phone ?? undefined,
  }));

  const productOptions: PickerOption[] = products.map((product) => {
    const left = stockById.get(product.id);
    return {
      id: product.id,
      label: product.name,
      sublabel: [product.size, product.gsm ? `${product.gsm} GSM` : null]
        .filter(Boolean)
        .join(' · '),
      meta: left === undefined ? undefined : pieces(left),
    };
  });

  function addLine(option: PickerOption) {
    const product = products.find((p) => p.id === option.id);
    setLines((current) => [
      ...current,
      {
        key: `${option.id}-${Date.now()}`,
        productId: option.id,
        name: option.label,
        qty: '1',
        // Purchases have no remembered buying rate -- that is the supplier's call.
        rate: isSale && product?.default_rate ? String(product.default_rate) : '',
      },
    ]);
    setProductOpen(false);
    setErrors((e) => ({ ...e, items: undefined }));
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function handleSave() {
    // The button disables itself once the mutation reports pending, but that is
    // a state update -- two taps inside the same tick both get through, and
    // each queues a job with its own id, so the idempotency key cannot help.
    if (submitting.current) return;

    const nextErrors: typeof errors = {};
    if (!partyId) nextErrors.party = `Choose a ${partyKind}.`;

    const usable = lines.filter((line) => toNumber(line.qty) > 0 && toNumber(line.rate) >= 0);
    if (usable.length === 0) nextErrors.items = 'Add at least one item with a quantity.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    submitting.current = true;
    try {
      await createBill.mutateAsync({
        partyId: partyId!,
        // Carried on the job so a queued bill can name its party without a
        // lookup -- the party itself may also still be unsent.
        partyName: partyName ?? 'Unknown',
        billDate: toISODate(billDate),
        paymentMode,
        paidAmount: paid,
        totalAmount: total,
        notes: notes.trim() || null,
        supplierRef: isSale ? null : supplierRef.trim() || null,
        items: usable.map((line) => ({
          product_id: line.productId,
          qty: Math.round(toNumber(line.qty)),
          rate: toNumber(line.rate),
        })),
      });
      router.back();
    } catch (e) {
      submitting.current = false;
      Alert.alert('Could not save bill', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  return (
    <Screen>
      <FormHeader title={isSale ? 'New sale' : 'New purchase'} subtitle={prettyDate(billDate)} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <ScrollScreen clearsTabBar={false} contentContainerStyle={styles.content}>
          <Card style={styles.group}>
            <SelectField
              label={isSale ? 'Customer' : 'Supplier'}
              icon="user"
              value={partyName}
              placeholder={`Choose a ${partyKind}`}
              error={errors.party}
              onPress={() => setPartyOpen(true)}
            />

            <SelectField
              label="Bill date"
              icon="calendar"
              value={prettyDate(billDate)}
              onPress={() => setShowDate(true)}
            />

            {!isSale ? (
              <Input
                label="Supplier's bill number"
                placeholder="Optional"
                value={supplierRef}
                onChangeText={setSupplierRef}
              />
            ) : null}
          </Card>

          <SectionHeader
            title="Items"
            action={
              <Button label="Add item" size="sm" icon="plus" onPress={() => setProductOpen(true)} />
            }
          />

          {lines.length === 0 ? (
            <Card style={styles.emptyItems}>
              <Feather name="package" size={20} color={colors.textMuted} />
              <Text variant="body" tone="secondary" center>
                No items yet. Add the mats {isSale ? 'being sold' : 'being bought'}.
              </Text>
              {errors.items ? (
                <Text variant="caption" tone="danger" center>
                  {errors.items}
                </Text>
              ) : null}
            </Card>
          ) : (
            <View style={styles.lines}>
              {lines.map((line) => {
                const qty = toNumber(line.qty);
                const left = stockById.get(line.productId) ?? 0;
                const short = isSale && qty > left;

                return (
                  <Card key={line.key} style={styles.line}>
                    <View style={styles.lineHead}>
                      <View style={styles.flex}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {line.name}
                        </Text>
                        {isSale ? (
                          <Text variant="caption" tone="muted">
                            {pieces(left)} in stock
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${line.name}`}
                        hitSlop={10}
                        onPress={() => removeLine(line.key)}>
                        <Feather name="trash-2" size={18} color={colors.danger} />
                      </Pressable>
                    </View>

                    <View style={styles.lineInputs}>
                      <Input
                        label="Pieces"
                        keyboardType="number-pad"
                        value={line.qty}
                        onChangeText={(text) => updateLine(line.key, { qty: text })}
                        containerStyle={styles.flex}
                      />
                      <Input
                        label="Rate each"
                        money
                        value={line.rate}
                        onChangeText={(text) => updateLine(line.key, { rate: text })}
                        containerStyle={styles.flex}
                      />
                    </View>

                    <View style={styles.lineFoot}>
                      {/* Selling more than you hold is allowed -- the purchase
                          may simply not be entered yet -- but it is flagged. */}
                      {short ? <Badge label="More than stock" tone="warning" /> : <View />}
                      <Text variant="amount">{money(qty * toNumber(line.rate))}</Text>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}

          <SectionHeader title="Payment" />

          <Card style={styles.group}>
            <Segmented value={paymentMode} onChange={setPaymentMode} options={PAYMENT_MODES} />

            {paymentMode === 'credit' ? (
              <Input
                label="Paid now"
                money
                placeholder="0"
                hint="Leave empty if nothing was paid yet."
                value={paidAmount}
                onChangeText={setPaidAmount}
              />
            ) : null}

            <View style={styles.totals}>
              <TotalRow label="Total" value={money(total)} strong />
              <TotalRow label="Paid" value={money(paid)} />
              <TotalRow
                label={isSale ? 'To receive' : 'To pay'}
                value={money(balance)}
                tone={balance > 0 ? (isSale ? 'success' : 'danger') : 'muted'}
              />
            </View>
          </Card>

          <Card>
            <Input
              label="Notes"
              placeholder="Optional"
              value={notes}
              onChangeText={setNotes}
              multiline
              textAlignVertical="top"
            />
          </Card>
        </ScrollScreen>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.footerTotal}>
            <Text variant="label" tone="secondary">
              {lines.length} {lines.length === 1 ? 'item' : 'items'}
            </Text>
            <Text variant="amountLarge">{money(total)}</Text>
          </View>
          <Button
            label={isSale ? 'Save sale' : 'Save purchase'}
            size="lg"
            icon="check"
            loading={createBill.isPending}
            onPress={handleSave}
            style={styles.saveButton}
          />
        </View>
      </KeyboardAvoidingView>

      <PickerSheet
        visible={partyOpen}
        title={isSale ? 'Choose customer' : 'Choose supplier'}
        options={partyOptions}
        selectedId={partyId}
        emptyMessage={`No ${partyKind}s yet. Add one first.`}
        createLabel={`Add ${partyKind}`}
        onCreate={() => {
          setPartyOpen(false);
          router.push({ pathname: '/parties/new', params: { kind: partyKind } });
        }}
        onSelect={(option) => {
          setPartyId(option.id);
          setPartyOpen(false);
          setErrors((e) => ({ ...e, party: undefined }));
        }}
        onClose={() => setPartyOpen(false)}
      />

      <PickerSheet
        visible={productOpen}
        title="Add item"
        options={productOptions}
        emptyMessage="No products yet. Add one first."
        createLabel="Add product"
        onCreate={() => {
          setProductOpen(false);
          router.push({ pathname: '/products/[id]', params: { id: 'new' } });
        }}
        onSelect={addLine}
        onClose={() => setProductOpen(false)}
      />

      {showDate ? (
        <DateTimePicker
          value={billDate}
          mode="date"
          // Backdating is normal -- bills get entered days late. Future dates
          // are always a typo.
          maximumDate={new Date()}
          onValueChange={(_event, selected) => {
            setShowDate(false);
            if (selected) setBillDate(selected);
          }}
          onDismiss={() => setShowDate(false)}
        />
      ) : null}
    </Screen>
  );
}

function TotalRow({
  label,
  value,
  strong,
  tone = 'default',
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'default' | 'success' | 'danger' | 'muted';
}) {
  return (
    <View style={styles.totalRow}>
      <Text variant={strong ? 'bodyMedium' : 'body'} tone="secondary">
        {label}
      </Text>
      <Text variant="amount" tone={tone}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.lg },
  group: { gap: spacing.lg },
  emptyItems: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing['2xl'] },
  lines: { gap: spacing.md },
  line: { gap: spacing.md },
  lineHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  lineInputs: { flexDirection: 'row', gap: spacing.md },
  lineFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  totals: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerTotal: { gap: 1 },
  saveButton: { flex: 1 },
});
