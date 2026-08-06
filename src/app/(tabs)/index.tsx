import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Badge,
  Card,
  ErrorState,
  ListRow,
  LoadingState,
  PageHeader,
  RowDivider,
  ScrollScreen,
  SectionHeader,
  StatCard,
  Text,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { money, moneyShort, pieces, prettyDate } from '@/lib/format';
import { useDashboard } from '@/lib/queries';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { member, signOut } = useAuth();
  const { data, isPending, isError, error, refetch, isRefetching } = useDashboard();

  const firstName = member?.full_name?.split(' ')[0] ?? 'there';

  return (
    <ScrollScreen
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}
      onRefresh={refetch}
      refreshing={isRefetching}>
      <PageHeader
        title={`Hi, ${firstName}`}
        subtitle={prettyDate(new Date())}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            hitSlop={10}
            onPress={signOut}
            style={styles.signOut}>
            <Feather name="log-out" size={18} color={colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={styles.actions}>
        <QuickAction
          label="New sale"
          icon="trending-up"
          tone="primary"
          onPress={() => router.push({ pathname: '/sales/[id]', params: { id: 'new' } })}
        />
        <QuickAction
          label="New purchase"
          icon="shopping-bag"
          tone="neutral"
          onPress={() => router.push({ pathname: '/purchases/[id]', params: { id: 'new' } })}
        />
      </View>

      {isPending ? (
        <LoadingState label="Loading today's numbers" />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Could not reach the server.'}
          onRetry={refetch}
        />
      ) : (
        <>
          <View style={styles.statGrid}>
            <StatCard
              label="Sold today"
              value={moneyShort(data.salesToday)}
              caption={`${data.salesCountToday} ${data.salesCountToday === 1 ? 'bill' : 'bills'}`}
              icon="trending-up"
              tone="success"
            />
            <StatCard
              label="Bought today"
              value={moneyShort(data.purchasesToday)}
              caption={`${data.purchaseCountToday} ${data.purchaseCountToday === 1 ? 'bill' : 'bills'}`}
              icon="shopping-bag"
              tone="info"
            />
          </View>

          <Card padded={false}>
            <View style={styles.cardHead}>
              <Text variant="overline" tone="muted">
                Outstanding
              </Text>
            </View>
            <RowDivider />
            <ListRow
              icon="arrow-down-left"
              title="To receive"
              subtitle="Customers owe us"
              value={money(data.receivable)}
              valueTone={data.receivable > 0 ? 'success' : 'muted'}
              onPress={() => router.push('/parties')}
            />
            <RowDivider />
            <ListRow
              icon="arrow-up-right"
              title="To pay"
              subtitle="We owe suppliers"
              value={money(data.payable)}
              valueTone={data.payable > 0 ? 'danger' : 'muted'}
              onPress={() => router.push('/parties')}
            />
          </Card>

          {data.lowStock.length > 0 ? (
            <>
              <SectionHeader
                title="Low stock"
                action={<Badge label={`${data.lowStock.length}`} tone="warning" />}
              />
              <Card padded={false}>
                {data.lowStock.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <RowDivider /> : null}
                    <ListRow
                      icon="alert-triangle"
                      title={item.name}
                      subtitle={[item.size, item.gsm ? `${item.gsm} GSM` : null]
                        .filter(Boolean)
                        .join(' · ')}
                      value={pieces(item.qty_left)}
                      valueTone={item.qty_left <= 0 ? 'danger' : 'default'}
                      chevron={false}
                    />
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}

function QuickAction({
  label,
  icon,
  tone,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  tone: 'primary' | 'neutral';
  onPress: () => void;
}) {
  const isPrimary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={{ color: isPrimary ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,32,0.06)' }}
      style={({ pressed }) => [
        styles.action,
        shadow.card,
        { backgroundColor: isPrimary ? colors.primary : colors.surface },
        !isPrimary && styles.actionOutlined,
        pressed && { opacity: 0.92 },
      ]}>
      <Feather name={icon} size={20} color={isPrimary ? colors.textInverse : colors.text} />
      <Text variant="bodyMedium" tone={isPrimary ? 'inverse' : 'default'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  signOut: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  actionOutlined: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statGrid: { flexDirection: 'row', gap: spacing.md },
  cardHead: { padding: spacing.lg, paddingBottom: spacing.md },
});
