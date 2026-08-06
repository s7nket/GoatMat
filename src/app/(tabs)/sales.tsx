import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, PageHeader, ScrollScreen } from '@/components/ui';
import { spacing } from '@/theme/tokens';

export default function SalesScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollScreen contentContainerStyle={{ paddingTop: insets.top + spacing.sm }}>
      <PageHeader title="Sales" subtitle="Bills raised to customers" />
      <EmptyState
        icon="trending-up"
        title="Sale entry lands in phase 2"
        message="Pick a customer, add mats by piece, save. A PDF kaccha bill follows in phase 3."
      />
    </ScrollScreen>
  );
}
