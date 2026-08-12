import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RowDivider } from '@/components/ui/list-row';
import { Text } from '@/components/ui/text';
import { pieces } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Picks the colour for one bill line.
 *
 * The list is whatever colours this account has already used, so there is no
 * setup screen to fill in first. A new one can be typed, which is the only way
 * a colour ever enters the list -- and the reason the existing ones are shown
 * as buttons rather than left to be retyped, since free text with no list
 * gives "Red", "red" and "RED" as three colours inside a month.
 */
export function ColourSheet({
  visible,
  colours,
  selected,
  stockFor,
  onSelect,
  onClose,
}: {
  visible: boolean;
  colours: string[];
  selected: string | null;
  /** Sales only: how many of that colour remain, shown beside each option. */
  stockFor?: (colour: string | null) => number | undefined;
  onSelect: (colour: string | null) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [adding, setAdding] = useState('');

  function close() {
    setAdding('');
    onClose();
  }

  function choose(colour: string | null) {
    setAdding('');
    onSelect(colour);
  }

  const typed = adding.trim();
  const isNew = typed !== '' && !colours.some((c) => c.toLowerCase() === typed.toLowerCase());

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.grabber} />

        <View style={styles.head}>
          <Text variant="heading">Colour</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          <ColourRow
            label="No colour"
            muted
            active={selected === null}
            onPress={() => choose(null)}
          />

          {colours.map((colour) => {
            const left = stockFor?.(colour);
            return (
              <View key={colour}>
                <RowDivider />
                <ColourRow
                  label={colour}
                  active={selected?.toLowerCase() === colour.toLowerCase()}
                  meta={left === undefined ? undefined : pieces(left)}
                  // Nothing left of that colour is worth seeing before it is
                  // picked, not after the quantity has been typed.
                  warn={left !== undefined && left <= 0}
                  onPress={() => choose(colour)}
                />
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Input
            placeholder="Add a colour"
            value={adding}
            onChangeText={setAdding}
            autoCapitalize="words"
            autoCorrect={false}
            onSubmitEditing={() => typed && choose(typed)}
          />
          {isNew ? (
            <Button label={`Use "${typed}"`} icon="plus" fullWidth onPress={() => choose(typed)} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ColourRow({
  label,
  meta,
  active,
  muted,
  warn,
  onPress,
}: {
  label: string;
  meta?: string;
  active: boolean;
  muted?: boolean;
  warn?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      android_ripple={{ color: 'rgba(15,23,32,0.06)' }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Text variant="bodyMedium" tone={muted ? 'muted' : 'default'} style={styles.rowLabel}>
        {label}
      </Text>
      {meta ? (
        <Text variant="caption" tone={warn ? 'danger' : 'muted'}>
          {meta}
        </Text>
      ) : null}
      {active ? <Feather name="check" size={18} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '78%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  rowPressed: { backgroundColor: colors.surfaceSunken },
  rowLabel: { flex: 1 },
  footer: {
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
