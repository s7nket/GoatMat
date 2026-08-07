// Imported per weight, not from the package root. The root index references
// every weight and italic, and Metro bundles each one it can see -- roughly
// 6 MB of fonts the app never renders.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/ui/offline-banner';
import { AuthProvider, useAuth } from '@/lib/auth';
import { OfflineProvider } from '@/lib/offline';
import { persister, queryClient } from '@/lib/query-client';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 30 * 24 * 60 * 60 * 1000,
          // Bump this and every phone drops its cache on next launch. Needed
          // whenever a query's shape changes, so rehydrated data can never be
          // read with the wrong assumptions.
          buster: 'v1',
        }}>
        <AuthProvider>
          <OfflineProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </OfflineProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();

  // Hold the splash until we know whether a stored session exists, so the app
  // never flashes the sign-in screen at an already-logged-in user.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  return (
    <>
      {session ? <OfflineBanner /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="products/index" />
          <Stack.Screen name="products/[id]" />
          <Stack.Screen name="parties/[id]" />
          <Stack.Screen name="sales/[id]" />
          <Stack.Screen name="purchases/[id]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="reports" />
        </Stack.Protected>

        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
