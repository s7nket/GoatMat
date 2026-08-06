import {
  Platform,
  RefreshControl,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { colors, spacing } from '@/theme/tokens';

/** Extra bottom room so the last row never hides under the tab bar. */
const TAB_BAR_CLEARANCE = 96;

export type ScreenProps = ViewProps & {
  /** Paints the page background. Set false when a screen supplies its own. */
  tinted?: boolean;
};

export function Screen({ tinted = true, style, ...rest }: ScreenProps) {
  return <View {...rest} style={[styles.screen, tinted && styles.tinted, style]} />;
}

export type ScrollScreenProps = ScrollViewProps & {
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Adds bottom padding to clear the tab bar. On by default. */
  clearsTabBar?: boolean;
};

export function ScrollScreen({
  onRefresh,
  refreshing = false,
  clearsTabBar = true,
  contentContainerStyle,
  ...rest
}: ScrollScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        ) : undefined
      }
      style={styles.tinted}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingBottom: (clearsTabBar ? TAB_BAR_CLEARANCE : spacing.xl) + insets.bottom,
        },
        contentContainerStyle,
      ]}
      {...rest}
    />
  );
}

/** Screen title block. Used at the top of each tab instead of a chrome header. */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderText}>
        <Text variant="display" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Small caps label that opens a group of rows or cards. */
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tinted: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.select({ android: spacing.sm, default: 0 }),
    gap: spacing.lg,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  pageHeaderText: { flex: 1, gap: 2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -spacing.sm,
  },
});
