import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';

import { colors, type as typeScale } from '@/theme/tokens';

type Variant = keyof typeof typeScale;
type Tone = 'default' | 'secondary' | 'muted' | 'inverse' | 'primary' | 'danger' | 'success' | 'warning';

const tones: Record<Tone, string> = {
  default: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  inverse: colors.textInverse,
  primary: colors.primary,
  danger: colors.danger,
  success: colors.moneyIn,
  warning: colors.warning,
};

export type TextProps = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
};

/**
 * The only text primitive in the app. Screens never set fontSize or color
 * directly -- they pick a variant and a tone.
 */
export function Text({ variant = 'body', tone = 'default', center, style, ...rest }: TextProps) {
  return (
    <RNText
      {...rest}
      style={[typeScale[variant], { color: tones[tone] }, center && styles.center, style]}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
