import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme/tokens';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  style,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.track, style]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text variant="label" tone={active ? 'default' : 'secondary'} center>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
});
