import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { colors, HIT_SIZE, radius, spacing } from '@/theme/tokens';

/**
 * Header for pushed screens. The app draws its own rather than using the
 * navigator's, so every screen shares one type scale and one back affordance.
 */
export function FormHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function goBack() {
    if (onBack) return onBack();
    // Deep-linked straight into this screen: there is nothing to pop.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={goBack}
        hitSlop={8}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Feather name="arrow-left" size={20} color={colors.text} />
      </Pressable>

      <View style={styles.titles}>
        <Text variant="heading" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: HIT_SIZE - 4,
    height: HIT_SIZE - 4,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  titles: { flex: 1, gap: 1 },
});
