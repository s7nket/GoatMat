import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme/tokens';

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Feather name={icon} size={26} color={colors.textMuted} />
      </View>
      <View style={styles.text}>
        <Text variant="heading" center>
          {title}
        </Text>
        {message ? (
          <Text variant="body" tone="secondary" center>
            {message}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" icon="plus" />
      ) : null}
    </View>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator color={colors.primary} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
        <Feather name="alert-triangle" size={24} color={colors.danger} />
      </View>
      <View style={styles.text}>
        <Text variant="heading" center>
          Something went wrong
        </Text>
        <Text variant="body" tone="secondary" center>
          {message}
        </Text>
      </View>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" icon="refresh-cw" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { gap: spacing.xs, maxWidth: 320 },
});
