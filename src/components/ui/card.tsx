import { Pressable, type PressableProps, StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius, shadow, spacing } from '@/theme/tokens';

export type CardProps = ViewProps & {
  padded?: boolean;
  /** Flat cards sit inside another card or a section -- no shadow, no fighting. */
  flat?: boolean;
};

export function Card({ padded = true, flat = false, style, ...rest }: CardProps) {
  return (
    <View
      {...rest}
      style={[styles.card, padded && styles.padded, !flat && shadow.card, style]}
    />
  );
}

export type PressableCardProps = Omit<PressableProps, 'style'> & {
  padded?: boolean;
  style?: ViewProps['style'];
};

/** Same surface as Card, but tappable -- used for list rows and tiles. */
export function PressableCard({ padded = true, style, ...rest }: PressableCardProps) {
  return (
    <Pressable
      android_ripple={{ color: 'rgba(15,23,32,0.06)' }}
      style={({ pressed }) => [
        styles.card,
        padded && styles.padded,
        shadow.card,
        pressed && styles.pressed,
        style as object,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  padded: { padding: spacing.lg },
  pressed: { opacity: 0.94 },
});
