import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, PageHeader, ScrollScreen } from '@/components/ui';
import { spacing } from '@/theme/tokens';

export default function PurchasesScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollScreen contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}>
      <PageHeader title="Purchases" subtitle="Stock bought from suppliers" />
      <EmptyState
        icon="shopping-bag"
        title="Purchase entry lands in phase 2"
        message="Saving a purchase raises stock automatically — stock is derived, never typed in."
      />
    </ScrollScreen>
  );
}
