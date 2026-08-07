import Feather from '@expo/vector-icons/Feather';
import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, fontFamily, HIT_SIZE, radius, spacing, type as typeScale } from '@/theme/tokens';

export type InputProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  /** Renders a ₹ prefix and switches to a numeric keypad. */
  money?: boolean;
  containerStyle?: ViewStyle;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, icon, money, containerStyle, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <Text variant="label" tone="secondary" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
          rest.multiline && styles.fieldMultiline,
        ]}>
        {icon ? (
          <Feather name={icon} size={17} color={focused ? colors.primary : colors.textMuted} />
        ) : null}
        {money ? <Text variant="bodyMedium" tone="secondary">₹</Text> : null}

        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          keyboardType={money ? 'decimal-pad' : rest.keyboardType}
          selectionColor={colors.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, money && styles.inputMoney, style]}
          {...rest}
        />
      </View>

      {error ? (
        <Text variant="caption" tone="danger" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

/**
 * A field that opens a picker instead of a keyboard (party, product, date).
 * Looks identical to Input so forms stay visually uniform.
 */
export function SelectField({
  label,
  value,
  placeholder = 'Select',
  icon,
  error,
  onPress,
  containerStyle,
}: {
  label?: string;
  value?: string | null;
  placeholder?: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  error?: string;
  onPress: () => void;
  containerStyle?: ViewStyle;
}) {
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <Text variant="label" tone="secondary" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        android_ripple={{ color: 'rgba(15,23,32,0.06)' }}
        style={({ pressed }) => [
          styles.field,
          !!error && styles.fieldError,
          pressed && { opacity: 0.9 },
        ]}>
        {icon ? <Feather name={icon} size={17} color={colors.textMuted} /> : null}
        <Text
          variant="body"
          tone={value ? 'default' : 'muted'}
          numberOfLines={1}
          style={styles.selectValue}>
          {value || placeholder}
        </Text>
        <Feather name="chevron-down" size={17} color={colors.textMuted} />
      </Pressable>

      {error ? (
        <Text variant="caption" tone="danger" style={styles.helper}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { marginLeft: 2 },
  field: {
    minHeight: HIT_SIZE + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySofter,
  },
  fieldError: { borderColor: colors.danger },
  fieldMultiline: {
    minHeight: 96,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: typeScale.body.fontSize,
  },
  inputMoney: {
    fontFamily: fontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  selectValue: { flex: 1 },
  helper: { marginLeft: 2 },
});
