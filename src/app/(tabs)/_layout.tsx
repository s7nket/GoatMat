import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { Button, ErrorState, LoadingState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, fontFamily, spacing } from '@/theme/tokens';

export default function TabsLayout() {
  const { profileStatus, session, signOut, refreshProfile } = useAuth();

  // Signed in, but the profile is missing or switched off. RLS denies every
  // query in that state, so say so plainly instead of showing five empty
  // screens.
  //
  // A failed request is a separate case on purpose: a dead signal must never
  // read as "you have no access".
  if (profileStatus === 'checking') {
    return (
      <Screen>
        <LoadingState label="Checking access" />
      </Screen>
    );
  }

  if (profileStatus === 'denied') {
    return <NoAccessScreen onSignOut={signOut} email={session?.user.email} />;
  }

  if (profileStatus === 'error') {
    return (
      <Screen>
        <ErrorState
          message="Could not confirm your access. Check the connection and try again."
          onRetry={refreshProfile}
        />
      </Screen>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: 'Sales',
          tabBarIcon: ({ color, size }) => (
            <Feather name="trending-up" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="purchases"
        options={{
          title: 'Purchases',
          tabBarIcon: ({ color, size }) => (
            <Feather name="shopping-bag" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="parties"
        options={{
          title: 'Parties',
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="area"
        options={{
          title: 'Area',
          tabBarIcon: ({ color, size }) => <Feather name="grid" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Stock',
          tabBarIcon: ({ color, size }) => <Feather name="package" size={size - 2} color={color} />,
        }}
      />
    </Tabs>
  );
}

function NoAccessScreen({ email, onSignOut }: { email?: string; onSignOut: () => void }) {
  return (
    <Screen>
      <View style={styles.blocked}>
        <View style={styles.blockedIcon}>
          <Feather name="user-x" size={26} color={colors.warning} />
        </View>
        <Text variant="title" center>
          No access
        </Text>
        <Text variant="body" tone="secondary" center>
          {email ? `${email} signed in, but this account ` : 'This account '}
          has been switched off. Contact whoever set up the app for you.
        </Text>
        <Button label="Sign out" variant="secondary" icon="log-out" onPress={onSignOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.select({ android: 64, default: 84 }),
    paddingTop: spacing.sm,
    paddingBottom: Platform.select({ android: spacing.sm, default: spacing['2xl'] }),
    elevation: 0,
  },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  item: { paddingVertical: 2 },
  blocked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing['2xl'],
  },
  blockedIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
