import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/** Circular initials avatar. Cheap identity cue in long party lists. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}>
      <Text variant="label" style={styles.avatarText}>
        {initials(name)}
      </Text>
    </View>
  );
}

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Right-aligned primary value -- usually money. */
  value?: string;
  valueTone?: 'default' | 'success' | 'danger' | 'muted';
  valueCaption?: string;
  leading?: React.ReactNode;
  icon?: React.ComponentProps<typeof Feather>['name'];
  onPress?: () => void;
  /** Show the chevron. Defaults to on whenever the row is pressable. */
  chevron?: boolean;
};

export function ListRow({
  title,
  subtitle,
  value,
  valueTone = 'default',
  valueCaption,
  leading,
  icon,
  onPress,
  chevron,
}: ListRowProps) {
  const showChevron = chevron ?? !!onPress;

  const content = (
    <>
      {leading ??
        (icon ? (
          <View style={styles.iconWrap}>
            <Feather name={icon} size={18} color={colors.textSecondary} />
          </View>
        ) : null)}

      <View style={styles.text}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <View style={styles.valueBlock}>
          <Text variant="amount" tone={valueTone === 'default' ? 'default' : valueTone}>
            {value}
          </Text>
          {valueCaption ? (
            <Text variant="caption" tone="muted">
              {valueCaption}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showChevron ? <Feather name="chevron-right" size={18} color={colors.textMuted} /> : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={{ color: 'rgba(15,23,32,0.06)' }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

/** Hairline between rows inside a Card. Never below the last row. */
export function RowDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 60,
  },
  pressed: { backgroundColor: colors.surfaceSunken },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 1 },
  valueBlock: { alignItems: 'flex-end', gap: 1 },
  avatar: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primaryPressed },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
});
