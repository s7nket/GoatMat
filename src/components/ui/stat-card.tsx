import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme/tokens';

type Tone = 'primary' | 'success' | 'danger' | 'info' | 'warning' | 'neutral';

const tones: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  success: { bg: colors.moneyInSoft, fg: colors.moneyIn },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  neutral: { bg: colors.surfaceSunken, fg: colors.textSecondary },
};

/**
 * Dashboard tile: one number, one label, one icon. Deliberately boring --
 * the value is the loudest thing on the card and everything else recedes.
 */
export function StatCard({
  label,
  value,
  caption,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  caption?: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  tone?: Tone;
}) {
  const t = tones[tone];
  return (
    <Card style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: t.bg }]}>
        <Feather name={icon} size={16} color={t.fg} />
      </View>
      <View style={styles.body}>
        <Text variant="label" tone="secondary" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="amountLarge" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {caption ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    gap: spacing.md,
    padding: spacing.lg,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: 2 },
});
