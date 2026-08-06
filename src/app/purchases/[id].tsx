import { useLocalSearchParams } from 'expo-router';

import { BillDetail } from '@/features/bill-detail';
import { BillEntry } from '@/features/bill-entry';

export default function PurchaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === 'new' ? <BillEntry kind="purchase" /> : <BillDetail kind="purchase" id={id} />;
}
