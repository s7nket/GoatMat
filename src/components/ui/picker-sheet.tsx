import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RowDivider } from '@/components/ui/list-row';
import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme/tokens';

export type PickerOption = {
  id: string;
  label: string;
  sublabel?: string;
  /** Right-aligned hint, e.g. stock on hand or a pending balance. */
  meta?: string;
};

/**
 * Bottom sheet for choosing a party or product. Search appears only once the
 * list is long enough to need it -- with four suppliers a search box is noise.
 */
export function PickerSheet({
  visible,
  title,
  options,
  selectedId,
  onSelect,
  onClose,
  emptyMessage,
  createLabel,
  onCreate,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string | null;
  onSelect: (option: PickerOption) => void;
  onClose: () => void;
  emptyMessage?: string;
  createLabel?: string;
  onCreate?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(term) ||
        option.sublabel?.toLowerCase().includes(term),
    );
  }, [options, search]);

  function close() {
    setSearch('');
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.grabber} />

        <View style={styles.head}>
          <Text variant="heading">{title}</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {options.length > 6 ? (
          <View style={styles.search}>
            <Input
              icon="search"
              placeholder="Search"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="body" tone="secondary" center>
              {search ? `Nothing matches "${search}".` : (emptyMessage ?? 'Nothing to choose yet.')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={RowDivider}
            style={styles.list}
            renderItem={({ item }) => {
              const active = item.id === selectedId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  android_ripple={{ color: 'rgba(15,23,32,0.06)' }}
                  onPress={() => {
                    setSearch('');
                    onSelect(item);
                  }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={styles.rowText}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.sublabel ? (
                      <Text variant="caption" tone="secondary" numberOfLines={1}>
                        {item.sublabel}
                      </Text>
                    ) : null}
                  </View>

                  {item.meta ? (
                    <Text variant="caption" tone="muted">
                      {item.meta}
                    </Text>
                  ) : null}

                  {active ? <Feather name="check" size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        )}

        {createLabel && onCreate ? (
          <View style={styles.footer}>
            <Button
              label={createLabel}
              variant="secondary"
              icon="plus"
              fullWidth
              onPress={() => {
                setSearch('');
                onCreate();
              }}
            />
          </View>
        ) : null}
      </View>
    </Modal>
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
  search: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  rowPressed: { backgroundColor: colors.surfaceSunken },
  rowText: { flex: 1, gap: 1 },
  empty: { padding: spacing['3xl'] },
  footer: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
