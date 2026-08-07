import Feather from '@expo/vector-icons/Feather';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useOffline } from '@/lib/offline';
import { colors, spacing } from '@/theme/tokens';

/**
 * A thin strip above the whole app. Deliberately calm: being offline is a
 * normal state here, not an error, and the app keeps working through it.
 * Nothing is shown when online with an empty queue.
 */
export function OfflineBanner() {
  const { online, pending, syncing } = useOffline();

  if (online && pending.length === 0) return null;

  const count = pending.length;
  const plural = count === 1 ? '' : 's';

  if (!online) {
    return (
      <View style={[styles.bar, styles.offline]}>
        <Feather name="wifi-off" size={13} color={colors.warning} />
        <Text variant="caption" style={{ color: colors.warning }}>
          {count > 0
            ? `Offline · ${count} change${plural} waiting to send`
            : 'Offline · showing saved data'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.bar, styles.syncing]}>
      {syncing ? (
        <ActivityIndicator size="small" color={colors.info} />
      ) : (
        <Feather name="upload-cloud" size={13} color={colors.info} />
      )}
      <Text variant="caption" style={{ color: colors.info }}>
        {syncing ? `Sending ${count} change${plural}…` : `${count} change${plural} to send`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  offline: { backgroundColor: colors.warningSoft },
  syncing: { backgroundColor: colors.infoSoft },
});
