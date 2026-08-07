import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Phone data plans are metered and the dataset is tiny -- refetch on focus
      // is off, and screens pull-to-refresh when the user actually wants it.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
      // Cached results must outlive the process, otherwise there is nothing to
      // rehydrate at launch and the app is blank with no signal.
      gcTime: 30 * 24 * 60 * 60 * 1000,
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'goatmat.query-cache.v1',
  // Writing the whole cache on every keystroke-driven refetch would thrash
  // storage; a second of quiet is plenty.
  throttleTime: 1000,
});

const LAST_USER_KEY = 'goatmat.last-user';

/**
 * The cache holds one business's books and survives a restart, so it has to be
 * thrown away when the account changes. Without this, signing in as someone
 * else rehydrates the previous owner's business name, products and bills and
 * shows them until every screen has refetched -- which is both wrong and, now
 * that accounts are separate businesses, a disclosure.
 *
 * Returns true if the cache was dropped.
 */
export async function resetCacheOnUserChange(userId: string | null): Promise<boolean> {
  const previous = await AsyncStorage.getItem(LAST_USER_KEY);
  if (previous === (userId ?? null)) return false;

  queryClient.clear();
  await persister.removeClient();

  if (userId) await AsyncStorage.setItem(LAST_USER_KEY, userId);
  else await AsyncStorage.removeItem(LAST_USER_KEY);

  return true;
}
