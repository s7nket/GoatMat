import { Feather } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, HIT_SIZE, radius, shadow, spacing } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  icon?: React.ComponentProps<typeof Feather>['name'];
  iconRight?: React.ComponentProps<typeof Feather>['name'];
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

const heights: Record<Size, number> = { sm: 36, md: HIT_SIZE, lg: 52 };
const iconSizes: Record<Size, number> = { sm: 15, md: 17, lg: 19 };

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const v = variants[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      android_ripple={{ color: v.ripple, borderless: false }}
      style={({ pressed }) => [
        styles.base,
        { height: heights[size], backgroundColor: v.bg, borderColor: v.border },
        variant === 'primary' && shadow.card,
        fullWidth && styles.fullWidth,
        // iOS has no ripple, so it gets an opacity press state instead.
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Feather name={icon} size={iconSizes[size]} color={v.fg} /> : null}
          <Text
            variant={size === 'sm' ? 'label' : 'bodyMedium'}
            style={{ color: v.fg }}
            numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Feather name={iconRight} size={iconSizes[size]} color={v.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const variants = {
  primary: {
    bg: colors.primary,
    fg: colors.textInverse,
    border: 'transparent',
    ripple: 'rgba(255,255,255,0.22)',
  },
  secondary: {
    bg: colors.surface,
    fg: colors.text,
    border: colors.border,
    ripple: 'rgba(15,23,32,0.08)',
  },
  ghost: {
    bg: 'transparent',
    fg: colors.primary,
    border: 'transparent',
    ripple: 'rgba(19,122,76,0.12)',
  },
  danger: {
    bg: colors.dangerSoft,
    fg: colors.danger,
    border: 'transparent',
    ripple: 'rgba(220,38,38,0.16)',
  },
} as const;

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fullWidth: { alignSelf: 'stretch' },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.45 },
});
